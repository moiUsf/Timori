import ExcelJS from "exceljs"
import type { ReportData } from "./taetigkeitsbericht-data"

function fPause(min: number): string {
  if (min === 0) return ""
  return (min / 60).toFixed(1).replace(".", ",")
}

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, left: { style: "thin" },
  bottom: { style: "thin" }, right: { style: "thin" },
}
const GRAY_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFDCDCDC" },
}
const COLS = 9

export async function generateExcel(data: ReportData): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Tätigkeitsbericht")

  ws.columns = [
    { width: 5 },   // WT
    { width: 12 },  // Tag
    { width: 8 },   // von
    { width: 8 },   // bis
    { width: 45 },  // Tätigkeit
    { width: 10 },  // Brutto
    { width: 8 },   // Pause
    { width: 10 },  // Netto
    { width: 13 },  // Tages-Netto
  ]

  // ── Header block ────────────────────────────────────────
  ws.mergeCells(1, 1, 1, COLS)
  const titleCell = ws.getRow(1).getCell(1)
  titleCell.value = "TÄTIGKEITSBERICHT"
  titleCell.font = { size: 14, bold: true }

  ws.mergeCells(2, 1, 2, COLS)
  const monthCell = ws.getRow(2).getCell(1)
  monthCell.value = data.monatLabel
  monthCell.font = { size: 11 }

  // Row 3 empty
  ws.getRow(4).getCell(1).value = `Name: ${data.mitarbeiter}`
  ws.getRow(4).getCell(5).value = `Mitarbeiter-Nr.: ${data.mitarbeiterNr}`
  ws.getRow(5).getCell(1).value = `Kunde: ${data.kunde}`
  ws.getRow(5).getCell(5).value = `Kunden-Nr.: ${data.kundenNr}`
  // Row 6 empty

  // ── Column headers ───────────────────────────────────────
  const headerRow = ws.getRow(7)
  const headers = ["WT", "Tag", "von", "bis", "Tätigkeit", "Brutto", "Pause", "Netto", "Tages-Netto"]
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true }
    cell.fill = GRAY_FILL
    cell.border = THIN
    cell.alignment = { horizontal: "center", wrapText: true }
  })

  // ── Data rows ────────────────────────────────────────────
  let rowNum = 8

  for (const day of data.days) {
    if (day.isWeekend || day.entries.length === 0) {
      const row = ws.getRow(rowNum)
      row.getCell(1).value = day.weekday
      row.getCell(2).value = day.dayLabel
      if (day.isWeekend) {
        row.getCell(1).font = { color: { argb: "FF969696" } }
        row.getCell(2).font = { color: { argb: "FF969696" } }
      }
      for (let c = 1; c <= COLS; c++) row.getCell(c).border = THIN
      rowNum++
    } else {
      day.entries.forEach((entry, i) => {
        const isLast = i === day.entries.length - 1
        const row = ws.getRow(rowNum)
        if (i === 0) {
          row.getCell(1).value = day.weekday
          row.getCell(2).value = day.dayLabel
        }
        row.getCell(3).value = entry.time_from
        row.getCell(4).value = entry.time_to
        row.getCell(5).value = entry.taetigkeitText
        row.getCell(5).alignment = { wrapText: true }
        if (entry.gross_h > 0) row.getCell(6).value = entry.gross_h
        if (entry.break_min > 0) row.getCell(7).value = fPause(entry.break_min)
        if (entry.net_h > 0) row.getCell(8).value = entry.net_h
        if (isLast && day.tagesNetto > 0) row.getCell(9).value = day.tagesNetto
        for (let c = 1; c <= COLS; c++) row.getCell(c).border = THIN
        rowNum++
      })
    }
  }

  // ── Gesamt-Zeile unter Haupttabelle ─────────────────────
  const gesamtTableRow = ws.getRow(rowNum)
  gesamtTableRow.getCell(1).value = "Gesamt:"
  gesamtTableRow.getCell(1).font = { bold: true }
  gesamtTableRow.getCell(1).alignment = { horizontal: "left" }
  gesamtTableRow.getCell(9).value = data.gesamtNetto
  gesamtTableRow.getCell(9).numFmt = "0.0"
  gesamtTableRow.getCell(9).font = { bold: true }
  gesamtTableRow.getCell(9).alignment = { horizontal: "center" }
  for (let c = 1; c <= COLS; c++) {
    gesamtTableRow.getCell(c).border = {
      top: { style: "medium" },
      left: c === 1 ? { style: "thin" } : undefined,
      right: c === COLS ? { style: "thin" } : undefined,
      bottom: { style: "thin" },
    }
  }
  rowNum++

  // ── Buchungskonten Übersicht ─────────────────────────────
  rowNum++ // empty row
  ws.mergeCells(rowNum, 1, rowNum, COLS)
  const bHeader = ws.getRow(rowNum).getCell(1)
  bHeader.value = "Buchungskonten Übersicht"
  bHeader.font = { bold: true }
  rowNum++

  for (const k of data.buchungskonten) {
    const row = ws.getRow(rowNum)
    ws.mergeCells(rowNum, 1, rowNum, COLS - 1)
    row.getCell(1).value = k.label
    row.getCell(COLS).value = k.stunden
    row.getCell(COLS).numFmt = "0.0"
    for (let c = 1; c <= COLS; c++) row.getCell(c).border = THIN
    rowNum++
  }

  // Gesamt row
  const totalRow = ws.getRow(rowNum)
  ws.mergeCells(rowNum, 1, rowNum, COLS - 1)
  totalRow.getCell(1).value = "Gesamt"
  totalRow.getCell(1).font = { bold: true }
  totalRow.getCell(COLS).value = data.gesamtNetto
  totalRow.getCell(COLS).font = { bold: true }
  totalRow.getCell(COLS).numFmt = "0.0"
  for (let c = 1; c <= COLS; c++) totalRow.getCell(c).border = THIN
  rowNum += 2

  // ── Signature area ───────────────────────────────────────
  ws.getRow(rowNum).getCell(1).value = "Kostenstelle: _______________________"
  ws.getRow(rowNum).getCell(5).value = "Bemerkungen: _______________________"
  rowNum += 2
  ws.getRow(rowNum).getCell(1).value = "Unterschrift Auftragnehmer: _______________________"
  ws.getRow(rowNum).getCell(5).value = "Unterschrift Kunde: _______________________"

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}
