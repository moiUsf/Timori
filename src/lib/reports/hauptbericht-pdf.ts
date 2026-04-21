import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { HauptberichtData } from "./hauptbericht-data"

function fh(h: number): string { return h > 0 ? (Math.round(h * 100) / 100).toFixed(2) : "" }
function fd(d: number): string { return d > 0 ? String(d) : "" }

// Landscape A4: 297 × 210 mm
const PAGE_W = 297
const MARGIN_L = 8
const MARGIN_R = 8
const USABLE = PAGE_W - MARGIN_L - MARGIN_R  // 281mm

// Fixed left cols: ProjNr=14, Kunde=30, Code=8 → 52mm total
// Summe col: 12mm
// Day cols: (281 - 52 - 12) / 31 ≈ 7mm
const W_PROJ  = 14
const W_KUNDE = 30
const W_CODE  = 8
const W_SUMME = 12
const W_DAY   = Math.floor((USABLE - W_PROJ - W_KUNDE - W_CODE - W_SUMME) / 31)  // ~7

const GRAY_FILL:  [number, number, number] = [180, 180, 180]
const LIGHT_FILL: [number, number, number] = [234, 234, 234]
const WHITE_FILL: [number, number, number] = [255, 255, 255]

function dayHeaders(daysInMonth: number): string[] {
  return Array.from({ length: 31 }, (_, i) => i < daysInMonth ? String(i + 1) : "-")
}

