# Tätigkeitsbericht Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tätigkeitsbericht export feature that generates a formatted monthly PDF or Excel report per client, accessible from the Berichte page and the Zeiterfassung page.

**Architecture:** Client-side generation — a reusable dialog component loads data from Supabase, builds a `ReportData` object via a pure data module, then calls either a jsPDF-based PDF generator or an exceljs-based Excel generator, triggering a browser download. No API routes needed.

**Tech Stack:** `jspdf`, `jspdf-autotable`, `exceljs` (all browser-compatible); shadcn/ui Dialog, Select, Button; Supabase client

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/reports/taetigkeitsbericht-data.ts` | Types + pure `buildReportData()` function |
| Create | `src/lib/reports/taetigkeitsbericht-pdf.ts` | jsPDF PDF generator |
| Create | `src/lib/reports/taetigkeitsbericht-excel.ts` | exceljs Excel generator |
| Create | `src/components/reports/taetigkeitsbericht-dialog.tsx` | Modal UI — data fetching + download orchestration |
| Modify | `src/app/(dashboard)/reports/page.tsx` | Convert to client component, open dialog from card |
| Modify | `src/app/(dashboard)/time/page.tsx` | Add "Bericht exportieren" button + dialog |

---

## Task 1: Install packages

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install PDF and Excel libraries**

```bash
npm install jspdf @types/jspdf jspdf-autotable exceljs
```

Expected output: packages added without errors. `@types/jspdf` may say "up to date" if bundled types already exist — that's fine.

- [ ] **Step 2: Add webpack fallbacks for exceljs (uses Node.js streams)**

`exceljs` references `fs`, `stream`, and `path` which don't exist in the browser. Tell webpack to ignore them. Open `next.config.ts` and replace its content with:

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      stream: false,
      path: false,
    }
    return config
  },
}

export default nextConfig
```

- [ ] **Step 3: Verify TypeScript resolves the imports**

```bash
cd C:/Users/youss/Documents/Claude/timori && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors (existing errors are pre-existing, not from these packages).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "chore: add jspdf, jspdf-autotable, exceljs + webpack fallbacks"
```

---

## Task 2: Data module — types + `buildReportData`

**Files:**
- Create: `src/lib/reports/taetigkeitsbericht-data.ts`

This module is purely functional — no React, no Supabase. It takes raw data and returns a structured `ReportData` object ready for both generators.

- [ ] **Step 1: Create the data module**

Create `src/lib/reports/taetigkeitsbericht-data.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

```bash
cd C:/Users/youss/Documents/Claude/timori && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/taetigkeitsbericht-data.ts
git commit -m "feat: add Tätigkeitsbericht data module"
```

---

## Task 3: PDF generator

**Files:**
- Create: `src/lib/reports/taetigkeitsbericht-pdf.ts`

- [ ] **Step 1: Create the PDF generator**

Create `src/lib/reports/taetigkeitsbericht-pdf.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

```bash
cd C:/Users/youss/Documents/Claude/timori && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If jspdf-autotable types complain, note the error for Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/taetigkeitsbericht-pdf.ts
git commit -m "feat: add Tätigkeitsbericht PDF generator"
```

---

## Task 4: Excel generator

**Files:**
- Create: `src/lib/reports/taetigkeitsbericht-excel.ts`

- [ ] **Step 1: Create the Excel generator**

Create `src/lib/reports/taetigkeitsbericht-excel.ts`:

```ts
import ExcelJS from "exceljs"
import type { ReportData } from "./taetigkeitsbericht-data"

function fPause(min: number): string {
  if (min === 0) return ""
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
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
```

- [ ] **Step 2: Type-check**

```bash
cd C:/Users/youss/Documents/Claude/timori && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/taetigkeitsbericht-excel.ts
git commit -m "feat: add Tätigkeitsbericht Excel generator"
```

---

## Task 5: Dialog component

**Files:**
- Create: `src/components/reports/taetigkeitsbericht-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

Create `src/components/reports/taetigkeitsbericht-dialog.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Client } from "@/types/database"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, FileSpreadsheet, Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { buildReportData, type FetchedEntry } from "@/lib/reports/taetigkeitsbericht-data"

interface TaetigkeitsberichtDialogProps {
  userId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultMonth?: string  // "YYYY-MM" — if provided, month picker is hidden
}

function fh(h: number): string {
  return h.toFixed(1).replace(".", ",")
}

