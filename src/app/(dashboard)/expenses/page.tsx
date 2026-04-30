"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { ExpenseReport, ExpenseItem } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDate, toLocalDateStr } from "@/lib/utils"
import { Plus, Trash2, ChevronRight, ChevronDown, Receipt } from "lucide-react"
import { toast } from "sonner"

const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: "hotel_inland", label: "Hotel Inland" },
  { value: "hotel_ausland", label: "Hotel Ausland" },
  { value: "flug_inland", label: "Flug Inland" },
  { value: "flug_ausland", label: "Flug Ausland" },
  { value: "bahn_inland", label: "Bahn Inland" },
  { value: "bahn_ausland", label: "Bahn Ausland" },
  { value: "taxi_inland", label: "Taxi Inland" },
  { value: "taxi_ausland", label: "Taxi Ausland" },
  { value: "privat_pkw", label: "Privater PKW (km)" },
  { value: "mietwagen", label: "Mietwagen" },
  { value: "vma", label: "Verpflegungsmehraufwendungen (VMA)" },
  { value: "internet", label: "Internetkosten" },
  { value: "porto", label: "Porto / Briefmarken" },
  { value: "burobedarf", label: "Bürobedarf" },
  { value: "fortbildung", label: "Fortbildungskosten" },
  { value: "bewirtung", label: "Bewirtung" },
  { value: "sonstiges", label: "Sonstige Ausgaben" },
]

const VMA_RATES: Record<string, number> = {
  partial_8: 14,
  partial_14: 14,
  full_24: 28,
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  submitted: "Eingereicht",
  approved: "Genehmigt",
}
const STATUS_VARIANTS: Record<string, "outline" | "secondary" | "success"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "success",
}

