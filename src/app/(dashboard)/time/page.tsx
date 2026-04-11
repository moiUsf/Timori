"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { TimeEntry, Client, Project, Task } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatHours, formatDate, hoursFromTimeRange } from "@/lib/utils"
import { Plus, Trash2, ChevronLeft, ChevronRight, Pencil, AlertTriangle, FileText } from "lucide-react"
import { toast } from "sonner"
import { TaetigkeitsberichtDialog } from "@/components/reports/taetigkeitsbericht-dialog"

type TaskWithBooking = Task & { default_booking_item?: { id: string; name: string } | null }
type EntryWithRelations = TimeEntry & { client: Client; project: Project; task?: Task }

const HOUR_CODES = ["BEV", "BENV", "RZV", "RZNV"] as const

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  time_from: "09:00",
  time_to: "17:00",
  break_min: "0",
  client_id: "",
  project_id: "",
  code: "BEV" as typeof HOUR_CODES[number],
  description: "",
  remote: false,
  task_id: "",
  booking_item_text: "",
})

export default function TimePage() {
  const supabase = createClient()
  const [entries, setEntries] = useState<EntryWithRelations[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<TaskWithBooking[]>([])
  const [bookingItems, setBookingItems] = useState<{ id: string; name: string }[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<EntryWithRelations | null>(null)
  const [userId, setUserId] = useState<string>("")
  const [form, setForm] = useState(emptyForm())
  const [bookingItemAutoSet, setBookingItemAutoSet] = useState(false)
  const [projectSearch, setProjectSearch] = useState("")
  const [taskSearch, setTaskSearch] = useState("")
  const [overlapConflicts, setOverlapConflicts] = useState<EntryWithRelations[]>([])
  const [showOverlapDialog, setShowOverlapDialog] = useState(false)
  const [reportDialogOpen, setReportDialogOpen] = useState(false)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const startOfMonth = `${year}-${month.toString().padStart(2, "0")}-01`
  const endOfMonth = new Date(year, month, 0).toISOString().slice(0, 10)

  const loadEntries = useCallback(async () => {
    const { data } = await supabase
      .from("time_entries")
      .select("*, client:clients(*), project:projects(*), task:tasks(*)")
      .eq("user_id", userId)
      .gte("date", startOfMonth)
      .lte("date", endOfMonth)
      .order("date", { ascending: false })
      .order("time_from", { ascending: false })
    if (data) setEntries(data as EntryWithRelations[])
  }, [supabase, userId, startOfMonth, endOfMonth])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        supabase.from("clients").select("*").eq("user_id", user.id).eq("active", true).order("name")
          .then(({ data }) => setClients(data ?? []))
      }
    })
  }, [supabase])

  useEffect(() => { if (userId) loadEntries() }, [userId, loadEntries])

  // Load projects + booking items when client changes
  useEffect(() => {
    if (!form.client_id || !userId) { setProjects([]); setBookingItems([]); return }
    Promise.all([
      supabase.from("projects").select("*").eq("client_id", form.client_id).eq("active", true).order("name"),
      supabase.from("booking_items").select("id, name")
        .eq("user_id", userId)
        .or(`client_id.eq.${form.client_id},client_id.is.null`)
        .eq("active", true).order("name"),
    ]).then(([pRes, bRes]) => {
      setProjects(pRes.data ?? [])
      setBookingItems(bRes.data ?? [])
    })
  }, [form.client_id, supabase, userId])

  // Load tasks when project or client changes
  useEffect(() => {
    if (!userId) return

    async function loadTasks() {
      // Tasks without project: match client or have no client
      const noProjectBase = supabase.from("tasks")
        .select("*, default_booking_item:booking_items(id,name)")
        .eq("user_id", userId).is("project_id", null).eq("active", true).order("name")

      const noProjectRes = form.client_id
        ? await noProjectBase.or(`client_id.eq.${form.client_id},client_id.is.null`)
        : await noProjectBase

      if (!form.project_id) {
        setTasks((noProjectRes.data ?? []) as TaskWithBooking[])
        return
      }

      const projRes = await supabase.from("tasks")
        .select("*, default_booking_item:booking_items(id,name)")
        .eq("project_id", form.project_id).eq("active", true).order("name")

      const combined = [...(projRes.data ?? []), ...(noProjectRes.data ?? [])] as TaskWithBooking[]
      combined.sort((a, b) => a.name.localeCompare(b.name))
      setTasks(combined)
    }

    loadTasks()
  }, [form.project_id, form.client_id, supabase, userId])

  function openNew() {
    setEditingEntry(null)
    setForm(emptyForm())
    setBookingItemAutoSet(false)
    setProjectSearch("")
    setTaskSearch("")
    setShowForm(true)
  }

  function openEdit(entry: EntryWithRelations) {
    setEditingEntry(entry)
    setForm({
      date: entry.date,
      time_from: entry.time_from,
      time_to: entry.time_to,
      break_min: String(entry.break_min),
      client_id: entry.client_id,
      project_id: entry.project_id,
      code: entry.code,
      description: entry.description,
      remote: entry.remote,
      task_id: entry.task_id ?? "",
      booking_item_text: entry.booking_item_text ?? "",
    })
    setBookingItemAutoSet(false)
    setProjectSearch("")
    setTaskSearch("")
    setShowForm(true)
  }

  function handleTaskSelect(value: string) {
    const taskId = value === "_none" ? "" : value
    const selectedTask = tasks.find(t => t.id === taskId)
    const defaultBooking = selectedTask?.default_booking_item
    setForm(f => ({
      ...f,
      task_id: taskId,
      booking_item_text: defaultBooking ? defaultBooking.name : f.booking_item_text,
    }))
    setBookingItemAutoSet(!!defaultBooking)
    setTaskSearch("")
  }

  async function doSave() {
    const gross_h = hoursFromTimeRange(form.time_from, form.time_to)
    const net_h = hoursFromTimeRange(form.time_from, form.time_to, parseInt(form.break_min))
    const payload = {
      date: form.date,
      time_from: form.time_from,
      time_to: form.time_to,
      break_min: parseInt(form.break_min),
      client_id: form.client_id,
      project_id: form.project_id || null,
      code: form.code,
      description: form.description,
      remote: form.remote,
      gross_h,
      net_h,
      task_id: form.task_id || null,
      booking_item_text: form.booking_item_text,
    }

    if (editingEntry) {
      const { error } = await supabase.from("time_entries").update(payload).eq("id", editingEntry.id)
      if (error) { toast.error("Fehler: " + error.message); return }
      toast.success("Eintrag aktualisiert")
    } else {
      const { error } = await supabase.from("time_entries").insert({ ...payload, user_id: userId })
      if (error) { toast.error("Fehler: " + error.message); return }
      toast.success("Zeiteintrag gespeichert")
    }
    setShowForm(false)
    setEditingEntry(null)
    setShowOverlapDialog(false)
    loadEntries()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_id) {
      toast.error("Bitte Kunde auswählen")
      return
    }

    // Check for overlapping entries (same client, same date, overlapping time range)
    let overlapQuery = supabase
      .from("time_entries")
      .select("*, client:clients(*), project:projects(*), task:tasks(*)")
      .eq("user_id", userId)
      .eq("client_id", form.client_id)
      .eq("date", form.date)
      .lt("time_from", form.time_to)
      .gt("time_to", form.time_from)

    if (editingEntry) {
      overlapQuery = overlapQuery.neq("id", editingEntry.id)
    }

    const { data: conflicts } = await overlapQuery

    if (conflicts && conflicts.length > 0) {
      setOverlapConflicts(conflicts as EntryWithRelations[])
      setShowOverlapDialog(true)
      return
    }

    await doSave()
  }

  async function handleDelete(id: string) {
    await supabase.from("time_entries").delete().eq("id", id)
    toast.success("Eintrag gelöscht")
    loadEntries()
  }

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  )
  const filteredTasks = tasks.filter(t =>
    t.name.toLowerCase().includes(taskSearch.toLowerCase())
  )

  const totalHours = entries.reduce((s, e) => s + e.net_h, 0)
  const monthLabel = currentDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Zeiterfassung</h1>
          <p className="text-muted-foreground">Manuelle Zeiteinträge</p>
        </div>
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
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingEntry ? "Eintrag bearbeiten" : "Neuer Zeiteintrag"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {/* Row 1 */}
              <div className="space-y-2">
                <Label>Datum</Label>
                <Input type="date" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Von</Label>
                <Input type="time" value={form.time_from}
                  onChange={(e) => setForm({ ...form, time_from: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Bis</Label>
                <Input type="time" value={form.time_to}
                  onChange={(e) => setForm({ ...form, time_to: e.target.value })} />
              </div>

              {/* Row 2 */}
              <div className="space-y-2">
                <Label>Pause (Min)</Label>
                <Input type="number" min="0" value={form.break_min}
                  onChange={(e) => setForm({ ...form, break_min: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Kunde</Label>
                <Select value={form.client_id}
                  onValueChange={(v) => {
                    const selectedClient = clients.find(c => c.id === v)
                    setForm({ ...form, client_id: v, project_id: "", task_id: "", remote: selectedClient?.default_remote ?? false })
                    setBookingItemAutoSet(false)
                    setProjectSearch("")
                    setTaskSearch("")
                  }}>
                  <SelectTrigger><SelectValue placeholder="Kunde wählen..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Projekt</Label>
                <Select value={form.project_id || "_none"}
                  onValueChange={(v) => {
                    setForm({ ...form, project_id: v === "_none" ? "" : v, task_id: "" })
                    setBookingItemAutoSet(false)
                    setProjectSearch("")
                    setTaskSearch("")
                  }}
                  disabled={!form.client_id}>
                  <SelectTrigger><SelectValue placeholder="Projekt wählen..." /></SelectTrigger>
                  <SelectContent>
                    <div className="p-2 border-b">
                      <Input
                        placeholder="Suchen..."
                        value={projectSearch}
                        onChange={e => setProjectSearch(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        className="h-7 text-sm"
                      />
                    </div>
                    <SelectItem value="_none">— Kein Projekt —</SelectItem>
                    {filteredProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    {filteredProjects.length === 0 && projectSearch && (
                      <p className="py-2 text-center text-xs text-muted-foreground">Keine Treffer</p>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Row 3 — Aufgabe + Buchungsposten */}
              <div className="space-y-2">
                <Label>Aufgabe (optional)</Label>
                <Select value={form.task_id || "_none"} onValueChange={handleTaskSelect}>
                  <SelectTrigger><SelectValue placeholder="Aufgabe wählen..." /></SelectTrigger>
                  <SelectContent>
                    <div className="p-2 border-b">
                      <Input
                        placeholder="Suchen..."
                        value={taskSearch}
                        onChange={e => setTaskSearch(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        className="h-7 text-sm"
                      />
                    </div>
                    <SelectItem value="_none">— Keine Aufgabe —</SelectItem>
                    {filteredTasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    {filteredTasks.length === 0 && taskSearch && (
                      <p className="py-2 text-center text-xs text-muted-foreground">Keine Treffer</p>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Buchungsposten (optional)</Label>
                {bookingItemAutoSet && (
                  <p className="text-xs text-amber-600 font-medium">Automatisch gesetzt — bitte prüfen</p>
                )}
                {bookingItems.length > 0 ? (
                  <Select value={form.booking_item_text || "_manual"}
                    onValueChange={(v) => {
                      setForm({ ...form, booking_item_text: v === "_manual" ? "" : v })
                      setBookingItemAutoSet(false)
                    }}>
                    <SelectTrigger className={bookingItemAutoSet ? "border-amber-400 ring-1 ring-amber-400" : ""}>
                      <SelectValue placeholder="Buchungsposten wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_manual">— Manuell eingeben —</SelectItem>
                      {bookingItems.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : null}
                {(bookingItems.length === 0 || !bookingItems.find(b => b.name === form.booking_item_text)) && (
                  <Input
                    placeholder="z.B. 4800061526 - Support PI/PO"
                    value={form.booking_item_text}
                    onChange={(e) => { setForm({ ...form, booking_item_text: e.target.value }); setBookingItemAutoSet(false) }}
                    className={bookingItemAutoSet ? "border-amber-400 ring-1 ring-amber-400 mt-1" : "mt-1"}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>Code</Label>
                <Select value={form.code}
                  onValueChange={(v) => setForm({ ...form, code: v as typeof HOUR_CODES[number] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOUR_CODES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Row 4 */}
              <div className="space-y-2 col-span-2 md:col-span-2">
                <Label>Beschreibung</Label>
                <Input placeholder="Tätigkeit..." value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-2 flex items-center gap-3 pt-6">
                <Switch checked={form.remote} onCheckedChange={(v) => setForm({ ...form, remote: v })} />
                <Label>Remote</Label>
              </div>

              <div className="col-span-full flex justify-between items-center pt-2">
                {form.time_from && form.time_to && (
                  <span className="text-sm text-muted-foreground">
                    Netto: <strong>{formatHours(hoursFromTimeRange(form.time_from, form.time_to, parseInt(form.break_min || "0")))}</strong>
                    {" "}/ Brutto: <strong>{formatHours(hoursFromTimeRange(form.time_from, form.time_to))}</strong>
                  </span>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingEntry(null) }}>Abbrechen</Button>
                  <Button type="submit">{editingEntry ? "Aktualisieren" : "Speichern"}</Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{monthLabel}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Gesamt: <strong>{formatHours(totalHours)}</strong>
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8"
                onClick={() => setCurrentDate(new Date(year, month - 2, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8"
                onClick={() => setCurrentDate(new Date(year, month, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Keine Einträge in diesem Monat</p>
          ) : (
            <div className="divide-y">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 px-6 py-3 hover:bg-muted/30 group">
                  <div className="w-20 shrink-0 text-sm text-muted-foreground pt-0.5">
                    {formatDate(entry.date)}
                  </div>
                  <div className="w-24 shrink-0 text-sm text-muted-foreground font-mono pt-0.5">
                    {entry.time_from}–{entry.time_to}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs mt-0.5">{entry.code}</Badge>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{entry.client?.name}</span>
                      <span className="text-xs text-muted-foreground">/ {entry.project?.name}</span>
                      {entry.task && (
                        <Badge variant="secondary" className="text-xs">📋 {entry.task.name}</Badge>
                      )}
                    </div>
                    {entry.booking_item_text && (
                      <p className="text-xs text-muted-foreground font-mono">{entry.booking_item_text}</p>
                    )}
                    {entry.description && (
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    )}
                  </div>
                  {entry.remote && <Badge variant="secondary" className="text-xs shrink-0 mt-0.5">Remote</Badge>}
                  <span className="text-sm font-medium shrink-0 w-12 text-right pt-0.5">
                    {formatHours(entry.net_h)}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                      onClick={() => openEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(entry.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showOverlapDialog} onOpenChange={setShowOverlapDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Zeitüberschneidung
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Für diesen Kunden existieren bereits Einträge im gleichen Zeitraum:
            </p>
            <div className="rounded-md border divide-y">
              {overlapConflicts.map((c) => (
                <div key={c.id} className="px-3 py-2 text-sm space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{formatDate(c.date)}</span>
                    <span className="font-mono font-medium">{c.time_from}–{c.time_to}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                    {c.project?.name && <span>{c.project.name}</span>}
                    {c.task?.name && (
                      <>
                        <span>·</span>
                        <span>{c.task.name}</span>
                      </>
                    )}
                    {c.description && (
                      <>
                        <span>·</span>
                        <span>{c.description}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm">Trotzdem speichern?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverlapDialog(false)}>Abbrechen</Button>
            <Button variant="destructive" onClick={doSave}>Trotzdem speichern</Button>
          </DialogFooter>
        </DialogContent>
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
