import type { VacationEntry } from "@/types/database"
import { toLocalDateStr } from "@/lib/utils"

export interface HauptberichtRow {
  projektNr: string
  kunde: string      // "ClientName" or "ClientName (ProjectName)"
  code: string
  daily: number[]    // length 31, index 0 = day 1
  summe: number
}

export interface AbsenceRow {
  projektNr: string  // "000001"…"000006"
  beschreibung: string
  daily: number[]    // length 31
  summe: number
}

export interface HauptberichtData {
  mitarbeiter: string
  year: number
  month: number
  monthLabel: string
  daysInMonth: number
  targetHours: number
  vacationQuota: number
  vacationTakenYTD: number
  vacationThisMonth: number
  projectRows: HauptberichtRow[]
  absenceRows: AbsenceRow[]
  dailySumme: number[]  // length 31
  gesamtSumme: number
}

const DE_MONTHS = [
  "Januar","Februar","März","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Dezember",
]

function countWorkingDays(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildHauptberichtData(supabase: any, userId: string, year: number, month: number): Promise<HauptberichtData> {
  const first = `${year}-${month.toString().padStart(2, "0")}-01`
  const last = toLocalDateStr(new Date(year, month, 0))
  const daysInMonth = new Date(year, month, 0).getDate()

  const [profileRes, entriesRes, vacRes] = await Promise.all([
    supabase.from("users_profile").select("name, working_hours_per_day, vacation_quota").eq("user_id", userId).single(),
    supabase
      .from("time_entries")
      .select("date, net_h, client_id, project_id, code, client:clients(name, client_nr), project:projects(name, project_nr)")
      .eq("user_id", userId).gte("date", first).lte("date", last).order("date"),
    supabase
      .from("vacation_entries")
      .select("*").eq("user_id", userId)
      .gte("date_from", `${year}-01-01`).lte("date_from", last),
  ])

  const profile = profileRes.data
  const entries = (entriesRes.data ?? []) as {
    date: string; net_h: number; client_id: string; project_id: string; code: string
    client: { name: string; client_nr: string | null } | null
    project: { name: string; project_nr: string | null } | null
  }[]
  const vacEntries = (vacRes.data ?? []) as VacationEntry[]

  const workingDays = countWorkingDays(year, month)
  const targetHours = workingDays * (profile?.working_hours_per_day ?? 8)

  // ── Project rows: group by (client_id, project_id, code) ──
  type RowKey = string
  const rowMap = new Map<RowKey, HauptberichtRow>()

  for (const e of entries) {
    const key: RowKey = `${e.client_id}||${e.project_id}||${e.code}`
    if (!rowMap.has(key)) {
      const clientName = e.client?.name ?? ""
      const projectName = e.project?.name ?? ""
      const projektNr = e.project?.project_nr ?? e.client?.client_nr ?? "000000"
      const kunde = projectName && projectName !== clientName ? `${clientName} (${projectName})` : clientName
      rowMap.set(key, { projektNr, kunde, code: e.code, daily: new Array(31).fill(0), summe: 0 })
    }
    const row = rowMap.get(key)!
    const day = parseInt(e.date.slice(8, 10), 10) - 1  // 0-indexed
    row.daily[day] += e.net_h
    row.summe += e.net_h
  }
  const projectRows = Array.from(rowMap.values())

  // ── Daily summe ──────────────────────────────────────────
  const dailySumme = new Array(31).fill(0)
  for (const row of projectRows) {
    for (let d = 0; d < 31; d++) dailySumme[d] += row.daily[d]
  }
  const gesamtSumme = projectRows.reduce((s, r) => s + r.summe, 0)

  // ── Vacation: YTD + this month ───────────────────────────
  function daysInRange(from: string, to: string, mFirst: string, mLast: string): number {
    const s = from > mFirst ? from : mFirst
    const e = to < mLast ? to : mLast
    if (s > e) return 0
    let count = 0
    const cur = new Date(s + "T00:00:00")
    const end = new Date(e + "T00:00:00")
    while (cur <= end) { const d = cur.getDay(); if (d !== 0 && d !== 6) count++; cur.setDate(cur.getDate() + 1) }
    return count
  }

  const annualEntries = vacEntries.filter(v => v.type === "annual")
  const yearStart = `${year}-01-01`
  // "bereits erhalten": working days in annual vacation entries before this month
  const prevMonthLast = toLocalDateStr(new Date(year, month - 1, 0))
  const vacationTakenYTD = annualEntries.reduce((s, v) => s + daysInRange(v.date_from, v.date_to, yearStart, prevMonthLast), 0)
  // "lfd. Mon.": working days in annual vacation entries within this month
  const vacationThisMonth = annualEntries.reduce((s, v) => s + daysInRange(v.date_from, v.date_to, first, last), 0)

  // ── Absence rows (per-day) ───────────────────────────────
  const absenceConfig = [
    { nr: "000001", label: "Jahresurlaub",           type: "annual" as const },
    { nr: "000002", label: "Sonderurlaub",           type: "special" as const },
    { nr: "000003", label: "Krankheit",              type: "illness" as const },
    { nr: "000004", label: "Ausbildung / Schulungen",type: "training" as const },
    { nr: "000005", label: "Überstundenabbau",       type: null },
    { nr: "000006", label: "Verwaltung",             type: null },
  ]

  const absenceRows: AbsenceRow[] = absenceConfig.map(cfg => {
    const daily = new Array(31).fill(0)
    if (cfg.type) {
      for (const v of vacEntries.filter(e => e.type === cfg.type)) {
        const rangeStart = v.date_from > first ? v.date_from : first
        const rangeEnd = v.date_to < last ? v.date_to : last
        if (rangeStart > rangeEnd) continue
        const cur = new Date(rangeStart + "T00:00:00")
        const end = new Date(rangeEnd + "T00:00:00")
        while (cur <= end) {
          const dow = cur.getDay()
          if (dow !== 0 && dow !== 6) {
            const d = cur.getDate() - 1
            daily[d] += 1
          }
          cur.setDate(cur.getDate() + 1)
        }
      }
    }
    const summe = daily.reduce((s, v) => s + v, 0)
    return { projektNr: cfg.nr, beschreibung: cfg.label, daily, summe }
  })

  return {
    mitarbeiter: profile?.name ?? "",
    year, month,
    monthLabel: `${DE_MONTHS[month - 1]} ${year}`,
    daysInMonth,
    targetHours,
    vacationQuota: profile?.vacation_quota ?? 0,
    vacationTakenYTD,
    vacationThisMonth,
    projectRows,
    absenceRows,
    dailySumme,
    gesamtSumme,
  }
}
