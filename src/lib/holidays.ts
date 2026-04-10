/**
 * German public holidays calculator
 * Supports all 16 federal states
 */

export type GermanState =
  | "DE-BW" | "DE-BY" | "DE-BE" | "DE-BB" | "DE-HB"
  | "DE-HH" | "DE-HE" | "DE-MV" | "DE-NI" | "DE-NW"
  | "DE-RP" | "DE-SL" | "DE-SN" | "DE-ST" | "DE-SH" | "DE-TH"

export interface Holiday {
  date: string // ISO YYYY-MM-DD
  name: string
  national: boolean
}

/** Gaussian Easter algorithm → returns [month (1-based), day] */
function easterDate(year: number): [number, number] {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return [month, day]
}

function toISO(year: number, month: number, day: number): string {
  return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

function addDays(year: number, month: number, day: number, days: number): string {
  const d = new Date(year, month - 1, day + days)
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function getHolidays(year: number, state: GermanState = "DE-NW"): Holiday[] {
  const [eMonth, eDay] = easterDate(year)

  const national: Holiday[] = [
    { date: toISO(year, 1, 1),  name: "Neujahr",              national: true },
    { date: addDays(year, eMonth, eDay, -2), name: "Karfreitag",        national: true },
    { date: addDays(year, eMonth, eDay,  1), name: "Ostermontag",       national: true },
    { date: toISO(year, 5, 1),  name: "Tag der Arbeit",        national: true },
    { date: addDays(year, eMonth, eDay, 39), name: "Christi Himmelfahrt", national: true },
    { date: addDays(year, eMonth, eDay, 50), name: "Pfingstmontag",      national: true },
    { date: toISO(year, 10, 3), name: "Tag der Deutschen Einheit", national: true },
    { date: toISO(year, 12, 25), name: "1. Weihnachtstag",     national: true },
    { date: toISO(year, 12, 26), name: "2. Weihnachtstag",     national: true },
  ]

  const stateHolidays: Partial<Record<GermanState, Holiday[]>> = {
    "DE-BW": [
      { date: addDays(year, eMonth, eDay, -48), name: "Rosenmontag", national: false },
      { date: addDays(year, eMonth, eDay, 60),  name: "Fronleichnam", national: false },
      { date: toISO(year, 11, 1), name: "Allerheiligen", national: false },
    ],
    "DE-BY": [
      { date: toISO(year, 1, 6),  name: "Heilige Drei Könige", national: false },
      { date: addDays(year, eMonth, eDay, 60), name: "Fronleichnam", national: false },
      { date: toISO(year, 8, 15), name: "Mariä Himmelfahrt", national: false },
      { date: toISO(year, 11, 1), name: "Allerheiligen", national: false },
    ],
    "DE-NW": [
      { date: addDays(year, eMonth, eDay, 60), name: "Fronleichnam", national: false },
      { date: toISO(year, 11, 1), name: "Allerheiligen", national: false },
    ],
    "DE-HE": [
      { date: addDays(year, eMonth, eDay, 60), name: "Fronleichnam", national: false },
    ],
    "DE-RP": [
      { date: addDays(year, eMonth, eDay, 60), name: "Fronleichnam", national: false },
      { date: toISO(year, 11, 1), name: "Allerheiligen", national: false },
    ],
    "DE-SL": [
      { date: addDays(year, eMonth, eDay, 60), name: "Fronleichnam", national: false },
      { date: toISO(year, 8, 15), name: "Mariä Himmelfahrt", national: false },
      { date: toISO(year, 11, 1), name: "Allerheiligen", national: false },
    ],
    "DE-SN": [
      { date: toISO(year, 10, 31), name: "Reformationstag", national: false },
      { date: toISO(year, 11, 20), name: "Buß- und Bettag", national: false },
    ],
    "DE-ST": [
      { date: toISO(year, 1, 6),  name: "Heilige Drei Könige", national: false },
      { date: toISO(year, 10, 31), name: "Reformationstag", national: false },
    ],
    "DE-TH": [
      { date: addDays(year, eMonth, eDay, 60), name: "Fronleichnam", national: false },
      { date: toISO(year, 9, 20), name: "Weltkindertag", national: false },
      { date: toISO(year, 10, 31), name: "Reformationstag", national: false },
    ],
    "DE-BB": [
      { date: toISO(year, 10, 31), name: "Reformationstag", national: false },
    ],
    "DE-MV": [
      { date: toISO(year, 10, 31), name: "Reformationstag", national: false },
    ],
    "DE-NI": [
      { date: toISO(year, 10, 31), name: "Reformationstag", national: false },
    ],
    "DE-SH": [
      { date: toISO(year, 10, 31), name: "Reformationstag", national: false },
    ],
    "DE-HH": [
      { date: toISO(year, 10, 31), name: "Reformationstag", national: false },
    ],
    "DE-HB": [
      { date: toISO(year, 10, 31), name: "Reformationstag", national: false },
    ],
    "DE-BE": [],
  }

  const extra = stateHolidays[state] ?? []
  const all = [...national, ...extra].sort((a, b) => a.date.localeCompare(b.date))
  return all
}

export function isHoliday(dateStr: string, holidays: Holiday[]): Holiday | undefined {
  return holidays.find((h) => h.date === dateStr)
}

export function workingDaysInMonth(year: number, month: number, state: GermanState): number {
  const holidays = getHolidays(year, state)
  const holidayDates = new Set(holidays.map((h) => h.date))
  let count = 0
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const dow = date.getDay()
    const iso = toISO(year, month, d)
    if (dow !== 0 && dow !== 6 && !holidayDates.has(iso)) {
      count++
    }
  }
  return count
}
