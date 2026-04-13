"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
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
import { formatHours, formatDate, hoursFromTimeRange, cn } from "@/lib/utils"
import { Plus, Trash2, ChevronLeft, ChevronRight, Pencil, Copy, AlertTriangle, FileText } from "lucide-react"
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

/** "2025-04-13" → "13.04" */
function fShortDate(date: string) {
  const [, m, d] = date.split("-")
  return `${d}.${m}`
}

/** Strip trailing ":00" seconds if zero, keep if non-zero */
function fTime(t: string) {
  const parts = t.split(":")
  if (parts.length === 3 && parts[2] === "00") return `${parts[0]}:${parts[1]}`
  return t
}

export default function TimePage() {
  const supabase = createClient()
  const t = useTranslations("time")
  const tCommon = useTranslations("common")
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
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [creatingTask, setCreatingTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState("")
  type GroupBy = "day" | "client" | "booking_item" | "task"
  const [groupBy, setGroupBy] = useState<GroupBy>("day")
  const [sortAsc, setSortAsc] = useState(true)
  const [filterClient, setFilterClient] = useState("")
  const [filterBookingItem, setFilterBookingItem] = useState("")
  const [filterTask, setFilterTask] = useState("")

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

  // Returns task data without touching state — lets callers batch setTasks + setForm together
  const fetchTasksData = useCallback(async (clientId: string, projectId: string): Promise<TaskWithBooking[]> => {
    if (!userId) return []
    const noProjectBase = supabase.from("tasks")
      .select("*, default_booking_item:booking_items(id,name)")
      .eq("user_id", userId).is("project_id", null).eq("active", true).order("name")

    const noProjectRes = clientId
      ? await noProjectBase.or(`client_id.eq.${clientId},client_id.is.null`)
      : await noProjectBase

    if (!projectId) return (noProjectRes.data ?? []) as TaskWithBooking[]

    const projRes = await supabase.from("tasks")
      .select("*, default_booking_item:booking_items(id,name)")
      .eq("project_id", projectId).eq("active", true).order("name")

    const combined = [...(projRes.data ?? []), ...(noProjectRes.data ?? [])] as TaskWithBooking[]
    combined.sort((a: Task, b: Task) => a.name.localeCompare(b.name))
    return combined
  }, [userId, supabase])

  const loadTasks = useCallback(async (clientId: string, projectId: string) => {
    setTasks(await fetchTasksData(clientId, projectId))
  }, [fetchTasksData])

  useEffect(() => {
    if (!userId) return
    loadTasks(form.client_id, form.project_id)
  }, [form.project_id, form.client_id, userId, loadTasks])

  function openNew() {
    setEditingEntry(null)
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0)
    const to = new Date(from.getTime() + 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, "0")
    setForm({
      ...emptyForm(),
      time_from: `${pad(from.getHours())}:${pad(from.getMinutes())}`,
      time_to: `${pad(to.getHours())}:${pad(to.getMinutes())}`,
    })
    setBookingItemAutoSet(false)
    setProjectSearch("")
    setTaskSearch("")
    setCreatingProject(false)
    setCreatingTask(false)
    setNewProjectName("")
    setNewTaskName("")
    setShowForm(true)
  }

  function openClone(entry: EntryWithRelations) {
    setEditingEntry(null)
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
    setCreatingProject(false)
    setCreatingTask(false)
    setNewProjectName("")
    setNewTaskName("")
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
    setCreatingProject(false)
    setCreatingTask(false)
    setNewProjectName("")
    setNewTaskName("")
    setShowForm(true)
  }

  async function handleCreateProject() {
    if (!newProjectName.trim() || !form.client_id || !userId) return
    const { data, error } = await supabase.from("projects").insert({
      user_id: userId,
      client_id: form.client_id,
      name: newProjectName.trim(),
      active: true,
    }).select().single()
    if (error) { toast.error("Fehler: " + error.message); return }
    // Fetch fresh list first, then set both in the same sync block so React
    // batches them into one render — Select finds the new item immediately.
    const freshProjects = await supabase.from("projects").select("*")
      .eq("client_id", form.client_id).eq("active", true).order("name")
    setProjects(freshProjects.data ?? [])
    setForm(f => ({ ...f, project_id: data.id, task_id: "" }))
    setCreatingProject(false)
    setNewProjectName("")
    toast.success("Projekt erstellt")
  }

  async function handleCreateTask() {
    if (!newTaskName.trim() || !userId) return
    const clientId = form.client_id
    const projectId = form.project_id
    const { data, error } = await supabase.from("tasks").insert({
      user_id: userId,
      name: newTaskName.trim(),
      project_id: projectId || null,
      client_id: projectId ? null : (clientId || null),
      active: true,
    }).select().single()
    if (error) { toast.error("Fehler: " + error.message); return }
    // Fetch fresh list first, then set both in the same sync block so React
    // batches them into one render — Select finds the new item immediately.
    const freshTasks = await fetchTasksData(clientId, projectId)
    setTasks(freshTasks)
    setForm(f => ({ ...f, task_id: data.id }))
    setCreatingTask(false)
    setNewTaskName("")
    toast.success("Aufgabe erstellt")
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
      if (error) { toast.error(t("errorSave", { message: error.message })); return }
      toast.success(t("updated"))
    } else {
      const { error } = await supabase.from("time_entries").insert({ ...payload, user_id: userId })
      if (error) { toast.error(t("errorSave", { message: error.message })); return }
      toast.success(t("saved"))
    }
    setShowForm(false)
    setEditingEntry(null)
    setShowOverlapDialog(false)
    loadEntries()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_id) {
      toast.error(t("errorNoClient"))
      return
    }

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
    toast.success(t("deleted"))
    loadEntries()
  }

  // Filter entries (AND-logic)
  const displayEntries = entries.filter(e => {
    if (filterClient && e.client_id !== filterClient) return false
    if (filterBookingItem && e.booking_item_text !== filterBookingItem) return false
    if (filterTask && e.task_id !== filterTask) return false
    return true
  })

  // Dropdown options derived from ALL entries of the month (not filtered)
  const allBookingItems = [...new Set(entries.map(e => e.booking_item_text).filter(Boolean))] as string[]
  const allFilterTasks = entries.reduce<{ id: string; name: string }[]>((acc, e) => {
    if (e.task_id && e.task && !acc.find(t => t.id === e.task_id))
      acc.push({ id: e.task_id, name: e.task.name })
    return acc
  }, [])

  // Generic grouping function → flat EntryGroup structure
  interface EntryGroup { key: string; label: string; totalNet: number; entries: EntryWithRelations[] }
  function computeGroups(es: EntryWithRelations[], by: GroupBy): EntryGroup[] {
    const map = new Map<string, EntryGroup>()
    for (const e of es) {
      let key: string, label: string
      switch (by) {
        case "day":          key = e.date;                   label = formatDate(e.date); break
        case "client":       key = e.client_id;              label = e.client?.name ?? e.client_id; break
        case "booking_item": key = e.booking_item_text || ""; label = e.booking_item_text || "(kein Buchungsposten)"; break
        case "task":         key = e.task_id || "";           label = e.task?.name || "(keine Aufgabe)"; break
      }
      if (!map.has(key)) map.set(key, { key, label, totalNet: 0, entries: [] })
      const g = map.get(key)!
      g.totalNet += e.net_h
      g.entries.push(e)
    }
    const groups = Array.from(map.values())
    if (by === "day") groups.sort((a, b) => b.key.localeCompare(a.key))
    else groups.sort((a, b) => a.label.localeCompare(b.label))
    groups.forEach(g => g.entries.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date)
      const timeCmp = a.time_from.localeCompare(b.time_from)
      return sortAsc ? (dateCmp || timeCmp) : -(dateCmp || timeCmp)
    }))
    return groups
  }

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  )
  const filteredTasks = tasks.filter(t =>
    t.name.toLowerCase().includes(taskSearch.toLowerCase())
  )

  const totalHours = entries.reduce((s, e) => s + e.net_h, 0)
  const monthLabel = currentDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
  const grouped = computeGroups(displayEntries, groupBy)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setReportDialogOpen(true)} className="gap-2">
            <FileText className="h-4 w-4" />
            {t("exportReport")}
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("newEntry")}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingEntry ? t("editEntry") : t("newTimeEntry")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("date")}</Label>
                <Input type="date" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("from")}</Label>
                <Input type="time" value={form.time_from}
                  onChange={(e) => setForm({ ...form, time_from: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("to")}</Label>
                <Input type="time" value={form.time_to}
                  onChange={(e) => setForm({ ...form, time_to: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>{t("break")}</Label>
                <Input type="number" min="0" value={form.break_min}
                  onChange={(e) => setForm({ ...form, break_min: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("client")}</Label>
                <Select value={form.client_id}
                  onValueChange={(v) => {
                    const selectedClient = clients.find(c => c.id === v)
                    setForm({ ...form, client_id: v, project_id: "", task_id: "", remote: selectedClient?.default_remote ?? false })
                    setBookingItemAutoSet(false)
                    setProjectSearch("")
                    setTaskSearch("")
                  }}>
                  <SelectTrigger><SelectValue placeholder={t("clientPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("project")}</Label>
                <Select value={form.project_id || "_none"}
                  onValueChange={(v) => {
                    if (v === "_create_project") {
                      setCreatingProject(true)
                      setNewProjectName("")
                      setProjectSearch("")
                      return
                    }
                    setForm({ ...form, project_id: v === "_none" ? "" : v, task_id: "" })
                    setBookingItemAutoSet(false)
                    setProjectSearch("")
                    setTaskSearch("")
                    setCreatingProject(false)
                  }}
                  disabled={!form.client_id}>
                  <SelectTrigger><SelectValue placeholder={t("projectPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    <div className="p-2 border-b">
                      <Input
                        placeholder={tCommon("search")}
                        value={projectSearch}
                        onChange={e => setProjectSearch(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        className="h-7 text-sm"
                      />
                    </div>
                    <SelectItem value="_none">{t("noProject")}</SelectItem>
                    {filteredProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    {filteredProjects.length === 0 && projectSearch && (
                      <p className="py-2 text-center text-xs text-muted-foreground">{tCommon("noResults")}</p>
                    )}
                    <div className="border-t mt-1 pt-1">
                      <SelectItem value="_create_project" className="text-primary font-medium">
                        <span className="flex items-center gap-1.5">
                          <Plus className="h-3.5 w-3.5" />Neues Projekt erstellen
                        </span>
                      </SelectItem>
                    </div>
                  </SelectContent>
                </Select>
                {creatingProject && (
                  <div className="flex gap-1.5">
                    <Input
                      autoFocus
                      placeholder="Projektname..."
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); handleCreateProject() }
                        if (e.key === "Escape") setCreatingProject(false)
                      }}
                      className="h-11 text-sm md:h-8"
                    />
                    <Button type="button" size="sm" onClick={handleCreateProject}
                      disabled={!newProjectName.trim()} className="h-11 w-11 md:h-8 md:w-auto md:px-2 shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost"
                      onClick={() => setCreatingProject(false)} className="h-11 w-11 md:h-8 md:w-auto md:px-2 shrink-0 text-muted-foreground">
                      ✕
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t("task")}</Label>
                <Select value={form.task_id || "_none"}
                  onValueChange={(v) => {
                    if (v === "_create_task") {
                      setCreatingTask(true)
                      setNewTaskName("")
                      setTaskSearch("")
                      return
                    }
                    handleTaskSelect(v)
                    setCreatingTask(false)
                  }}>
                  <SelectTrigger><SelectValue placeholder={t("taskPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    <div className="p-2 border-b">
                      <Input
                        placeholder={tCommon("search")}
                        value={taskSearch}
                        onChange={e => setTaskSearch(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        className="h-7 text-sm"
                      />
                    </div>
                    <SelectItem value="_none">{t("noTask")}</SelectItem>
                    {filteredTasks.map((task) => <SelectItem key={task.id} value={task.id}>{task.name}</SelectItem>)}
                    {filteredTasks.length === 0 && taskSearch && (
                      <p className="py-2 text-center text-xs text-muted-foreground">{tCommon("noResults")}</p>
                    )}
                    <div className="border-t mt-1 pt-1">
                      <SelectItem value="_create_task" className="text-primary font-medium">
                        <span className="flex items-center gap-1.5">
                          <Plus className="h-3.5 w-3.5" />Neue Aufgabe erstellen
                        </span>
                      </SelectItem>
                    </div>
                  </SelectContent>
                </Select>
                {creatingTask && (
                  <div className="flex gap-1.5">
                    <Input
                      autoFocus
                      placeholder="Aufgabenname..."
                      value={newTaskName}
                      onChange={e => setNewTaskName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); handleCreateTask() }
                        if (e.key === "Escape") setCreatingTask(false)
                      }}
                      className="h-11 text-sm md:h-8"
                    />
                    <Button type="button" size="sm" onClick={handleCreateTask}
                      disabled={!newTaskName.trim()} className="h-11 w-11 md:h-8 md:w-auto md:px-2 shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost"
                      onClick={() => setCreatingTask(false)} className="h-11 w-11 md:h-8 md:w-auto md:px-2 shrink-0 text-muted-foreground">
                      ✕
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2 col-span-2">
                <Label>{t("bookingItem")}</Label>
                {bookingItemAutoSet && (
                  <p className="text-xs text-amber-600 font-medium">{t("bookingItemAutoSet")}</p>
                )}
                {bookingItems.length > 0 ? (
                  <Select value={form.booking_item_text || "_manual"}
                    onValueChange={(v) => {
                      setForm({ ...form, booking_item_text: v === "_manual" ? "" : v })
                      setBookingItemAutoSet(false)
                    }}>
                    <SelectTrigger className={bookingItemAutoSet ? "border-amber-400 ring-1 ring-amber-400" : ""}>
                      <SelectValue placeholder={t("bookingItemPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_manual">{t("bookingItemManual")}</SelectItem>
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
                <Label>{t("code")}</Label>
                <Select value={form.code}
                  onValueChange={(v) => setForm({ ...form, code: v as typeof HOUR_CODES[number] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOUR_CODES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2 md:col-span-2">
                <Label>{t("description")}</Label>
                <Input placeholder={t("descriptionPlaceholder")} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-2 flex items-center gap-3 pt-6">
                <Switch checked={form.remote} onCheckedChange={(v) => setForm({ ...form, remote: v })} />
                <Label>{t("remote")}</Label>
              </div>

              <div className="col-span-full flex justify-between items-center pt-2">
                {form.time_from && form.time_to && (
                  <span className="text-sm text-muted-foreground">
                    {t("net")}: <strong>{formatHours(hoursFromTimeRange(form.time_from, form.time_to, parseInt(form.break_min || "0")))}</strong>
                    {" "}/ {t("gross")}: <strong>{formatHours(hoursFromTimeRange(form.time_from, form.time_to))}</strong>
                  </span>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingEntry(null) }}>{tCommon("cancel")}</Button>
                  <Button type="submit">{editingEntry ? tCommon("update") : tCommon("save")}</Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">{monthLabel}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sort order toggle */}
              <button onClick={() => setSortAsc(v => !v)}
                className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] md:px-2 md:py-1 md:text-xs md:min-h-0">
                {sortAsc ? "↑ Älteste zuerst" : "↓ Neueste zuerst"}
              </button>
              {/* Segmented grouping control */}
              <div className="flex items-center rounded-md border p-0.5 gap-0.5">
                {(["day", "client", "booking_item", "task"] as const).map(opt => (
                  <button key={opt} onClick={() => setGroupBy(opt)}
                    className={cn("flex items-center px-3 py-2 text-sm rounded transition-colors min-h-[44px] md:px-2 md:py-1 md:text-xs md:min-h-0",
                      groupBy === opt ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                    )}>
                    {opt === "day" ? "Tag" : opt === "client" ? "Kunde" : opt === "booking_item" ? "Buchungsposten" : "Aufgabe"}
                  </button>
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                {t("total")}: <strong>{formatHours(totalHours)}</strong>
              </span>
              <Button variant="outline" size="icon" className="h-9 w-9"
                onClick={() => setCurrentDate(new Date(year, month - 2, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9"
                onClick={() => setCurrentDate(new Date(year, month, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noEntriesThisMonth")}</p>
          ) : (
            <>
              {/* Filter bar */}
              <div className="px-4 py-2 border-b flex flex-wrap gap-2 items-center md:px-6">
                <Select value={filterClient || "__all__"} onValueChange={v => setFilterClient(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 w-full sm:w-36 text-xs"><SelectValue placeholder="Kunde…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Alle</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterBookingItem || "__all__"} onValueChange={v => setFilterBookingItem(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 w-full sm:w-44 text-xs"><SelectValue placeholder="Buchungsposten…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Alle</SelectItem>
                    {allBookingItems.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterTask || "__all__"} onValueChange={v => setFilterTask(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 w-full sm:w-36 text-xs"><SelectValue placeholder="Aufgabe…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Alle</SelectItem>
                    {allFilterTasks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {filterClient && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {clients.find(c => c.id === filterClient)?.name}
                    <button onClick={() => setFilterClient("")} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {filterBookingItem && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {filterBookingItem}
                    <button onClick={() => setFilterBookingItem("")} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {filterTask && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {allFilterTasks.find(t => t.id === filterTask)?.name}
                    <button onClick={() => setFilterTask("")} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {(filterClient || filterBookingItem || filterTask) && (
                  <Button variant="ghost" size="sm" className="h-11 text-sm md:h-7 md:text-xs"
                    onClick={() => { setFilterClient(""); setFilterBookingItem(""); setFilterTask("") }}>
                    Filter zurücksetzen
                  </Button>
                )}
              </div>

              {/* Grouped entries */}
              <div>
                {grouped.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Keine Einträge für diesen Filter.</p>
                ) : grouped.map(group => (
                  <div key={group.key}>
                    <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-y md:px-6">
                      <span className="text-sm font-semibold">{group.label}</span>
                      <span className="text-xs text-muted-foreground font-mono">{formatHours(group.totalNet)}</span>
                    </div>
                    <div className="divide-y">
                      {group.entries.map((entry, entryIdx) => (
                        <div key={entry.id} className={cn("group transition-colors hover:bg-muted/30", entryIdx % 2 === 1 ? "bg-[#fafafa] dark:bg-muted/10" : "")}>
                          {/* Mobile layout */}
                          <div className="md:hidden px-4 py-3">
                            {/* Row 1: short date · time range · code · hours */}
                            <div className="flex items-center gap-2 flex-wrap pb-2 mb-2 border-b border-border/30">
                              <span className="text-sm font-medium tabular-nums">{fShortDate(entry.date)}</span>
                              <span className="text-sm text-muted-foreground font-mono">{fTime(entry.time_from)}–{fTime(entry.time_to)}</span>
                              <Badge className="text-xs font-mono bg-foreground text-background border-transparent">{entry.code}</Badge>
                              <span className="ml-auto text-base font-bold tabular-nums">{formatHours(entry.net_h)}</span>
                            </div>
                            {/* Row 2: client · project · task · remote · booking · description */}
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {entry.client?.name && (
                                  <Badge variant="outline" className="text-xs text-muted-foreground border-border/60">
                                    {entry.client.name}
                                  </Badge>
                                )}
                                {entry.project?.name && <span className="text-sm text-muted-foreground">/ {entry.project.name}</span>}
                                {entry.task && <Badge variant="secondary" className="text-xs">📋 {entry.task.name}</Badge>}
                                {entry.remote && (
                                  <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
                                    Remote
                                  </Badge>
                                )}
                              </div>
                              {entry.booking_item_text && (
                                <p className="text-sm font-mono text-zinc-400 dark:text-zinc-500">{entry.booking_item_text}</p>
                              )}
                              {entry.description && <p className="text-sm text-muted-foreground">{entry.description}</p>}
                            </div>
                            {/* Actions */}
                            <div className="flex justify-end gap-1 mt-1">
                              <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground"
                                title="Klonen" onClick={() => openClone(entry)}>
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground"
                                onClick={() => openEdit(entry)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDelete(entry.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {/* Desktop layout — unchanged */}
                          <div className="hidden md:flex items-start gap-3 px-6 py-3">
                            <div className="w-20 shrink-0 text-sm text-muted-foreground pt-0.5">
                              {formatDate(entry.date)}
                            </div>
                            <div className="w-24 shrink-0 text-sm text-muted-foreground font-mono pt-0.5">
                              {entry.time_from}–{entry.time_to}
                            </div>
                            <Badge variant="outline" className="shrink-0 text-xs mt-0.5">{entry.code}</Badge>
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                {entry.project?.name && (
                                  <span className="text-xs text-muted-foreground">/ {entry.project.name}</span>
                                )}
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
                            {entry.client?.name && <Badge variant="outline" className="text-xs shrink-0 mt-0.5">{entry.client.name}</Badge>}
                            {entry.remote && <Badge variant="secondary" className="text-xs shrink-0 mt-0.5">Remote</Badge>}
                            <span className="text-sm font-medium shrink-0 w-12 text-right pt-0.5">
                              {formatHours(entry.net_h)}
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"
                                title="Klonen" onClick={() => openClone(entry)}>
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"
                                onClick={() => openEdit(entry)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDelete(entry.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showOverlapDialog} onOpenChange={setShowOverlapDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("overlapTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{t("overlapDescription")}</p>
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
            <p className="text-sm">{t("overlapQuestion")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverlapDialog(false)}>{tCommon("cancel")}</Button>
            <Button variant="destructive" onClick={doSave}>{t("overlapSave")}</Button>
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
