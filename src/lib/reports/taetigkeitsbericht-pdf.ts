import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { ReportData } from "./taetigkeitsbericht-data"

function fh(h: number): string {
  return h === 0 ? "" : h.toFixed(1).replace(".", ",")
}

function fPause(min: number): string {
  if (min === 0) return ""
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

export function generatePDF(data: ReportData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const marginL = 12
  const marginR = 12
  const pageW = 210
  let y = 15

  // ── Header ──────────────────────────────────────────────
  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.text("TÄTIGKEITSBERICHT", marginL, y)
  doc.setFontSize(11)
  doc.text(data.monatLabel, pageW - marginR, y, { align: "right" })
  y += 7

  doc.setFontSize(8.5)
  doc.setFont("helvetica", "normal")
  doc.text(`Name: ${data.mitarbeiter}`, marginL, y)
  doc.text(`Mitarbeiter-Nr.: ${data.mitarbeiterNr}`, marginL + 90, y)
  y += 5
  doc.text(`Kunde: ${data.kunde}`, marginL, y)
  doc.text(`Kunden-Nr.: ${data.kundenNr}`, marginL + 90, y)
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
          entry.time_from,
          entry.time_to,
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
    head: [["WT", "Tag", "von", "bis", "Tätigkeit", "Brutto", "Pause", "Netto", "Tages-\nNetto"]],
    body,
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" },
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
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 12, halign: "center" },
      4: { cellWidth: 67 },
      5: { cellWidth: 13, halign: "center" },
      6: { cellWidth: 13, halign: "center" },
      7: { cellWidth: 13, halign: "center" },
      8: { cellWidth: 16, halign: "center" },
    },
    margin: { left: marginL, right: marginR },
  })

  // ── Buchungskonten Übersicht ─────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let afterTable = (doc as any).lastAutoTable.finalY + 8
  const pageH = doc.internal.pageSize.height
  if (pageH - afterTable < 50) {
    doc.addPage()
    afterTable = 15
  }

  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("Buchungskonten Übersicht", marginL, afterTable)

  const kontoBody = [
    ...data.buchungskonten.map(k => [k.label, `${fh(k.stunden)} h`]),
    ["Gesamt", `${fh(data.gesamtNetto)} h`],
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
  doc.text("Kostenstelle: _______________________", marginL, sigY)
  doc.text("Bemerkungen: _______________________", marginL + 80, sigY)
  sigY += 12
  doc.text("Unterschrift Auftragnehmer: _______________________", marginL, sigY)
  doc.text("Unterschrift Kunde: _______________________", marginL + 100, sigY)

  return doc.output("blob")
}
