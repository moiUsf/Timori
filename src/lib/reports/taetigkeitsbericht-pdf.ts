import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { ReportData } from "./taetigkeitsbericht-data"

export type PdfLabels = {
  title: string
  nameLabel: string
  employeeNr: string
  client: string
  clientNr: string
  colWeekday: string
  colDay: string
  colFrom: string
  colTo: string
  colActivity: string
  colGross: string
  colBreak: string
  colNet: string
  colDailyNet: string
  bookingOverview: string
  total: string
  costCenter: string
  remarks: string
  signatureContractor: string
  signatureClient: string
}

export const DEFAULT_PDF_LABELS: PdfLabels = {
  title: "TÄTIGKEITSBERICHT",
  nameLabel: "Name",
  employeeNr: "Mitarbeiter-Nr.",
  client: "Kunde",
  clientNr: "Kunden-Nr.",
  colWeekday: "WT",
  colDay: "Tag",
  colFrom: "von",
  colTo: "bis",
  colActivity: "Tätigkeit",
  colGross: "Brutto",
  colBreak: "Pause",
  colNet: "Netto",
  colDailyNet: "Tages-\nNetto",
  bookingOverview: "Buchungskonten Übersicht",
  total: "Gesamt",
  costCenter: "Kostenstelle",
  remarks: "Bemerkungen",
  signatureContractor: "Unterschrift Auftragnehmer",
  signatureClient: "Unterschrift Kunde",
}

function fTime(t: string): string {
  return t ? t.slice(0, 5) : ""
}

function fh(h: number): string {
  return h === 0 ? "" : h.toFixed(1).replace(".", ",")
}

function fPause(min: number): string {
  if (min === 0) return ""
  return (min / 60).toFixed(1).replace(".", ",")
}

export function generatePDF(data: ReportData, labels: PdfLabels = DEFAULT_PDF_LABELS): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const marginL = 12
  const marginR = 12
  const pageW = 210
  let y = 15

  // ── Header ──────────────────────────────────────────────
  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.text(labels.title, marginL, y)
  doc.setFontSize(11)
  doc.text(data.monatLabel, 184, y, { align: "right" })
  y += 7

  doc.setFontSize(8.5)
  doc.setFont("helvetica", "normal")
  doc.text(`${labels.nameLabel}: ${data.mitarbeiter}`, marginL, y)
  doc.text(`${labels.employeeNr}: ${data.mitarbeiterNr}`, marginL + 90, y)
  y += 5
  doc.text(`${labels.client}: ${data.kunde}`, marginL, y)
  doc.text(`${labels.clientNr}: ${data.kundenNr}`, marginL + 90, y)
  y += 7

  // ── Main table body ──────────────────────────────────────
  type Row = (string | { content: string; styles?: object })[]
  const body: Row[] = []

  for (const day of data.days) {
    if (day.isWeekend) {
      body.push([
        { content: day.weekday, styles: { textColor: [160, 160, 160] } },
        { content: day.dayLabel, styles: { textColor: [160, 160, 160] } },
        "", "", "", "", "", "", "",
      ])
    } else if (day.entries.length === 0) {
      body.push([day.weekday, day.dayLabel, "", "", "", "", "", "", ""])
    } else {
      day.entries.forEach((entry, i) => {
        const isLast = i === day.entries.length - 1
        body.push([
          i === 0 ? day.weekday : "",
          i === 0 ? day.dayLabel : "",
          fTime(entry.time_from),
          fTime(entry.time_to),
          entry.taetigkeitText,
          fh(entry.gross_h),
          fPause(entry.break_min),
          fh(entry.net_h),
          isLast ? fh(day.tagesNetto) : "",
        ])
      })
    }
  }

  autoTable(doc, {
    startY: y,
    head: [[
      labels.colWeekday,
      labels.colDay,
      labels.colFrom,
      labels.colTo,
      labels.colActivity,
      labels.colGross,
      labels.colBreak,
      labels.colNet,
      labels.colDailyNet,
    ]],
    body,
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak", textColor: [0, 0, 0] },
    headStyles: {
      fillColor: [220, 220, 220],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 18 },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 63 },
      5: { cellWidth: 13, halign: "center" },
      6: { cellWidth: 13, halign: "center" },
      7: { cellWidth: 13, halign: "center" },
      8: { cellWidth: 16, halign: "center" },
    },
    margin: { left: marginL, right: marginR },
  })

  // ── Gesamt-Zeile unter Haupttabelle ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mainTableEndY = (doc as any).lastAutoTable.finalY
  // Trennlinie
  doc.setDrawColor(0)
  doc.setLineWidth(0.4)
  doc.line(marginL, mainTableEndY + 2, 184, mainTableEndY + 2)
  // Label + Wert
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.text("Gesamt:", marginL, mainTableEndY + 7)
  doc.text(fh(data.gesamtNetto), 184, mainTableEndY + 7, { align: "right" })
  doc.setFont("helvetica", "normal")

  // ── Buchungskonten Übersicht ─────────────────────────────
  let afterTable = mainTableEndY + 16
  const pageH = doc.internal.pageSize.height
  if (pageH - afterTable < 50) {
    doc.addPage()
    afterTable = 15
  }

  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text(labels.bookingOverview, marginL, afterTable)

  const kontoBody = [
    ...data.buchungskonten.map(k => [k.label, `${fh(k.stunden)} h`]),
    [labels.total, `${fh(data.gesamtNetto)} h`],
  ]

  autoTable(doc, {
    startY: afterTable + 4,
    body: kontoBody,
    styles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 148 },
      1: { cellWidth: 26, halign: "right" },
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === kontoBody.length - 1) {
        hookData.cell.styles.fontStyle = "bold"
      }
    },
    margin: { left: marginL, right: marginR },
  })

  // ── Signature area ───────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sigY = (doc as any).lastAutoTable.finalY + 10
  if (pageH - sigY < 25) {
    doc.addPage()
    sigY = 15
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(`${labels.costCenter}: _______________________`, marginL, sigY)
  doc.text(`${labels.remarks}: _______________________`, marginL + 80, sigY)
  sigY += 12
  doc.text(`${labels.signatureContractor}: _______________________`, marginL, sigY)
  doc.text(`${labels.signatureClient}: _______________________`, marginL + 100, sigY)

  return doc.output("blob")
}
