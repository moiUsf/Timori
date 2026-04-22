"use client"

import { useEffect, useState } from "react"
import { FileSpreadsheet, Download } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import {
  buildDynamischesBerichtData,
  generateDynamischesBerichtExcel,
  type DynamischeGruppierung,
} from "@/lib/reports/dynamisches-bericht"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface DynamischesBerichtDialogProps {
  userId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Client {
  id: string
  name: string
}

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"

const GROUPING_OPTIONS: { value: DynamischeGruppierung; label: string }[] = [
  { value: "buchungsposten", label: "Buchungsposten" },
  { value: "projekt",        label: "Projekt" },
  { value: "aufgabe",        label: "Aufgabe" },
  { value: "kunde",          label: "Kunde" },
]

export function DynamischesBerichtDialog({ userId, open, onOpenChange }: DynamischesBerichtDialogProps) {
  const supabase = createClient()
  const [month, setMonth] = useState(currentYearMonth)
  const [grouping, setGrouping] = useState<DynamischeGruppierung>("buchungsposten")
  const [clients, setClients] = useState<Client[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())  // empty = alle
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !userId) return
    supabase
      .from("clients")
      .select("id, name")
      .eq("user_id", userId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setClients((data as Client[]) ?? []))
  }, [open, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleClient(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    // If all are selected (or none = "alle"), clear to "alle"; otherwise select all
    setSelectedIds(prev =>
      prev.size === clients.length ? new Set() : new Set(clients.map(c => c.id))
    )
  }

  const allSelected = clients.length > 0 && selectedIds.size === clients.length
  const someSelected = selectedIds.size > 0 && !allSelected

  async function handleExport() {
    const [year, mon] = month.split("-").map(Number)
    setLoading(true)
    try {
      const filterIds = selectedIds.size > 0 ? Array.from(selectedIds) : undefined
      const { rows, monthLabel, mitarbeiter } = await buildDynamischesBerichtData(
        supabase, userId, year, mon, grouping, filterIds,
      )
      const blob = await generateDynamischesBerichtExcel(rows, grouping, monthLabel, mitarbeiter)
      const safeName = mitarbeiter.replace(/\s+/g, "_") || "Export"
      triggerDownload(
        blob,
        `Dynamisches_Bericht_${grouping}_${safeName}_${year}_${String(mon).padStart(2, "0")}.xlsx`,
      )
      toast.success("Dynamisches Bericht heruntergeladen")
    } catch (err) {
      console.error(err)
      toast.error("Fehler beim Erstellen des Berichts")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Dynamisches Bericht erstellen</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Monat</Label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className={SELECT_CLASS}
            />
          </div>

          {clients.length > 0 && (
            <div className="space-y-2">
              <Label>Kunden</Label>
              <div className="rounded-md border border-input bg-background p-2 space-y-1 max-h-40 overflow-y-auto">
                {/* Alle-Toggle mit indeterminate-Support */}
                <label className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-muted/40 select-none">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm text-muted-foreground">Alle Kunden</span>
                </label>
                <div className="border-t border-border my-1" />
                {clients.map(c => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-muted/40 select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleClient(c.id)}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))}
              </div>
              {selectedIds.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedIds.size} von {clients.length} Kunden ausgewählt
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Gruppierung</Label>
            <select
              value={grouping}
              onChange={e => setGrouping(e.target.value as DynamischeGruppierung)}
              className={SELECT_CLASS}
            >
              {GROUPING_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <Button
            className="w-full gap-2"
            onClick={handleExport}
            disabled={loading}
          >
            {loading
              ? <Download className="h-4 w-4 animate-bounce" />
              : <FileSpreadsheet className="h-4 w-4" />
            }
            Excel herunterladen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
