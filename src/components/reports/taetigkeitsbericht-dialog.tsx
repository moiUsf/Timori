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
        const entries = (data ?? []) as unknown as Pick<FetchedEntry, "booking_item_text" | "net_h" | "project">[]
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
