import ExcelJS from "exceljs"
import { toLocalDateStr } from "@/lib/utils"

export type DynamischeGruppierung = "buchungsposten" | "projekt" | "aufgabe" | "kunde"

export interface DynamischeBerichtRow {
  date: string       // "YYYY-MM-DD"
  groupValue: string
  hours: number
}

const GROUPING_LABELS: Record<DynamischeGruppierung, string> = {
  buchungsposten: "Buchungsposten",
  projekt:        "Projekt",
  aufgabe:        "Aufgabe",
  kunde:          "Kunde",
}

const DE_MONTHS = [
  "Januar","Februar","März","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Dezember",
]

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, left: { style: "thin" },
  bottom: { style: "thin" }, right: { style: "thin" },
}
const GRAY: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCDCDC" } }

function formatDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildDynamischesBerichtData(
  supabase: any,
  userId: string,
  year: number,
  month: number,
  grouping: DynamischeGruppierung,
  clientIds?: string[],  // undefined or empty = alle Kunden
): Promise<{ rows: DynamischeBerichtRow[]; monthLabel: string; mitarbeiter: string }> {
  const first = `${year}-${month.toString().padStart(2, "0")}-01`
  const last = toLocalDateStr(new Date(year, month, 0))

  let entriesQuery = supabase
    .from("time_entries")
    .select("date, net_h, booking_item_text, client:clients(name), project:projects(name), task:tasks(name)")
    .eq("user_id", userId)
    .gte("date", first)
    .lte("date", last)
    .order("date")

  if (clientIds && clientIds.length > 0) entriesQuery = entriesQuery.in("client_id", clientIds)

  const [profileRes, entriesRes] = await Promise.all([
    supabase.from("users_profile").select("name").eq("user_id", userId).single(),
    entriesQuery,
  ])

  const mitarbeiter: string = profileRes.data?.name ?? ""
  const monthLabel = `${DE_MONTHS[month - 1]} ${year}`

  const entries = (entriesRes.data ?? []) as {
    date: string
    net_h: number
    booking_item_text: string
    client: { name: string } | null
    project: { name: string } | null
    task: { name: string } | null
  }[]

  // Aggregate hours by (date, groupValue)
  const map = new Map<string, number>()
  for (const e of entries) {
    let groupValue: string
    switch (grouping) {
      case "buchungsposten": groupValue = e.booking_item_text || "(kein Buchungsposten)"; break
      case "projekt":        groupValue = e.project?.name    || "(kein Projekt)";         break
      case "aufgabe":        groupValue = e.task?.name       || "(keine Aufgabe)";         break
      case "kunde":          groupValue = e.client?.name     || "(kein Kunde)";            break
    }
    const key = `${e.date}||${groupValue}`
    map.set(key, (map.get(key) ?? 0) + e.net_h)
  }

  const rows: DynamischeBerichtRow[] = Array.from(map.entries())
    .map(([key, hours]) => {
      const sep = key.indexOf("||")
      return { date: key.slice(0, sep), groupValue: key.slice(sep + 2), hours }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.groupValue.localeCompare(b.groupValue))

  return { rows, monthLabel, mitarbeiter }
}

export async function generateDynamischesBerichtExcel(
  rows: DynamischeBerichtRow[],
  grouping: DynamischeGruppierung,
  monthLabel: string,
  mitarbeiter: string,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Dynamisches Bericht")
  const groupLabel = GROUPING_LABELS[grouping]

  ws.columns = [
    { width: 14 }, // Datum
    { width: 35 }, // Gruppierdimension
    { width: 12 }, // Stunden
  ]

  // Row 1: title
  ws.mergeCells(1, 1, 1, 3)
  const title = ws.getRow(1).getCell(1)
  title.value = `Dynamisches Bericht – ${mitarbeiter} – ${monthLabel}`
  title.font = { bold: true, size: 12 }

  // Row 2: column headers
  const hRow = ws.getRow(2)
  function headerCell(cell: ExcelJS.Cell, value: string, alignRight = false) {
    cell.value = value
    cell.font = { bold: true }
    cell.fill = GRAY
    cell.border = THIN
    cell.alignment = { horizontal: alignRight ? "right" : "left", vertical: "middle" }
  }
  headerCell(hRow.getCell(1), "Datum")
  headerCell(hRow.getCell(2), groupLabel)
  headerCell(hRow.getCell(3), "Stunden", true)

  // Data rows — color changes per day, not per row
  // Even dayIndex (0, 2, 4 …) = gray; odd = white
  let rowIdx = 3
  let dayIndex = -1
  let currentDate = ""

  for (const row of rows) {
    if (row.date !== currentDate) {
      dayIndex++
      currentDate = row.date
    }
    const fill: ExcelJS.Fill | undefined = dayIndex % 2 === 0 ? GRAY : undefined

    const exRow = ws.getRow(rowIdx)

    const dateCell = exRow.getCell(1)
    dateCell.value = formatDate(row.date)
    dateCell.border = THIN
    if (fill) dateCell.fill = fill

    const groupCell = exRow.getCell(2)
    groupCell.value = row.groupValue
    groupCell.border = THIN
    if (fill) groupCell.fill = fill

    const hoursCell = exRow.getCell(3)
    hoursCell.value = Math.round(row.hours * 100) / 100
    hoursCell.numFmt = "0.00"
    hoursCell.border = THIN
    hoursCell.alignment = { horizontal: "right" }
    if (fill) hoursCell.fill = fill

    rowIdx++
  }

  // Summenzeile
  const total = Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100
  const sumRow = ws.getRow(rowIdx)
  const sumLabelCell = sumRow.getCell(2)
  sumLabelCell.value = "Gesamt"
  sumLabelCell.font = { bold: true }
  sumLabelCell.fill = GRAY
  sumLabelCell.border = THIN
  sumLabelCell.alignment = { horizontal: "left", vertical: "middle" }
  const sumDateCell = sumRow.getCell(1)
  sumDateCell.fill = GRAY
  sumDateCell.border = THIN
  const sumHoursCell = sumRow.getCell(3)
  sumHoursCell.value = total
  sumHoursCell.numFmt = "0.00"
  sumHoursCell.font = { bold: true }
  sumHoursCell.fill = GRAY
  sumHoursCell.border = THIN
  sumHoursCell.alignment = { horizontal: "right" }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}
