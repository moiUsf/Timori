import type { TaetigkeitField } from "@/types/database"
export { TaetigkeitField }

export const DEFAULT_TAETIGKEIT_FIELDS: TaetigkeitField[] = ["booking_item", "task", "description", "project"]

export interface FetchedEntry {
  id: string
  date: string
  time_from: string
  time_to: string
  break_min: number
  gross_h: number
  net_h: number
  booking_item_text: string
  description: string
  project: { name: string } | null
  task: { name: string } | null
}

export interface ReportDayEntry {
  time_from: string
  time_to: string
  taetigkeitText: string
  gross_h: number
  break_min: number
  net_h: number
}

export interface ReportDay {
  date: string
  weekday: string    // "Mo"
  dayLabel: string   // "02. Mrz"
  isWeekend: boolean
  entries: ReportDayEntry[]
  tagesNetto: number // sum of net_h for all entries this day
}

export interface BuchungskontoRow {
  label: string
  stunden: number
}

export interface PreviewRow {
  id: string              // time_entry id; "" for empty/weekend placeholder
  date: string
  weekday: string
  dayLabel: string
  von: string             // "HH:MM"
  bis: string             // "HH:MM"
  originalVon: string
  originalBis: string
  taetigkeit: string
  break_min: number
  brutto: number
  netto: number
  tagesNetto: number
  vonDirty: boolean
  bisDirty: boolean
  isWeekend: boolean
}

export interface ReportData {
  mitarbeiter: string
  mitarbeiterNr: string
  kunde: string
  kundenNr: string
  monatLabel: string   // "März 2026"
  year: number
  month: number
  days: ReportDay[]
  buchungskonten: BuchungskontoRow[]
  gesamtNetto: number
}

const DE_MONTHS = [
  "Januar","Februar","März","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Dezember",
]
const DE_MONTH_ABBR = [
  "Jan","Feb","Mrz","Apr","Mai","Jun",
  "Jul","Aug","Sep","Okt","Nov","Dez",
]
const DE_WEEKDAYS = ["So","Mo","Di","Mi","Do","Fr","Sa"]

function buildTaetigkeitText(entry: FetchedEntry, fields: TaetigkeitField[] = DEFAULT_TAETIGKEIT_FIELDS): string {
  const fieldMap: Record<TaetigkeitField, string | undefined> = {
    booking_item: entry.booking_item_text || undefined,
    task: entry.task?.name || undefined,
    description: entry.description || undefined,
    project: entry.project?.name || undefined,
  }
  const parts = fields.map(f => fieldMap[f]).filter((v): v is string => !!v)
  return parts.join(" - ")
}

function parseHM(s: string): number {
  if (!s || !s.includes(":")) return 0
  const [h, m] = s.split(":").map(Number)
  return h + (m ?? 0) / 60
}

export function calcBrutto(von: string, bis: string): number {
  const v = parseHM(von)
  const b = parseHM(bis)
  return b > v ? Math.round((b - v) * 10) / 10 : 0
}

export function recalcTagesNetto(rows: PreviewRow[]): PreviewRow[] {
  const dateNetto = new Map<string, number>()
  for (const r of rows) {
    if (r.id) dateNetto.set(r.date, (dateNetto.get(r.date) ?? 0) + r.netto)
  }
  return rows.map(r => ({ ...r, tagesNetto: dateNetto.get(r.date) ?? 0 }))
}

export function buildPreviewRows(
  entries: FetchedEntry[],
  year: number,
  month: number,
  fields: TaetigkeitField[],
): PreviewRow[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const rows: PreviewRow[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`
    const dateObj = new Date(dateStr + "T00:00:00")
    const dow = dateObj.getDay()
    const isWeekend = dow === 0 || dow === 6
    const weekday = DE_WEEKDAYS[dow]
    const dayLabel = `${d.toString().padStart(2, "0")}. ${DE_MONTH_ABBR[month - 1]}`
    const dayEntries = entries.filter(e => e.date === dateStr)

    if (dayEntries.length === 0) {
      rows.push({ id: "", date: dateStr, weekday, dayLabel, von: "", bis: "",
        originalVon: "", originalBis: "", taetigkeit: "", break_min: 0,
        brutto: 0, netto: 0, tagesNetto: 0, vonDirty: false, bisDirty: false, isWeekend })
    } else {
      const tagesNetto = dayEntries.reduce((s, e) => s + e.net_h, 0)
      for (const e of dayEntries) {
        const von = e.time_from.slice(0, 5)
        const bis = e.time_to.slice(0, 5)
        rows.push({ id: e.id, date: dateStr, weekday, dayLabel, von, bis,
          originalVon: von, originalBis: bis,
          taetigkeit: buildTaetigkeitText(e, fields),
          break_min: e.break_min, brutto: e.gross_h, netto: e.net_h, tagesNetto,
          vonDirty: false, bisDirty: false, isWeekend })
      }
    }
  }
  return rows
}

export function buildReportData(
  entries: FetchedEntry[],
  profile: { name: string; personal_nr: string | null },
  client: { name: string; client_nr: string | null },
  year: number,
  month: number,
  taetigkeitFields?: TaetigkeitField[],
  taetigkeitOverride?: Record<string, string>,
): ReportData {
  const daysInMonth = new Date(year, month, 0).getDate()
  const days: ReportDay[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`
    const dateObj = new Date(dateStr + "T00:00:00")
    const dow = dateObj.getDay()
    const isWeekend = dow === 0 || dow === 6
    const dayLabel = `${d.toString().padStart(2, "0")}. ${DE_MONTH_ABBR[month - 1]}`
    const weekday = DE_WEEKDAYS[dow]

    const dayEntries = entries.filter(e => e.date === dateStr)
    const tagesNetto = dayEntries.reduce((s, e) => s + e.net_h, 0)

    days.push({
      date: dateStr,
      weekday,
      dayLabel,
      isWeekend,
      entries: dayEntries.map(e => ({
        time_from: e.time_from,
        time_to: e.time_to,
        taetigkeitText: taetigkeitOverride?.[e.id] ?? buildTaetigkeitText(e, taetigkeitFields),
        gross_h: e.gross_h,
        break_min: e.break_min,
        net_h: e.net_h,
      })),
      tagesNetto,
    })
  }

  // Aggregate Buchungskonten by booking_item_text (fallback: project name)
  const kontoMap = new Map<string, number>()
  for (const e of entries) {
    const label = e.booking_item_text || e.project?.name || "Sonstige"
    kontoMap.set(label, (kontoMap.get(label) ?? 0) + e.net_h)
  }
  const buchungskonten: BuchungskontoRow[] = Array.from(kontoMap.entries())
    .map(([label, stunden]) => ({ label, stunden }))
    .sort((a, b) => b.stunden - a.stunden)

  return {
    mitarbeiter: profile.name,
    mitarbeiterNr: profile.personal_nr ?? "",
    kunde: client.name,
    kundenNr: client.client_nr ?? "",
    monatLabel: `${DE_MONTHS[month - 1]} ${year}`,
    year,
    month,
    days,
    buchungskonten,
    gesamtNetto: entries.reduce((s, e) => s + e.net_h, 0),
  }
}
