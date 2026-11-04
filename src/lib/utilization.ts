import { toLocalDateStr } from "@/lib/utils"
import type { UtilizationTile } from "@/types/database"

/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase-Query-Builder ist hier bewusst untypisiert (wie in booking-items.ts) */
type QueryClient = {
  from: (table: string) => any
}

export type TileUsage = { consumedH: number; effectiveBudget: number }

export function getDateRange(period: "total" | "monthly" | "range", selectedMonth: string, tile?: UtilizationTile) {
  if (period === "total") return { gte: undefined, lte: undefined }
  if (period === "range") return { gte: tile?.date_from, lte: tile?.date_to }
  const [y, m] = selectedMonth.split("-").map(Number)
  return {
    gte: `${y}-${String(m).padStart(2, "0")}-01`,
    lte: toLocalDateStr(new Date(y, m, 0)),
  }
}

function applyEntityFilter(q: any, tile: UtilizationTile) {
  if (tile.type === "project") return q.eq("project_id", tile.entity_id)
  if (tile.type === "task") return q.eq("task_id", tile.entity_id)
  return q.or(`booking_item_text.eq.${tile.entity_id},vermittler_booking_item_text.eq.${tile.entity_id}`)
}

/** Früheres von zwei YYYY-MM-DD-Daten; ein fehlendes Datum zählt als „unbegrenzt“. */
function earlierDate(a?: string, b?: string) {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

/** Folgemonat von `month` (YYYY-MM). */
function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

/**
 * Übertrag aus den Vormonaten von `month` (YYYY-MM).
 * Ab dem ersten Monat mit Buchung zählt jeder Kalendermonat, auch ohne Buchung.
 */
export function computeCarryAmount(monthlyBudgetH: number, hoursByMonth: Record<string, number>, month: string) {
  const firstMonth = Object.keys(hoursByMonth).sort()[0]
  if (!firstMonth) return 0
  let carry = 0
  for (let m = firstMonth; m < month; m = nextMonth(m)) {
    carry = Math.max(0, monthlyBudgetH + carry - (hoursByMonth[m] ?? 0))
  }
  return carry
}

async function computeCarryOver(
  supabase: QueryClient,
  userId: string,
  tile: UtilizationTile,
  selectedMonth: string,
  asOf?: string,
): Promise<TileUsage> {
  const [year, month] = selectedMonth.split("-").map(Number)
  const endDate = earlierDate(toLocalDateStr(new Date(year, month, 0)), asOf)

  let q = supabase
    .from("time_entries")
    .select("date, net_h")
    .eq("user_id", userId)
    .lte("date", endDate)
  q = applyEntityFilter(q, tile)

  const { data } = await q

  const byMonth: Record<string, number> = {}
  for (const row of (data ?? []) as { date: string; net_h: number }[]) {
    const key = row.date.slice(0, 7)
    byMonth[key] = (byMonth[key] ?? 0) + row.net_h
  }

  return {
    consumedH: byMonth[selectedMonth] ?? 0,
    effectiveBudget: tile.budget_h + computeCarryAmount(tile.budget_h, byMonth, selectedMonth),
  }
}

/**
 * Verbrauch + effektives Budget einer Kachel für den Monat `selectedMonth` (YYYY-MM).
 * Mit `asOf` (YYYY-MM-DD) zählen nur Stunden bis einschließlich dieses Stichtags.
 */
export async function computeTileUsage(
  supabase: QueryClient,
  userId: string,
  tile: UtilizationTile,
  selectedMonth: string,
  asOf?: string,
): Promise<TileUsage> {
  if (tile.period === "monthly" && tile.carry_over) {
    return computeCarryOver(supabase, userId, tile, selectedMonth, asOf)
  }
  let q = supabase.from("time_entries").select("net_h").eq("user_id", userId)
  q = applyEntityFilter(q, tile)
  const { gte, lte } = getDateRange(tile.period, selectedMonth, tile)
  const end = earlierDate(lte, asOf)
  if (gte) q = q.gte("date", gte)
  if (end) q = q.lte("date", end)
  const { data } = await q
  const consumedH = ((data ?? []) as { net_h: number }[]).reduce((acc, row) => acc + row.net_h, 0)
  return { consumedH, effectiveBudget: tile.budget_h }
}

export type FreeBudget = { freeH: number; freePct: number }

export function toFreeBudget(usage: TileUsage): FreeBudget {
  const freeH = usage.effectiveBudget - usage.consumedH
  const freePct = usage.effectiveBudget > 0 ? Math.round((freeH / usage.effectiveBudget) * 100) : 0
  return { freeH, freePct }
}