// All three sections share the same 35-column layout so the day / Summe columns
// are pixel-perfect aligned.  Merged left cells use colSpan:3 instead of
// zero-width columns so the geometry is identical.
function buildColStyles(): Record<number, object> {
  const styles: Record<number, object> = {
    0: { cellWidth: W_PROJ,  halign: "left" },
    1: { cellWidth: W_KUNDE, halign: "left", overflow: "ellipsize" },
    2: { cellWidth: W_CODE,  halign: "left" },
  }
  for (let d = 0; d < 31; d++) {
    styles[3 + d] = { cellWidth: W_DAY, halign: "center" }
  }
  styles[34] = { cellWidth: W_SUMME, halign: "right" }
  return styles
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergedLeft(text: string, extra?: object): any {
  return { content: text, colSpan: 3, styles: { halign: "left", overflow: "ellipsize", ...extra } }
}

export function generateHauptberichtPDF(data: HauptberichtData): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  let y = 10

  // ── Title ─────────────────────────────────────────────────
  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.text(`Hauptbericht ${data.mitarbeiter}`, MARGIN_L, y)
  y += 6

  // ── Info line ─────────────────────────────────────────────
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text("Übersicht der geleisteten Stunden innerhalb eines Monats", MARGIN_L, y)
  doc.text(`${data.monthLabel}   |   Soll-Std.: ${data.targetHours.toFixed(0)} h`, PAGE_W - MARGIN_R, y, { align: "right" })
  y += 5

  // ── Vacation summary line ─────────────────────────────────
  const vacRest = Math.max(0, data.vacationQuota - data.vacationTakenYTD)
  doc.text(
    `Urlaub:   im Jahr: ${data.vacationQuota}   |   bereits erhalten: ${data.vacationTakenYTD}   |   lfd. Mon.: ${data.vacationThisMonth}   |   Rest: ${vacRest}`,
    MARGIN_L, y
  )
  y += 4

  // ── Section 1: Project rows ───────────────────────────────
  const projectBody = data.projectRows.map((row) => [
    row.projektNr,
    row.kunde,
    row.code,
    ...row.daily.map((h, d) => d < data.daysInMonth ? fh(h) : "-"),
    fh(row.summe),
  ])

  // "Summe Projekte" spans the three left cols so the text never gets clipped
  const summeRow = [
    mergedLeft("Summe Projekte"),
    ...data.dailySumme.map((h, d) => d < data.daysInMonth ? fh(h) : "-"),
    fh(data.gesamtSumme),
  ]

  autoTable(doc, {
    startY: y,
    head: [["Kunden Nr", "Kunde", "Code", ...dayHeaders(data.daysInMonth), "Summe"]],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: [...projectBody, summeRow] as any,
    styles: { fontSize: 6.5, cellPadding: 0.8, overflow: "ellipsize", textColor: [0, 0, 0] },
    headStyles: { fillColor: GRAY_FILL, textColor: [0, 0, 0], fontStyle: "bold", fontSize: 6.5, halign: "center" },
    columnStyles: buildColStyles(),
    didParseCell: (hook) => {
      if (hook.section === "head") {
        if (hook.column.index <= 2) hook.cell.styles.halign = "left"
        if (hook.column.index === 34) hook.cell.styles.halign = "right"
      }
      if (hook.section === "body") {
        const isLast = hook.row.index === projectBody.length
        if (isLast) {
          hook.cell.styles.fontStyle = "bold"
          hook.cell.styles.fillColor = GRAY_FILL
        } else {
          hook.cell.styles.fillColor = hook.row.index % 2 === 0 ? WHITE_FILL : LIGHT_FILL
        }
      }
    },
    margin: { left: MARGIN_L, right: MARGIN_R },
  })

  // ── Section 2: Absence rows ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4

  // First cell spans cols 0-2 (same geometry as project table → Summe column aligned)
  const absenceBody = data.absenceRows.map((row) => [
    mergedLeft(row.beschreibung),
    ...row.daily.map((d, i) => i < data.daysInMonth ? fd(d) : "-"),
    fd(row.summe),
  ])

  autoTable(doc, {
    startY: y,
    head: [[mergedLeft("Beschreibung"), ...dayHeaders(data.daysInMonth), "Summe"]],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: absenceBody as any,
    styles: { fontSize: 6.5, cellPadding: 0.8, overflow: "ellipsize", textColor: [0, 0, 0] },
    headStyles: { fillColor: GRAY_FILL, textColor: [0, 0, 0], fontStyle: "bold", fontSize: 6.5, halign: "center" },
    columnStyles: buildColStyles(),
    didParseCell: (hook) => {
      if (hook.section === "head" && hook.column.index === 34) hook.cell.styles.halign = "right"
      if (hook.section === "body") {
        hook.cell.styles.fillColor = hook.row.index % 2 === 0 ? WHITE_FILL : LIGHT_FILL
      }
    },
    margin: { left: MARGIN_L, right: MARGIN_R },
  })

  // ── Section 3: Daily summe ────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4

  const summeBodyRow = [
    mergedLeft("Summe"),
    ...data.dailySumme.map((h, d) => d < data.daysInMonth ? fh(h) : "-"),
    fh(data.gesamtSumme),
  ]

  autoTable(doc, {
    startY: y,
    head: [[mergedLeft("Tag"), ...dayHeaders(data.daysInMonth), "Summe"]],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: [summeBodyRow] as any,
    styles: { fontSize: 6.5, cellPadding: 0.8, textColor: [0, 0, 0] },
    headStyles: { fillColor: GRAY_FILL, textColor: [0, 0, 0], fontStyle: "bold", fontSize: 6.5, halign: "center" },
    columnStyles: buildColStyles(),
    didParseCell: (hook) => {
      if (hook.section === "head" && hook.column.index === 34) hook.cell.styles.halign = "right"
      if (hook.section === "body") {
        hook.cell.styles.fontStyle = "bold"
        hook.cell.styles.fillColor = GRAY_FILL
      }
    },
    margin: { left: MARGIN_L, right: MARGIN_R },
  })

  // ── Footer: all in black ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sigY = (doc as any).lastAutoTable.finalY + 22
  const pageH = doc.internal.pageSize.height
  if (pageH - sigY < 18) { doc.addPage(); sigY = 18 }

  const today = new Date().toLocaleDateString("de-DE")
  doc.setFontSize(6.5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)

  const s1x = MARGIN_L
  const s2x = MARGIN_L + 55
  const s3x = MARGIN_L + 140
  const s4x = MARGIN_L + 210

  doc.text(today, s1x, sigY)
  doc.line(s1x, sigY + 1, s1x + 38, sigY + 1)
  doc.text("Datum", s1x, sigY + 5)

  doc.line(s2x, sigY + 1, s2x + 68, sigY + 1)
  doc.text("Mitarbeiter/in", s2x, sigY + 5)

  doc.line(s3x, sigY + 1, s3x + 58, sigY + 1)
  doc.text("Vorgesetzte/r", s3x, sigY + 5)

  doc.line(s4x, sigY + 1, PAGE_W - MARGIN_R, sigY + 1)
  doc.text("rechnerisch richtig / Kontrolle", s4x, sigY + 5)

  return doc.output("blob")
}