export function TaetigkeitsberichtDialog({
  userId, open, onOpenChange, defaultMonth,
}: TaetigkeitsberichtDialogProps) {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState("")
  const [month, setMonth] = useState(defaultMonth ?? new Date().toISOString().slice(0, 7))
  const [format, setFormat] = useState<"pdf" | "excel">("pdf")
  const [preview, setPreview] = useState<{ label: string; stunden: number }[]>([])
  const [gesamtNetto, setGesamtNetto] = useState(0)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    supabase.from("clients").select("*").eq("user_id", userId).eq("active", true).order("name")
      .then(({ data }) => setClients(data ?? []))
  }, [supabase, userId])

  useEffect(() => {
    if (!clientId || !month) { setPreview([]); setGesamtNetto(0); return }
    setLoadingPreview(true)
    const [year, mon] = month.split("-").map(Number)
    const first = `${year}-${mon.toString().padStart(2, "0")}-01`
    const last = new Date(year, mon, 0).toISOString().slice(0, 10)
    supabase.from("time_entries")
      .select("booking_item_text, net_h, project:projects(name)")
      .eq("user_id", userId).eq("client_id", clientId)
      .gte("date", first).lte("date", last)
      .then(({ data }) => {
        const entries = (data ?? []) as Pick<FetchedEntry, "booking_item_text" | "net_h" | "project">[]
        const kontoMap = new Map<string, number>()
        let total = 0
        for (const e of entries) {
          const label = e.booking_item_text || (e.project as { name: string } | null)?.name || "Sonstige"
          kontoMap.set(label, (kontoMap.get(label) ?? 0) + e.net_h)
          total += e.net_h
        }
        setPreview(
          Array.from(kontoMap.entries())
            .map(([label, stunden]) => ({ label, stunden }))
            .sort((a, b) => b.stunden - a.stunden)
        )
        setGesamtNetto(total)
        setLoadingPreview(false)
      })
  }, [clientId, month, supabase, userId])

  async function handleDownload() {
    if (!clientId) return
    setGenerating(true)
    try {
      const [year, mon] = month.split("-").map(Number)
      const first = `${year}-${mon.toString().padStart(2, "0")}-01`
      const last = new Date(year, mon, 0).toISOString().slice(0, 10)

      const [entriesRes, profileRes, clientRes] = await Promise.all([
        supabase.from("time_entries")
          .select("*, project:projects(name), task:tasks(name)")
          .eq("user_id", userId).eq("client_id", clientId)
          .gte("date", first).lte("date", last)
          .order("date").order("time_from"),
        supabase.from("users_profile").select("name, personal_nr").eq("user_id", userId).single(),
        supabase.from("clients").select("name, client_nr").eq("id", clientId).single(),
      ])

      if (entriesRes.error || profileRes.error || clientRes.error) {
        toast.error("Fehler beim Laden der Daten")
        return
      }

      const reportData = buildReportData(
        entriesRes.data as FetchedEntry[],
        profileRes.data!,
        clientRes.data!,
        year,
        mon,
      )

      const clientName = clientRes.data!.name.replace(/\s+/g, "_")
      let blob: Blob
      let filename: string

      if (format === "pdf") {
        const { generatePDF } = await import("@/lib/reports/taetigkeitsbericht-pdf")
        blob = generatePDF(reportData)
        filename = `Taetigkeitsbericht_${clientName}_${month}.pdf`
      } else {
        const { generateExcel } = await import("@/lib/reports/taetigkeitsbericht-excel")
        blob = await generateExcel(reportData)
        filename = `Taetigkeitsbericht_${clientName}_${month}.xlsx`
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Bericht heruntergeladen")
    } catch (err) {
      toast.error("Fehler: " + String(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tätigkeitsbericht exportieren</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">

          <div className="space-y-2">
            <Label>Kunde</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Kunde wählen..." /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!defaultMonth && (
            <div className="space-y-2">
              <Label>Monat</Label>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Format</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={format === "pdf" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormat("pdf")}
                className="gap-1.5"
              >
                <FileText className="h-4 w-4" /> PDF
              </Button>
              <Button
                type="button"
                variant={format === "excel" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormat("excel")}
                className="gap-1.5"
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
            </div>
          </div>

          {clientId && (
            <div className="rounded-md border">
              <div className="px-3 py-2 bg-muted/50 border-b">
                <p className="text-xs font-medium text-muted-foreground">Buchungskonten Übersicht</p>
              </div>
              {loadingPreview ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : preview.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">Keine Einträge in diesem Zeitraum</p>
              ) : (
                <div className="divide-y">
                  {preview.map((k, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-xs truncate">{k.label}</span>
                      <span className="text-xs font-mono ml-2 shrink-0">{fh(k.stunden)} h</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-1.5 font-medium bg-muted/30">
                    <span className="text-xs">Gesamt</span>
                    <span className="text-xs font-mono">{fh(gesamtNetto)} h</span>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleDownload} disabled={!clientId || generating} className="gap-2">
            {generating
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {generating ? "Wird erstellt..." : "Herunterladen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd C:/Users/youss/Documents/Claude/timori && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/taetigkeitsbericht-dialog.tsx
git commit -m "feat: add TaetigkeitsberichtDialog component"
```

---

## Task 6: Update reports page

**Files:**
- Modify: `src/app/(dashboard)/reports/page.tsx`

The existing server component is replaced with a client component. Only the Tätigkeitsbericht card gets the new dialog; the other cards remain as static placeholder links.

- [ ] **Step 1: Replace reports page**

Overwrite `src/app/(dashboard)/reports/page.tsx` with:

```tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Download } from "lucide-react"
import { TaetigkeitsberichtDialog } from "@/components/reports/taetigkeitsbericht-dialog"

const PLACEHOLDER_REPORTS = [
  { title: "Hauptbericht", description: "Zusammenfassung aller Stunden, Codes und Projekte" },
  { title: "Urlaubsübersicht", description: "Jahresübersicht Urlaub, Krankheit und Schulungen" },
  { title: "Überstundenübersicht", description: "Jahresübersicht der Überstunden nach Monat" },
  { title: "Spesenabrechnung", description: "Aktuelle Spesenabrechnung als PDF exportieren" },
]

export default function ReportsPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [supabase])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Berichte & Export</h1>
        <p className="text-muted-foreground">PDF und Excel-Exporte deiner Daten</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Tätigkeitsbericht — fully implemented */}
        <Card className="hover:bg-muted/30 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <CardTitle className="text-base">Tätigkeitsbericht</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Monatliche Zeiterfassung nach Kunden und Projekten
                  </CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!userId} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Erstellen
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Placeholder cards */}
        {PLACEHOLDER_REPORTS.map(r => (
          <Card key={r.title} className="opacity-60">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <CardTitle className="text-base">{r.title}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">{r.description}</CardDescription>
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled className="gap-1.5 text-xs">
                  Demnächst
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {userId && (
        <TaetigkeitsberichtDialog
          userId={userId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd C:/Users/youss/Documents/Claude/timori && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/reports/page.tsx
git commit -m "feat: wire TaetigkeitsberichtDialog into reports page"
```

---

## Task 7: Add export button to Zeiterfassung page

**Files:**
- Modify: `src/app/(dashboard)/time/page.tsx`

Add `reportDialogOpen` state, a "Bericht exportieren" button in the page header, and the dialog at the bottom of the JSX. The `defaultMonth` is derived from `currentDate`.

- [ ] **Step 1: Add import**

In `src/app/(dashboard)/time/page.tsx`, add to the existing imports block:

```ts
import { TaetigkeitsberichtDialog } from "@/components/reports/taetigkeitsbericht-dialog"
```

- [ ] **Step 2: Add state variable**

After the existing `const [taskSearch, setTaskSearch] = useState("")` line, add:

```ts
const [reportDialogOpen, setReportDialogOpen] = useState(false)
```

- [ ] **Step 3: Add the button to the header**

Find the header section:
```tsx
<Button onClick={openNew} className="gap-2">
  <Plus className="h-4 w-4" />
  Neuer Eintrag
</Button>
```

Replace with:
```tsx
<div className="flex gap-2">
  <Button variant="outline" onClick={() => setReportDialogOpen(true)} className="gap-2">
    <FileText className="h-4 w-4" />
    Bericht exportieren
  </Button>
  <Button onClick={openNew} className="gap-2">
    <Plus className="h-4 w-4" />
    Neuer Eintrag
  </Button>
</div>
```

- [ ] **Step 4: Add FileText to the lucide import**

Find the existing lucide import line:
```ts
import { Plus, Trash2, ChevronLeft, ChevronRight, Pencil, AlertTriangle } from "lucide-react"
```

Add `FileText`:
```ts
import { Plus, Trash2, ChevronLeft, ChevronRight, Pencil, AlertTriangle, FileText } from "lucide-react"
```

- [ ] **Step 5: Add the dialog at the bottom of the JSX**

Find the overlap dialog closing tag and the component closing tags:
```tsx
      </Dialog>
    </div>
  )
}
```

Replace with:
```tsx
      </Dialog>

      {userId && (
        <TaetigkeitsberichtDialog
          userId={userId}
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          defaultMonth={`${year}-${month.toString().padStart(2, "0")}`}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Type-check**

```bash
cd C:/Users/youss/Documents/Claude/timori && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/time/page.tsx
git commit -m "feat: add Bericht exportieren button to Zeiterfassung"
```

---

## Task 8: Manual verification

- [ ] **Step 1: Start dev server**

```bash
cd C:/Users/youss/Documents/Claude/timori && npm run dev
```

- [ ] **Step 2: Verify reports page**

Open `http://localhost:3000/reports`.
- "Erstellen" button is visible on the Tätigkeitsbericht card
- Click it → dialog opens
- Select a client → Buchungskonten Übersicht preview loads
- Select PDF → click "Herunterladen" → browser downloads a `.pdf` file
- Open the PDF → verify: header with name/client, table with days, Buchungskonten Übersicht, two signature lines
- Repeat with Excel → verify `.xlsx` opens in Excel/LibreOffice with correct structure

- [ ] **Step 3: Verify Zeiterfassung page**

Open `http://localhost:3000/time`.
- "Bericht exportieren" button visible next to "Neuer Eintrag"
- Click it → dialog opens with month pre-filled to current view (no month picker shown)
- Download works same as above

- [ ] **Step 4: Final commit if any tweaks made**

```bash
git add -p
git commit -m "fix: Tätigkeitsbericht layout tweaks after manual review"
```
