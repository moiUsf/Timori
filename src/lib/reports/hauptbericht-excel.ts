import ExcelJS from "exceljs"
import type { HauptberichtData } from "./hauptbericht-data"

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, left: { style: "thin" },
  bottom: { style: "thin" }, right: { style: "thin" },
}
const GRAY: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCDCDC" } }
const LIGHT: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } }

// Column layout: ProjNr | Kunde | Code | [day 1..31] | Summe  (total = 35)
const C_PROJNR = 1
const C_KUNDE  = 2
const C_CODE   = 3
const C_DAY1   = 4   // day 1 → column 4, day n → column 3+n
const C_SUMME  = 35

function fh(h: number): number | "" { return h > 0 ? Math.round(h * 100) / 100 : "" }

function applyBorder(cell: ExcelJS.Cell) { cell.border = THIN }

function headerCell(cell: ExcelJS.Cell, value: string | number, center = true) {
  cell.value = value
  cell.font = { bold: true }
  cell.fill = GRAY
  cell.border = THIN
  if (center) cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
}

function writeDataRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  col1: string, col2: string, col3: string,
  daily: number[], daysInMonth: number, summe: number,
  stripe: boolean,
) {
  const row = ws.getRow(rowNum)
  row.getCell(C_PROJNR).value = col1
  row.getCell(C_KUNDE).value = col2
  row.getCell(C_CODE).value = col3

  for (let d = 1; d <= 31; d++) {
    const cell = row.getCell(C_DAY1 + d - 1)
    if (d <= daysInMonth) {
      const v = daily[d - 1]
      if (v > 0) { cell.value = Math.round(v * 100) / 100; cell.numFmt = "0.00" }
    } else {
      cell.value = "-"
      cell.font = { color: { argb: "FF999999" } }
    }
    applyBorder(cell)
    cell.alignment = { horizontal: "center" }
    if (stripe) cell.fill = LIGHT
  }

  const sc = row.getCell(C_SUMME)
  if (summe > 0) { sc.value = Math.round(summe * 100) / 100; sc.numFmt = "0.00"; sc.font = { bold: true } }
  sc.border = THIN; sc.alignment = { horizontal: "right" }
  if (stripe) sc.fill = LIGHT

  for (const c of [C_PROJNR, C_KUNDE, C_CODE]) {
    applyBorder(row.getCell(c))
    if (stripe) row.getCell(c).fill = LIGHT
  }
}