export default function ExpensesPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState("")
  const [reports, setReports] = useState<(ExpenseReport & { items?: ExpenseItem[] })[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [items, setItems] = useState<Record<string, ExpenseItem[]>>({})
  const [reportDialog, setReportDialog] = useState(false)
  const [itemDialog, setItemDialog] = useState(false)
  const [selectedReportId, setSelectedReportId] = useState("")
  const [reportForm, setReportForm] = useState({ month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), travel_nr: "" })
  const [itemForm, setItemForm] = useState({
    date: toLocalDateStr(new Date()),
    category: "hotel_inland",
    description: "",
    amount: "",
    km: "",
    km_rate: "0.30",
    vma_type: "none",
    receipt_count: "1",
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); loadReports(user.id) }
    })
  }, [supabase])

  async function loadReports(uid: string) {
    const { data } = await supabase.from("expense_reports").select("*").eq("user_id", uid)
      .order("year", { ascending: false }).order("month", { ascending: false })
    setReports(data ?? [])
  }

  async function loadItems(reportId: string) {
    const { data } = await supabase.from("expense_items").select("*").eq("report_id", reportId).order("date")
    setItems((prev) => ({ ...prev, [reportId]: data ?? [] }))
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) }
      else { next.add(id); loadItems(id) }
      return next
    })
  }

  async function createReport() {
    const { error } = await supabase.from("expense_reports").insert({
      user_id: userId,
      month: parseInt(reportForm.month),
      year: parseInt(reportForm.year),
      travel_nr: reportForm.travel_nr || null,
      status: "draft",
    })
    if (error) { toast.error(error.message); return }
    toast.success("Spesenabrechnung erstellt")
    setReportDialog(false)
    loadReports(userId)
  }

  async function saveItem() {
    let amount = parseFloat(itemForm.amount) || 0
    if (itemForm.category === "privat_pkw" && itemForm.km) {
      amount = parseFloat(itemForm.km) * parseFloat(itemForm.km_rate)
    }
    if (itemForm.category === "vma" && itemForm.vma_type !== "none") {
      amount = VMA_RATES[itemForm.vma_type] ?? 0
    }
    const { error } = await supabase.from("expense_items").insert({
      report_id: selectedReportId,
      date: itemForm.date,
      category: itemForm.category,
      description: itemForm.description,
      amount,
      km: itemForm.km ? parseFloat(itemForm.km) : null,
      km_rate: itemForm.category === "privat_pkw" ? parseFloat(itemForm.km_rate) : null,
      vma_type: itemForm.vma_type === "none" ? null : itemForm.vma_type,
      receipt_count: parseInt(itemForm.receipt_count),
    })
    if (error) { toast.error(error.message); return }
    toast.success("Beleg hinzugefügt")
    setItemDialog(false)
    loadItems(selectedReportId)
  }

  const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Spesenabrechnung</h1>
          <p className="text-muted-foreground">{reports.length} Abrechnungen</p>
        </div>
        <Button onClick={() => setReportDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Neue Abrechnung
        </Button>
      </div>

      <div className="space-y-2">
        {reports.map((report) => {
          const reportItems = items[report.id] ?? []
          const total = reportItems.reduce((s, i) => s + i.amount, 0)
          return (
            <Card key={report.id}>
              <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => toggleExpand(report.id)}>
                {expanded.has(report.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <span className="font-medium">{monthNames[report.month - 1]} {report.year}</span>
                  {report.travel_nr && <span className="text-xs text-muted-foreground ml-2">#{report.travel_nr}</span>}
                </div>
                {expanded.has(report.id) && total > 0 && (
                  <span className="text-sm font-medium">{total.toFixed(2)} €</span>
                )}
                <Badge variant={STATUS_VARIANTS[report.status]}>{STATUS_LABELS[report.status]}</Badge>
              </div>

              {expanded.has(report.id) && (
                <div className="border-t bg-muted/20">
                  <div className="p-3 flex justify-end">
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => { setSelectedReportId(report.id); setItemDialog(true) }}>
                      <Plus className="h-3.5 w-3.5" />
                      Beleg hinzufügen
                    </Button>
                  </div>
                  <div className="divide-y">
                    {(items[report.id] ?? []).map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5">
                        <span className="text-xs text-muted-foreground w-20 shrink-0">{formatDate(item.date)}</span>
                        <span className="text-xs font-medium shrink-0">
                          {EXPENSE_CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}
                        </span>
                        <span className="text-xs text-muted-foreground flex-1 truncate min-w-0">{item.description}</span>
                        {item.km && <span className="text-xs text-muted-foreground shrink-0">{item.km} km</span>}
                        <span className="text-sm font-medium shrink-0">{item.amount.toFixed(2)} €</span>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          onClick={async () => { await supabase.from("expense_items").delete().eq("id", item.id); loadItems(report.id) }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {(items[report.id] ?? []).length === 0 && <p className="px-6 py-3 text-xs text-muted-foreground">Keine Belege</p>}
                  </div>
                  {(items[report.id] ?? []).length > 0 && (
                    <div className="flex justify-end px-6 py-3 border-t font-medium text-sm">
                      Gesamt: {total.toFixed(2)} €
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
        {reports.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">Noch keine Abrechnungen</p>}
      </div>

      {/* Report dialog */}
      <Dialog open={reportDialog} onOpenChange={setReportDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Spesenabrechnung</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monat</Label>
                <Select value={reportForm.month} onValueChange={(v) => setReportForm({ ...reportForm, month: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNames.map((n, i) => <SelectItem key={i + 1} value={String(i + 1)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jahr</Label>
                <Input type="number" value={reportForm.year} onChange={(e) => setReportForm({ ...reportForm, year: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reisenummer (optional)</Label>
              <Input value={reportForm.travel_nr} onChange={(e) => setReportForm({ ...reportForm, travel_nr: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialog(false)}>Abbrechen</Button>
            <Button onClick={createReport}>Erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item dialog */}
      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Beleg hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Datum</Label>
                <Input type="date" value={itemForm.date} onChange={(e) => setItemForm({ ...itemForm, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Kategorie</Label>
                <Select value={itemForm.category} onValueChange={(v) => setItemForm({ ...itemForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Beschreibung</Label>
              <Input value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
            </div>
            {itemForm.category === "privat_pkw" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Kilometer</Label>
                  <Input type="number" step="0.1" value={itemForm.km} onChange={(e) => setItemForm({ ...itemForm, km: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>km-Satz (€/km)</Label>
                  <Input type="number" step="0.001" value={itemForm.km_rate} onChange={(e) => setItemForm({ ...itemForm, km_rate: e.target.value })} />
                </div>
              </div>
            ) : itemForm.category === "vma" ? (
              <div className="space-y-2">
                <Label>VMA-Art</Label>
                <Select value={itemForm.vma_type} onValueChange={(v) => setItemForm({ ...itemForm, vma_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="partial_8">{"< 8 Std. (0 €)"}</SelectItem>
                    <SelectItem value="partial_14">{"8–14 Std. (14 €)"}</SelectItem>
                    <SelectItem value="full_24">{"24 Std. (28 €)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Betrag (€)</Label>
                <Input type="number" step="0.01" value={itemForm.amount} onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Anzahl Belege</Label>
              <Input type="number" min="0" value={itemForm.receipt_count} onChange={(e) => setItemForm({ ...itemForm, receipt_count: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(false)}>Abbrechen</Button>
            <Button onClick={saveItem}>Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
