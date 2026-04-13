# Tätigkeitsbericht — Design Spec
**Date:** 2026-04-11  
**Status:** Approved

---

## Overview

Add a Tätigkeitsbericht (activity report) export feature to Timori. Users can generate a formatted monthly report per client as PDF or Excel. The report follows the standard German consulting format with a day-by-day table, multiple entries per day clearly listed, and a Buchungskonten Übersicht summary at the bottom.

---

## Entry Points

### 1. Berichte & Export Page (`/reports`)
- Tätigkeitsbericht card gets an interactive "Erstellen" button
- Opens `TaetigkeitsberichtDialog` with full controls: Kunde + Monat + Format

### 2. Zeiterfassung Page (`/time`)
- New "Bericht exportieren" button next to "Neuer Eintrag"
- Opens `TaetigkeitsberichtDialog` with `defaultMonth` pre-set to current view month
- User only selects Kunde + Format; month picker is hidden

---

## Technical Approach

**Client-side generation** — no API route required.

- PDF: `jsPDF` + `@jspdf/autotable`
- Excel: `exceljs` (browser build)
- Data fetched from Supabase directly in the dialog component
- File downloaded via browser blob URL

---

## Data Fetched

```ts
// Time entries for the selected client + month
supabase
  .from("time_entries")
  .select("*, project:projects(name), task:tasks(name)")
  .eq("user_id", userId)
  .eq("client_id", clientId)
  .gte("date", firstOfMonth)
  .lte("date", lastOfMonth)
  .order("date").order("time_from")

// User profile (name, personal_nr)
supabase.from("users_profile").select("name, personal_nr").eq("user_id", userId).single()

// Client (name, client_nr)
supabase.from("clients").select("name, client_nr").eq("id", clientId).single()
```

---

## Report Structure

### Header
```
TÄTIGKEITSBERICHT                    März 2026

Name: Youssef El Ouatiq    Mitarbeiter-Nr.: 12345
Kunde: SPV_ENI             Kunden-Nr.: 00006
```

### Main Table

Columns: `WT | Tag | von | bis | Tätigkeit | Brutto | Pause | Netto | Tages-Netto`

**Single entry per day:**
```
│ Mo │ 02. Mrz │ 09:00 │ 17:00 │ 4800061526 - Support PO/PO │ 8,0 │ 00:30 │ 7,5 │ 7,5 │
```

**Multiple entries per day:**
```
│ Mo │ 02. Mrz │ 09:00 │ 12:00 │ 4800061526 - Support PO/PO │ 3,0 │       │ 3,0 │     │
│    │         │ 13:00 │ 17:00 │ 4800062265 - Integr. Suite │ 4,0 │       │ 4,0 │ 6,5 │
```

- `WT` and `Tag` shown only on first row of each day; empty for subsequent rows
- `Tages-Netto` shown only on the last row of each day
- Weekends (Sa/So) shown as empty rows with date but no time data
- `Tätigkeit` = `booking_item_text` + `" - "` + `task.name`, assembled as:
  - Both set: `"4800061526 - Support PO/PO - INTPLAT-281"`
  - Only booking_item_text: `"4800061526 - Support PO/PO"`
  - Only task: `"INTPLAT-281"`
  - Neither: `description` if set, otherwise `project.name`

**Pause per row:**
- Display `entry.break_min` formatted as `HH:MM` (e.g. 30 → `00:30`); empty if 0

**Tages-Netto** = sum of all `entry.net_h` for the day (net_h already accounts for each entry's break_min)

### Footer

**Buchungskonten Übersicht**
```
┌─────────────────────────────────────┬──────────┐
│ 4800061526 - Support PO/PO          │  25,5 h  │
│ 4800062265 - Integration Suite      │  10,0 h  │
│ Gesamt                              │  35,5 h  │
└─────────────────────────────────────┴──────────┘
```

Aggregated by `booking_item_text`. Entries without a booking_item_text are grouped under the project name.

**Signature area:**
```
Kostenstelle: ____________   Bemerkungen: ____________

Unterschrift Auftragnehmer: ____________   Unterschrift Kunde: ____________
```

---

## Dialog UI (`TaetigkeitsberichtDialog`)

```
Props:
  userId: string
  defaultMonth?: string   // "YYYY-MM" — if set, month picker hidden
  open: boolean
  onOpenChange: (open: boolean) => void
```

**Controls shown:**
1. Kunde — Select (all active clients)
2. Monat — `<input type="month">` (hidden when `defaultMonth` provided)
3. Format — Radio: PDF | Excel

**Preview section** (loads when Kunde + Monat set):
- Table: Buchungsposten | Stunden — sorted by hours descending
- Footer row: Gesamt | X,X h

**Actions:**
- "Abbrechen" — close dialog
- "Herunterladen" — generate + download file, disabled until Kunde selected

**Filename:**
- PDF: `Taetigkeitsbericht_[KundenName]_[YYYY-MM].pdf`
- Excel: `Taetigkeitsbericht_[KundenName]_[YYYY-MM].xlsx`

---

## German Formatting

| What | Format |
|------|--------|
| Weekdays | Mo, Di, Mi, Do, Fr, Sa, So |
| Month abbreviations | Jan, Feb, Mrz, Apr, Mai, Jun, Jul, Aug, Sep, Okt, Nov, Dez |
| Day format in table | `02. Mrz` |
| Decimal hours | `2,5` (comma, not dot) |
| Pause | `00:30` (HH:MM) |
| Header date | `März 2026` (full month name, German) |

---

## New Files

| File | Purpose |
|------|---------|
| `src/lib/reports/taetigkeitsbericht-data.ts` | Data fetching + day-grouping logic |
| `src/lib/reports/taetigkeitsbericht-pdf.ts` | jsPDF PDF generator |
| `src/lib/reports/taetigkeitsbericht-excel.ts` | exceljs Excel generator |
| `src/components/reports/taetigkeitsbericht-dialog.tsx` | Modal component |

## Modified Files

| File | Change |
|------|--------|
| `src/app/(dashboard)/reports/page.tsx` | Convert to `"use client"`, wire up dialog |
| `src/app/(dashboard)/time/page.tsx` | Add "Bericht exportieren" button + dialog |
| `package.json` | Add `jspdf`, `jspdf-autotable`, `exceljs` |