export async function generateHauptberichtExcel(data: HauptberichtData): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Hauptbericht")

  // Column widths
  ws.columns = [
    { width: 11 },  // 1: ProjNr
    { width: 28 },  // 2: Kunde
    { width: 7  },  // 3: Code
    // days 1-31
    ...Array(31).fill({ width: 6 }),
    { width: 10 },  // 35: Summe
  ]

  let r = 1

  // ── Row 1: Title ─────────────────────────────────────────
  ws.mergeCells(r, 1, r, C_SUMME)
  const titleCell = ws.getRow(r).getCell(1)
  titleCell.value = `Hauptbericht ${data.mitarbeiter}`
  titleCell.font = { size: 13, bold: true }
  r++

  // ── Row 2: Subtitle + Month + Target ─────────────────────
  ws.mergeCells(r, 1, r, 18)
  ws.getRow(r).getCell(1).value = "Übersicht der geleisteten Stunden innerhalb eines Monats"
  ws.getRow(r).getCell(1).border = THIN

  ws.mergeCells(r, 28, r, C_SUMME - 3)
  const mVal = ws.getRow(r).getCell(28)
  mVal.value = data.monthLabel
  mVal.border = THIN; mVal.alignment = { horizontal: "center" }

  ws.mergeCells(r, C_SUMME - 2, r, C_SUMME - 1)
  ws.getRow(r).getCell(C_SUMME - 2).value = "Soll-Std."
  ws.getRow(r).getCell(C_SUMME - 2).fill = LIGHT; ws.getRow(r).getCell(C_SUMME - 2).border = THIN
  ws.getRow(r).getCell(C_SUMME - 2).alignment = { horizontal: "center" }
  const tVal = ws.getRow(r).getCell(C_SUMME)
  tVal.value = data.targetHours; tVal.numFmt = "0"; tVal.border = THIN; tVal.alignment = { horizontal: "center" }
  r++

  // ── Row 3: empty ─────────────────────────────────────────
  r++

  // ── Rows 4-5: Vacation summary ────────────────────────────
  const vr = ws.getRow(r)
  vr.getCell(1).value = "Tage"

  const vacLabels = ["im Jahr", "bereits erhalten", "lfd. Mon.", "Rest"]
  const vacVals = [
    data.vacationQuota,
    data.vacationTakenYTD,
    data.vacationThisMonth,
    Math.max(0, data.vacationQuota - data.vacationTakenYTD),
  ]
  const vacStarts = [4, 8, 12, 16]
  vacLabels.forEach((lbl, i) => {
    const sc = vacStarts[i]
    vr.getCell(sc).value = lbl
    vr.getCell(sc).font = { bold: false }
    vr.getCell(sc).alignment = { horizontal: "center" }
    ws.mergeCells(r, sc, r, sc + 2)
    vr.getCell(sc).border = THIN
  })
  r++

  const vvr = ws.getRow(r)
  vvr.getCell(1).value = "Urlaub:"
  vacVals.forEach((val, i) => {
    const sc = vacStarts[i]
    ws.mergeCells(r, sc, r, sc + 2)
    const vc = vvr.getCell(sc)
    vc.value = val; vc.numFmt = "0.0"; vc.border = THIN; vc.alignment = { horizontal: "center" }
  })
  r++

  r++ // empty row

  // ── Section 1: Project rows ───────────────────────────────
  // Tag header
  {
    const h1 = ws.getRow(r)
    ws.mergeCells(r, C_PROJNR, r, C_CODE)
    headerCell(h1.getCell(C_PROJNR), "Tag", false)
    for (let d = 1; d <= 31; d++) {
      const col = C_DAY1 + d - 1
      headerCell(h1.getCell(col), d <= data.daysInMonth ? d : "-")
    }
    headerCell(h1.getCell(C_SUMME), "Summe", false)
    h1.getCell(C_SUMME).alignment = { horizontal: "right" }
    r++

    // Column label row
    const h2 = ws.getRow(r)
    headerCell(h2.getCell(C_PROJNR), "Kunden Nr", false)
    headerCell(h2.getCell(C_KUNDE), "Kunde", false)
    headerCell(h2.getCell(C_CODE), "Code", false)
    ws.mergeCells(r, C_DAY1, r, C_SUMME - 1)
    const stCell = h2.getCell(C_DAY1)
    stCell.value = "Stunden"; stCell.font = { bold: true }; stCell.fill = GRAY
    stCell.border = THIN; stCell.alignment = { horizontal: "center" }
    h2.getCell(C_SUMME).fill = GRAY; h2.getCell(C_SUMME).border = THIN
    r++

    data.projectRows.forEach((row, idx) => {
      writeDataRow(ws, r, row.projektNr, row.kunde, row.code, row.daily, data.daysInMonth, row.summe, idx % 2 === 1)
      r++
    })

    // Summe Projekte row
    const sr = ws.getRow(r)
    ws.mergeCells(r, C_PROJNR, r, C_CODE)
    sr.getCell(C_PROJNR).value = "Summe Projekte"
    sr.getCell(C_PROJNR).font = { bold: true }; sr.getCell(C_PROJNR).fill = GRAY; sr.getCell(C_PROJNR).border = THIN
    sr.getCell(C_PROJNR).alignment = { horizontal: "left", vertical: "middle" }
    for (let d = 1; d <= 31; d++) {
      const col = C_DAY1 + d - 1
      const cell = sr.getCell(col)
      const v = d <= data.daysInMonth ? data.dailySumme[d - 1] : 0
      if (d <= data.daysInMonth && v > 0) { cell.value = Math.round(v * 100) / 100; cell.numFmt = "0.00" }
      else if (d > data.daysInMonth) { cell.value = "-"; cell.font = { color: { argb: "FF999999" } } }
      cell.fill = GRAY; cell.border = THIN; cell.alignment = { horizontal: "center" }; cell.font = { bold: true }
    }
    const gsc = sr.getCell(C_SUMME)
    gsc.value = Math.round(data.gesamtSumme * 100) / 100; gsc.numFmt = "0.00"
    gsc.fill = GRAY; gsc.border = THIN; gsc.font = { bold: true }; gsc.alignment = { horizontal: "right" }
    r += 2
  }

  // ── Section 2: Absence rows ───────────────────────────────
  {
    const h1 = ws.getRow(r)
    ws.mergeCells(r, C_PROJNR, r, C_CODE)
    headerCell(h1.getCell(C_PROJNR), "Tag", false)
    for (let d = 1; d <= 31; d++) {
      headerCell(h1.getCell(C_DAY1 + d - 1), d <= data.daysInMonth ? d : "-")
    }
    headerCell(h1.getCell(C_SUMME), "Summe", false)
    h1.getCell(C_SUMME).alignment = { horizontal: "right" }
    r++

    const h2 = ws.getRow(r)
    ws.mergeCells(r, C_PROJNR, r, C_CODE)
    headerCell(h2.getCell(C_PROJNR), "Beschreibung", false)
    ws.mergeCells(r, C_DAY1, r, C_SUMME - 1)
    const stCell2 = h2.getCell(C_DAY1)
    stCell2.value = "Stunden"; stCell2.font = { bold: true }; stCell2.fill = GRAY
    stCell2.border = THIN; stCell2.alignment = { horizontal: "center" }
    h2.getCell(C_SUMME).fill = GRAY; h2.getCell(C_SUMME).border = THIN
    r++

    data.absenceRows.forEach((row, idx) => {
      const dr = ws.getRow(r)
      ws.mergeCells(r, C_PROJNR, r, C_CODE)
      dr.getCell(C_PROJNR).value = row.beschreibung; applyBorder(dr.getCell(C_PROJNR))
      for (let d = 1; d <= 31; d++) {
        const cell = dr.getCell(C_DAY1 + d - 1)
        if (d <= data.daysInMonth) {
          const v = row.daily[d - 1]
          if (v > 0) cell.value = v
        } else {
          cell.value = "-"; cell.font = { color: { argb: "FF999999" } }
        }
        cell.border = THIN; cell.alignment = { horizontal: "center" }
        if (idx % 2 === 1) cell.fill = LIGHT
      }
      const sc = dr.getCell(C_SUMME)
      if (row.summe > 0) sc.value = row.summe
      sc.border = THIN; sc.alignment = { horizontal: "right" }
      if (idx % 2 === 1) { dr.getCell(C_PROJNR).fill = LIGHT; sc.fill = LIGHT }
      r++
    })
    r++
  }

  // ── Section 4: Daily totals ───────────────────────────────
  {
    const h1 = ws.getRow(r)
    ws.mergeCells(r, C_PROJNR, r, C_CODE)
    headerCell(h1.getCell(C_PROJNR), "Tag", false)
    for (let d = 1; d <= 31; d++) {
      headerCell(h1.getCell(C_DAY1 + d - 1), d <= data.daysInMonth ? d : "-")
    }
    headerCell(h1.getCell(C_SUMME), "Summe", false)
    h1.getCell(C_SUMME).alignment = { horizontal: "right" }
    r++

    const sr = ws.getRow(r)
    ws.mergeCells(r, C_PROJNR, r, C_CODE)
    sr.getCell(C_PROJNR).value = "Summe"; sr.getCell(C_PROJNR).font = { bold: true }
    sr.getCell(C_PROJNR).fill = GRAY; sr.getCell(C_PROJNR).border = THIN
    sr.getCell(C_PROJNR).alignment = { horizontal: "left", vertical: "middle" }
    for (let d = 1; d <= 31; d++) {
      const col = C_DAY1 + d - 1
      const cell = sr.getCell(col)
      const v = d <= data.daysInMonth ? data.dailySumme[d - 1] : 0
      if (d <= data.daysInMonth) { cell.value = Math.round(v * 100) / 100; cell.numFmt = "0.00" }
      else { cell.value = "-"; cell.font = { color: { argb: "FF999999" } } }
      cell.fill = GRAY; cell.border = THIN; cell.font = { bold: true }; cell.alignment = { horizontal: "center" }
    }
    const gsc = sr.getCell(C_SUMME)
    gsc.value = Math.round(data.gesamtSumme * 100) / 100; gsc.numFmt = "0.00"
    gsc.fill = GRAY; gsc.border = THIN; gsc.font = { bold: true }; gsc.alignment = { horizontal: "right" }
    r += 2
  }

  // ── Footer: Signatures ────────────────────────────────────
  r += 4
  const today = new Date().toLocaleDateString("de-DE")
  const BOLD_BLACK = { bold: true, color: { argb: "FF000000" } }

  // Row 1: signature lines (date pre-filled in slot 1, rest blank with underline)
  const fr = ws.getRow(r)
  fr.height = 24  // room to sign

  ws.mergeCells(r, 1, r, 5)
  fr.getCell(1).value = today; fr.getCell(1).font = BOLD_BLACK
  fr.getCell(1).border = { bottom: { style: "thin" } }

  ws.mergeCells(r, 7, r, 16)
  fr.getCell(7).border = { bottom: { style: "thin" } }

  ws.mergeCells(r, 18, r, 26)
  fr.getCell(18).border = { bottom: { style: "thin" } }

  ws.mergeCells(r, 28, r, C_SUMME)
  fr.getCell(28).border = { bottom: { style: "thin" } }
  r++

  // Row 2: labels below the lines
  const fl = ws.getRow(r)
  fl.getCell(1).value = "Datum";                            fl.getCell(1).font = BOLD_BLACK
  fl.getCell(7).value = "Mitarbeiter/in";                   fl.getCell(7).font = BOLD_BLACK
  fl.getCell(18).value = "Vorgesetzte/r";                   fl.getCell(18).font = BOLD_BLACK
  fl.getCell(28).value = "rechnerisch richtig / Kontrolle"; fl.getCell(28).font = BOLD_BLACK

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}
