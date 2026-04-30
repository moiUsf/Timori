"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { toLocalDateStr } from "@/lib/utils"
import type { Client } from "@/types/database"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, FileSpreadsheet, Download, Loader2, ChevronDown, ChevronUp as ChevronUpIcon, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import {
  buildReportData, buildPreviewRows, recalcTagesNetto, calcBrutto,
  type FetchedEntry, type PreviewRow,
  DEFAULT_TAETIGKEIT_FIELDS, type TaetigkeitField,
} from "@/lib/reports/taetigkeitsbericht-data"
import type { PdfLabels } from "@/lib/reports/taetigkeitsbericht-pdf"

interface TaetigkeitsberichtDialogProps {
  userId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultMonth?: string  // "YYYY-MM" — if provided, month picker is hidden
}

function fh(h: number): string {
  return h === 0 ? "" : h.toFixed(1).replace(".", ",")
}

function fPause(min: number): string {
  if (!min) return ""
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${m.toString().padStart(2, "0")}`
}

type FieldItem = { field: TaetigkeitField; enabled: boolean }

function buildFieldItems(active: TaetigkeitField[]): FieldItem[] {
  const ALL: TaetigkeitField[] = ["booking_item", "task", "description", "project"]
  const activeSet = new Set(active)
  const inactive = ALL.filter(f => !activeSet.has(f))
  return [
    ...active.map(f => ({ field: f, enabled: true })),
    ...inactive.map(f => ({ field: f, enabled: false })),
  ]
}

export function TaetigkeitsberichtDialog({
  userId, open, onOpenChange, defaultMonth,
}: TaetigkeitsberichtDialogProps) {
  const supabase = createClient()
  const t = useTranslations("reports")
  const tCommon = useTranslations("common")
  const tSettings = useTranslations("settings")

  // ── Step 1 state ──────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState("")
  const [month, setMonth] = useState(defaultMonth ?? new Date().toISOString().slice(0, 7))
  const [format, setFormat] = useState<"pdf" | "excel">("pdf")
  const [kontoPreview, setKontoPreview] = useState<{ label: string; stunden: number }[]>([])
  const [gesamtNetto, setGesamtNetto] = useState(0)
  const [loadingKonto, setLoadingKonto] = useState(false)
  const [fieldItems, setFieldItems] = useState<FieldItem[]>(buildFieldItems(DEFAULT_TAETIGKEIT_FIELDS))
  const [configOpen, setConfigOpen] = useState(false)
  const [loadingStep2, setLoadingStep2] = useState(false)

  // ── Step 2 state ──────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [fetchedEntries, setFetchedEntries] = useState<FetchedEntry[]>([])
  const [profileData, setProfileData] = useState<{ name: string; personal_nr: string | null } | null>(null)
  const [clientData, setClientData] = useState<{ name: string; client_nr: string | null } | null>(null)
  const [generating, setGenerating] = useState(false)

  // ── Load clients on mount ──────────────────────────────────
  useEffect(() => {
    supabase.from("clients").select("*").eq("user_id", userId).eq("active", true).order("name")
      .then(({ data }) => setClients(data ?? []))
  }, [supabase, userId])

  // ── Load profile report_config when dialog opens ───────────
  useEffect(() => {
    if (!open) return
    setStep(1)
    supabase.from("users_profile").select("report_config").eq("user_id", userId).single()
      .then(({ data }) => {
        const active = data?.report_config?.taetigkeit_fields ?? DEFAULT_TAETIGKEIT_FIELDS
        setFieldItems(buildFieldItems(active))
      })
  }, [open, supabase, userId])

  // ── Booking overview preview (step 1) ─────────────────────
  useEffect(() => {
    if (!clientId || !month) { setKontoPreview([]); setGesamtNetto(0); return }
    setLoadingKonto(true)
    const [year, mon] = month.split("-").map(Number)
    const first = `${year}-${mon.toString().padStart(2, "0")}-01`
    const last = toLocalDateStr(new Date(year, mon, 0))
    supabase.from("time_entries")
      .select("booking_item_text, net_h, project:projects(name)")
      .eq("user_id", userId).eq("client_id", clientId)
      .gte("date", first).lte("date", last)
      .then(({ data }) => {
        const entries = (data ?? []) as unknown as Pick<FetchedEntry, "booking_item_text" | "net_h" | "project">[]
        const kontoMap = new Map<string, number>()
        let total = 0
        for (const e of entries) {
          const label = e.booking_item_text || (e.project as { name: string } | null)?.name || t("misc")
          kontoMap.set(label, (kontoMap.get(label) ?? 0) + e.net_h)
          total += e.net_h
        }
        setKontoPreview(
          Array.from(kontoMap.entries())
            .map(([label, stunden]) => ({ label, stunden }))
            .sort((a, b) => b.stunden - a.stunden)
        )
        setGesamtNetto(total)
        setLoadingKonto(false)
      })
  }, [clientId, month, supabase, userId, t])

  // ── Field manipulation ────────────────────────────────────
  function moveFieldUp(i: number) {
    if (i === 0) return
    const items = [...fieldItems]
    ;[items[i - 1], items[i]] = [items[i], items[i - 1]]
    setFieldItems(items)
  }
  function moveFieldDown(i: number) {
    if (i === fieldItems.length - 1) return
    const items = [...fieldItems]
    ;[items[i + 1], items[i]] = [items[i], items[i + 1]]
    setFieldItems(items)
  }
  function toggleField(i: number) {
    const items = [...fieldItems]
    items[i] = { ...items[i], enabled: !items[i].enabled }
    setFieldItems(items)
  }

  const FIELD_LABELS: Record<TaetigkeitField, string> = {
    booking_item: tSettings("fieldBookingItem"),
    task: tSettings("fieldTask"),
    description: tSettings("fieldDescription"),
    project: tSettings("fieldProject"),
  }

  function getActiveFields(): TaetigkeitField[] {
    const active = fieldItems.filter(f => f.enabled).map(f => f.field)
    return active.length > 0 ? active : DEFAULT_TAETIGKEIT_FIELDS
  }

  // ── PDF label builder ──────────────────────────────────────
  function getPdfLabels(): PdfLabels {
    return {
      title: t("pdfTitle"),
      nameLabel: t("pdfNameLabel"),
      employeeNr: t("pdfEmployeeNr"),
      client: t("pdfClient"),
      clientNr: t("pdfClientNr"),
      colWeekday: t("pdfColWeekday"),
      colDay: t("pdfColDay"),
      colFrom: t("pdfColFrom"),
      colTo: t("pdfColTo"),
      colActivity: t("pdfColActivity"),
      colGross: t("pdfColGross"),
      colBreak: t("pdfColBreak"),
      colNet: t("pdfColNet"),
      colDailyNet: t("pdfColDailyNet"),
      bookingOverview: t("pdfBookingOverview"),
      total: t("pdfTotal"),
      costCenter: t("pdfCostCenter"),
      remarks: t("pdfRemarks"),
      signatureContractor: t("pdfSignatureContractor"),
      signatureClient: t("pdfSignatureClient"),
    }
  }

  // ── Load step 2: fetch entries + build preview rows ────────
  async function handleLoadPreview() {
    if (!clientId) return
    setLoadingStep2(true)
    try {
      const [year, mon] = month.split("-").map(Number)
      const first = `${year}-${mon.toString().padStart(2, "0")}-01`
      const last = toLocalDateStr(new Date(year, mon, 0))

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
        toast.error(t("errorLoading"))
        return
      }

      const rows = buildPreviewRows(entriesRes.data as FetchedEntry[], year, mon, getActiveFields())
      setFetchedEntries(entriesRes.data as FetchedEntry[])
      setProfileData(profileRes.data!)
      setClientData(clientRes.data!)
      setPreviewRows(rows)
      setStep(2)
    } catch (err) {
      toast.error(tCommon("error") + ": " + String(err))
    } finally {
      setLoadingStep2(false)
    }
  }

  // ── Step 2: row editing ────────────────────────────────────
  function updateRow(i: number, changes: Partial<PreviewRow>) {
    setPreviewRows(prev => {
      const rows = prev.map((r, idx) => idx === i ? { ...r, ...changes } : r)
      return recalcTagesNetto(rows)
    })
  }

  function handleVonChange(i: number, value: string) {
    const row = previewRows[i]
    const brutto = calcBrutto(value, row.bis)
    const netto = Math.round(Math.max(0, brutto - row.break_min / 60) * 10) / 10
    updateRow(i, { von: value, brutto, netto, vonDirty: value !== row.originalVon })
  }

  function handleBisChange(i: number, value: string) {
    const row = previewRows[i]
    const brutto = calcBrutto(row.von, value)
    const netto = Math.round(Math.max(0, brutto - row.break_min / 60) * 10) / 10
    updateRow(i, { bis: value, brutto, netto, bisDirty: value !== row.originalBis })
  }

  function handleTaetigkeitChange(i: number, value: string) {
    updateRow(i, { taetigkeit: value })
  }

  function handlePauseChange(i: number, minutes: number) {
    const row = previewRows[i]
    const netto = Math.round(Math.max(0, row.brutto - minutes / 60) * 10) / 10
    updateRow(i, { break_min: minutes, netto, pauseDirty: true })
  }

  // ── Download from step 2 ───────────────────────────────────
  async function handleDownload() {
    setGenerating(true)
    try {
      const [year, mon] = month.split("-").map(Number)

      // Validate times
      const invalid = previewRows.filter(r => r.id && r.von && r.bis &&
        (r.von >= r.bis || calcBrutto(r.von, r.bis) <= 0))
      if (invalid.length > 0) {
        const dates = [...new Set(invalid.map(r => r.dayLabel || r.date))].join(", ")
        toast.error(`${t("validationBisAfterVon")} (${dates})`)
        return
      }

      // Update dirty rows in DB
      const dirty = previewRows.filter(r => r.id && (r.vonDirty || r.bisDirty || r.pauseDirty))
      if (dirty.length > 0) {
        const results = await Promise.all(dirty.map(r =>
          supabase.from("time_entries").update({
            time_from: r.von.length === 5 ? r.von + ":00" : r.von,
            time_to: r.bis.length === 5 ? r.bis + ":00" : r.bis,
            gross_h: r.brutto,
            net_h: r.netto,
            break_min: r.break_min,
          }).eq("id", r.id).select("id")
        ))
        const failed = results.filter(res => res.error || !res.data?.length)
        if (failed.length > 0) {
          const msg = failed[0].error?.message ?? "Update fehlgeschlagen"
          toast.error(`${failed.length} Einträge nicht gespeichert: ${msg}`)
          return
        }
        toast.success(`${dirty.length} Einträge aktualisiert`)
      }

      // Build taetigkeitOverride (taetigkeit changes are NOT saved to DB)
      const taetigkeitOverride: Record<string, string> = {}
      for (const r of previewRows) {
        if (r.id) taetigkeitOverride[r.id] = r.taetigkeit
      }

      // Build modified FetchedEntries
      const modifiedEntries: FetchedEntry[] = fetchedEntries.map(e => {
        const row = previewRows.find(r => r.id === e.id)
        if (!row) return e
        return {
          ...e,
          time_from: row.von.length === 5 ? row.von + ":00" : row.von,
          time_to: row.bis.length === 5 ? row.bis + ":00" : row.bis,
          gross_h: row.brutto,
          net_h: row.netto,
        }
      })

      const reportData = buildReportData(
        modifiedEntries,
        profileData!,
        clientData!,
        year,
        mon,
        getActiveFields(),
        taetigkeitOverride,
      )

      const clientName = clientData!.name.replace(/\s+/g, "_")
      let blob: Blob
      let filename: string

      if (format === "pdf") {
        const { generatePDF } = await import("@/lib/reports/taetigkeitsbericht-pdf")
        blob = generatePDF(reportData, getPdfLabels())
        filename = `${t("filenamePdf")}_${clientName}_${month}.pdf`
      } else {
        const { generateExcel } = await import("@/lib/reports/taetigkeitsbericht-excel")
        blob = await generateExcel(reportData)
        filename = `${t("filenameExcel")}_${clientName}_${month}.xlsx`
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      toast.success(t("downloaded"))
      onOpenChange(false)
    } catch (err) {
      toast.error(tCommon("error") + ": " + String(err))
    } finally {
      setGenerating(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === 2 ? "sm:max-w-5xl max-h-[90vh] flex flex-col" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? t("dialogTitle") : t("previewTitle")}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <>
            <div className="space-y-4 py-2">

              {/* Client */}
              <div className="space-y-2">
                <Label>{t("client")}</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder={t("clientPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Month */}
              {!defaultMonth && (
                <div className="space-y-2">
                  <Label>{t("month")}</Label>
                  <input
                    type="month" value={month} onChange={e => setMonth(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              )}

              {/* Format */}
              <div className="space-y-2">
                <Label>{t("format")}</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={format === "pdf" ? "default" : "outline"} size="sm"
                    onClick={() => setFormat("pdf")} className="gap-1.5">
                    <FileText className="h-4 w-4" /> PDF
                  </Button>
                  <Button type="button" variant={format === "excel" ? "default" : "outline"} size="sm"
                    onClick={() => setFormat("excel")} className="gap-1.5">
                    <FileSpreadsheet className="h-4 w-4" /> Excel
                  </Button>
                </div>
              </div>

              {/* Tätigkeit config (collapsible) */}
              <div className="rounded-md border">
                <button type="button" onClick={() => setConfigOpen(v => !v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                  <span>{t("activityConfig")}</span>
                  {configOpen ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {configOpen && (
                  <div className="border-t divide-y">
                    {fieldItems.map((item, i) => (
                      <div key={item.field} className="flex items-center gap-2 px-3 py-1.5">
                        <input type="checkbox" checked={item.enabled} onChange={() => toggleField(i)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary cursor-pointer" />
                        <span className={`flex-1 text-xs ${item.enabled ? "" : "text-muted-foreground"}`}>
                          {FIELD_LABELS[item.field]}
                        </span>
                        <div className="flex gap-0.5">
                          <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                            onClick={() => moveFieldUp(i)} disabled={i === 0}>
                            <ChevronUpIcon className="h-3 w-3" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                            onClick={() => moveFieldDown(i)} disabled={i === fieldItems.length - 1}>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Booking overview preview */}
              {clientId && (
                <div className="rounded-md border">
                  <div className="px-3 py-2 bg-muted/50 border-b">
                    <p className="text-xs font-medium text-muted-foreground">{t("bookingOverview")}</p>
                  </div>
                  {loadingKonto ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : kontoPreview.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">{t("noEntries")}</p>
                  ) : (
                    <div className="divide-y">
                      {kontoPreview.map((k, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5">
                          <span className="text-xs truncate">{k.label}</span>
                          <span className="text-xs font-mono ml-2 shrink-0">{k.stunden.toFixed(1).replace(".", ",")} h</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-3 py-1.5 font-medium bg-muted/30">
                        <span className="text-xs">{t("total")}</span>
                        <span className="text-xs font-mono">{gesamtNetto.toFixed(1).replace(".", ",")} h</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
              <Button onClick={handleLoadPreview} disabled={!clientId || loadingStep2} className="gap-2">
                {loadingStep2 ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {loadingStep2 ? tCommon("loading") : t("previewLoad")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* ── Step 2: Editable preview table ── */
          <>
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-muted z-10">
                  <tr>
                    <th className="border px-1.5 py-1 text-center font-medium w-8">{t("pdfColWeekday")}</th>
                    <th className="border px-1.5 py-1 text-center font-medium w-20">{t("pdfColDay")}</th>
                    <th className="border px-1.5 py-1 text-center font-medium w-20">{t("pdfColFrom")}</th>
                    <th className="border px-1.5 py-1 text-center font-medium w-20">{t("pdfColTo")}</th>
                    <th className="border px-1.5 py-1 font-medium">{t("pdfColActivity")}</th>
                    <th className="border px-1.5 py-1 text-center font-medium w-14">{t("pdfColGross")}</th>
                    <th className="border px-1.5 py-1 text-center font-medium w-16">{t("pdfColBreak")}</th>
                    <th className="border px-1.5 py-1 text-center font-medium w-14">{t("pdfColNet")}</th>
                    <th className="border px-1.5 py-1 text-center font-medium w-16">{t("pdfColDailyNet")}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => {
                    const isFirst = i === 0 || previewRows[i - 1].date !== row.date
                    const isLastOfDay = i === previewRows.length - 1 || previewRows[i + 1].date !== row.date
                    const rowSpanCount = previewRows.filter(r => r.date === row.date).length

                    const weekendStyle = row.isWeekend ? "text-muted-foreground bg-muted/30" : ""
                    const dirtyStyle = (row.vonDirty || row.bisDirty || row.pauseDirty) ? "bg-blue-50 dark:bg-blue-950/30" : ""
                    const isInvalid = !!row.id && !!row.von && !!row.bis && (row.von >= row.bis || calcBrutto(row.von, row.bis) <= 0)
                    const invalidStyle = isInvalid ? "bg-red-100 dark:bg-red-950/40" : ""

                    return (
                      <tr key={`${row.date}-${i}`} className={`${weekendStyle} ${dirtyStyle} ${invalidStyle}`}>
                        {isFirst && (
                          <td className="border px-1.5 py-0.5 text-center font-medium" rowSpan={rowSpanCount}>
                            {row.weekday}
                          </td>
                        )}
                        {isFirst && (
                          <td className="border px-1.5 py-0.5" rowSpan={rowSpanCount}>
                            {row.dayLabel}
                          </td>
                        )}
                        <td className="border px-0.5 py-0.5">
                          {!!row.id ? (
                            <input type="time" value={row.von} onChange={e => handleVonChange(i, e.target.value)}
                              className="w-full bg-transparent text-xs text-center focus:outline-none focus:bg-accent/50 rounded px-0.5" />
                          ) : null}
                        </td>
                        <td className="border px-0.5 py-0.5">
                          {!!row.id ? (
                            <input type="time" value={row.bis} onChange={e => handleBisChange(i, e.target.value)}
                              className="w-full bg-transparent text-xs text-center focus:outline-none focus:bg-accent/50 rounded px-0.5" />
                          ) : null}
                        </td>
                        <td className="border px-0.5 py-0.5">
                          {!!row.id ? (
                            <input type="text" value={row.taetigkeit} onChange={e => handleTaetigkeitChange(i, e.target.value)}
                              className="w-full bg-transparent text-xs focus:outline-none focus:bg-accent/50 rounded px-1" />
                          ) : null}
                        </td>
                        <td className="border px-1.5 py-0.5 text-center font-mono">{fh(row.brutto)}</td>
                        <td className="border px-0.5 py-0.5 text-center">
                          {!!row.id ? (
                            <input
                              type="number" min={0} step={0.5} value={row.break_min === 0 ? "" : row.break_min / 60}
                              placeholder="0"
                              onChange={e => handlePauseChange(i, Math.max(0, Math.round(parseFloat(e.target.value || "0") * 60)))}
                              className="w-full bg-transparent text-xs text-center font-mono focus:outline-none focus:bg-accent/50 rounded px-0.5"
                            />
                          ) : null}
                        </td>
                        <td className="border px-1.5 py-0.5 text-center font-mono">{fh(row.netto)}</td>
                        <td className="border px-1.5 py-0.5 text-center font-mono font-medium">
                          {isLastOfDay && row.tagesNetto > 0 ? fh(row.tagesNetto) : ""}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Summary below table ─────────────────────────────── */}
            {(() => {
              const totalNetto = Math.round(previewRows.reduce((s, r) => s + r.netto, 0) * 10) / 10
              const totalBrutto = Math.round(previewRows.reduce((s, r) => s + r.brutto, 0) * 10) / 10

              const kontoMap = new Map<string, number>()
              for (const row of previewRows) {
                if (!row.id) continue
                const entry = fetchedEntries.find(e => e.id === row.id)
                const label = entry?.booking_item_text || (entry?.project as { name: string } | null)?.name || t("misc")
                kontoMap.set(label, Math.round(((kontoMap.get(label) ?? 0) + row.netto) * 10) / 10)
              }
              const buchungskonten = Array.from(kontoMap.entries())
                .map(([label, stunden]) => ({ label, stunden }))
                .sort((a, b) => b.stunden - a.stunden)

              return (
                <div className="border-t shrink-0 px-3 py-2 space-y-2 bg-muted/20">
                  {/* Totals */}
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>{t("pdfTotal")}</span>
                    <span className="font-mono">
                      {String(totalBrutto.toFixed(1)).replace(".", ",")} h {t("pdfColGross")} / {String(totalNetto.toFixed(1)).replace(".", ",")} h {t("pdfColNet")}
                    </span>
                  </div>
                  {/* Grouped by booking item */}
                  {buchungskonten.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">{t("pdfBookingOverview")}</p>
                      {buchungskonten.map((k, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate">{k.label}</span>
                          <span className="font-mono ml-3 shrink-0">{String(k.stunden.toFixed(1)).replace(".", ",")} h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            <DialogFooter className="pt-2 border-t shrink-0">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {t("previewBack")}
              </Button>
              <Button onClick={handleDownload} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {generating ? t("generating") : t("downloadSave")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
