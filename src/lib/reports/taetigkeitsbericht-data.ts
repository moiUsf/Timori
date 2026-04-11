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

function buildTaetigkeitText(entry: FetchedEntry): string {
  const parts: string[] = []
  if (entry.booking_item_text) parts.push(entry.booking_item_text)
  if (entry.task?.name) parts.push(entry.task.name)
  if (parts.length > 0) return parts.join(" - ")
  if (entry.description) return entry.description
  return entry.project?.name ?? ""
}

export function buildReportData(
  entries: FetchedEntry[],
  profile: { name: string; personal_nr: string | null },
  client: { name: string; client_nr: string | null },
  year: number,
  month: number,
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
        taetigkeitText: buildTaetigkeitText(e),
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
