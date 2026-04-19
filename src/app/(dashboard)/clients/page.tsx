"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Client, Project, Task, BookingItem } from "@/types/database"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Pencil, ChevronRight, ChevronDown, Trash2 } from "lucide-react"
import { toast } from "sonner"

type TaskWithProject = Task & { project?: { name: string; client_id?: string } | null }

export default function ClientsPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState("")
  const [hoursPerDay, setHoursPerDay] = useState(8)
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Record<string, Project[]>>({})
  const [projectTasks, setProjectTasks] = useState<Record<string, Task[]>>({})
  const [bookingItems, setBookingItems] = useState<Record<string, BookingItem[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  // Tab 2 state
  const [filterClientId, setFilterClientId] = useState("_all")
  const [allTasks, setAllTasks] = useState<TaskWithProject[]>([])
  const [allBookings, setAllBookings] = useState<BookingItem[]>([])
  const [flatProjects, setFlatProjects] = useState<Project[]>([])
  const [taskSearch, setTaskSearch] = useState("")
  const [projectSearch, setProjectSearch] = useState("")
  const [clientSearch, setClientSearch] = useState("")
  const [bookingSearch, setBookingSearch] = useState("")

  // Dialogs
  const [clientDialog, setClientDialog] = useState(false)
  const [projectDialog, setProjectDialog] = useState(false)
  const [taskDialog, setTaskDialog] = useState(false)
  const [bookingDialog, setBookingDialog] = useState(false)

  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingBooking, setEditingBooking] = useState<BookingItem | null>(null)
  const [selectedClientId, setSelectedClientId] = useState("")

  const [clientForm, setClientForm] = useState({
    name: "",
    client_nr: "",
    country: "DE",
    default_remote: false,
    budget_value: "",
    budget_unit: "MT" as "h" | "MT",
    budget_period: "monthly" as "total" | "monthly" | "range",
    budget_carry_over: false,
    budget_date_from: "",
    budget_date_to: "",
  })
  const [projectForm, setProjectForm] = useState({ name: "", project_nr: "", sub_project: "", category: "", hourly_rate: "" })
  const [taskForm, setTaskForm] = useState({ name: "", description: "", project_id: "", client_id: "", default_booking_item_id: "" })
  const [bookingForm, setBookingForm] = useState({ name: "", description: "", client_id: "" })

  const loadAllTasks = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("tasks")
      .select("*, project:projects(name, client_id), default_booking_item:booking_items(id,name)")
      .eq("user_id", uid)
      .order("name")
    setAllTasks((data ?? []) as TaskWithProject[])
  }, [supabase])

  const loadAllBookings = useCallback(async (uid: string) => {
    const { data } = await supabase.from("booking_items").select("*").eq("user_id", uid).order("name")
    setAllBookings(data ?? [])
  }, [supabase])

  const loadFlatProjects = useCallback(async (uid: string) => {
    const { data } = await supabase.from("projects").select("*, client:clients(name)").eq("user_id", uid).eq("active", true).order("name")
    setFlatProjects(data ?? [])
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        supabase.from("users_profile").select("working_hours_per_day").eq("user_id", user.id).single()
          .then(({ data }) => setHoursPerDay(data?.working_hours_per_day ?? 8))
        loadClients(user.id)
        loadAllTasks(user.id)
        loadAllBookings(user.id)
        loadFlatProjects(user.id)
      }
    })
  }, [supabase, loadAllTasks, loadAllBookings, loadFlatProjects])

  async function loadClients(uid: string) {
    const { data } = await supabase.from("clients").select("*").eq("user_id", uid).order("name")
    setClients(data ?? [])
  }

  async function loadProjects(clientId: string) {
    const { data } = await supabase.from("projects").select("*").eq("client_id", clientId).order("name")
    setProjects((p) => ({ ...p, [clientId]: data ?? [] }))
    const { data: bData } = await supabase.from("booking_items").select("*").eq("client_id", clientId).order("name")
    setBookingItems((b) => ({ ...b, [clientId]: bData ?? [] }))
  }

  async function loadProjectTasks(projectId: string) {
    const { data } = await supabase.from("tasks")
      .select("*, default_booking_item:booking_items(id,name)")
      .eq("project_id", projectId).order("name")
    setProjectTasks((t) => ({ ...t, [projectId]: data ?? [] }))
  }

  function toggleClient(clientId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) { next.delete(clientId) } else { next.add(clientId); loadProjects(clientId) }
      return next
    })
  }

  function toggleProject(projectId: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) { next.delete(projectId) } else { next.add(projectId); loadProjectTasks(projectId) }
      return next
    })
  }

  // Filtered data for Tab 2
  const filteredTasks = allTasks.filter((t) => {
    const proj = t.project as { name: string; client_id?: string } | null
    const matchesClient =
      filterClientId === "_all" ? true :
      filterClientId === "_none" ? (!t.project_id && !t.client_id) :
      (proj?.client_id === filterClientId || t.client_id === filterClientId)
    const matchesSearch = t.name.toLowerCase().includes(taskSearch.toLowerCase())
    return matchesClient && matchesSearch
  })

  const filteredBookings = allBookings.filter((b) => {
    const matchesClient =
      filterClientId === "_all" ? true :
      filterClientId === "_none" ? !b.client_id :
      b.client_id === filterClientId
    const matchesSearch = bookingSearch.trim() === "" ||
      b.name.toLowerCase().includes(bookingSearch.toLowerCase()) ||
      (b.description ?? "").toLowerCase().includes(bookingSearch.toLowerCase())
    return matchesClient && matchesSearch
  })

  // Booking items filtered for task dialog (by client derived from project or direct client)
  const taskDialogBookings = useMemo(() => {
    const clientId = taskForm.project_id
      ? flatProjects.find(p => p.id === taskForm.project_id)?.client_id
      : taskForm.client_id
    if (!clientId) return allBookings.filter(b => !b.client_id)
    return allBookings.filter(b => !b.client_id || b.client_id === clientId)
  }, [taskForm.project_id, taskForm.client_id, allBookings, flatProjects])

  // Project search for Tab 1
  const searchedProjects = projectSearch.trim()
    ? flatProjects.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
    : null // null means show accordion

  async function saveClient() {
    if (!clientForm.name.trim()) { toast.error("Name erforderlich"); return }
    const raw = clientForm.budget_value !== "" ? parseFloat(clientForm.budget_value) : NaN
    const hasBudget = !isNaN(raw) && raw > 0
    if (clientForm.budget_period === "range" && hasBudget) {
      if (!clientForm.budget_date_from || !clientForm.budget_date_to ||
          clientForm.budget_date_from > clientForm.budget_date_to) {
        toast.error("Bitte gültigen Zeitraum auswählen"); return
      }
    }
    const budget_h = hasBudget
      ? (clientForm.budget_unit === "MT" ? raw * hoursPerDay : raw)
      : null
    const payload = {
      name: clientForm.name,
      client_nr: clientForm.client_nr,
      country: clientForm.country,
      default_remote: clientForm.default_remote,
      budget_h,
      budget_unit: hasBudget ? clientForm.budget_unit : null,
      budget_period: hasBudget ? clientForm.budget_period : null,
      budget_carry_over: hasBudget && clientForm.budget_period === "monthly" ? clientForm.budget_carry_over : null,
      budget_date_from: hasBudget && clientForm.budget_period === "range" ? clientForm.budget_date_from : null,
      budget_date_to: hasBudget && clientForm.budget_period === "range" ? clientForm.budget_date_to : null,
    }
    if (editingClient) {
      await supabase.from("clients").update(payload).eq("id", editingClient.id)
      toast.success("Kunde aktualisiert")
    } else {
      await supabase.from("clients").insert({ ...payload, user_id: userId })
      toast.success("Kunde erstellt")
    }
    setClientDialog(false); setEditingClient(null)
    resetClientForm()
    loadClients(userId)
  }

  function resetClientForm() {
    setClientForm({
      name: "", client_nr: "", country: "DE", default_remote: false,
      budget_value: "", budget_unit: "MT", budget_period: "monthly",
      budget_carry_over: false, budget_date_from: "", budget_date_to: "",
    })
  }

  async function saveProject() {
    if (!projectForm.name.trim()) { toast.error("Name erforderlich"); return }
    const data = { ...projectForm, hourly_rate: projectForm.hourly_rate ? parseFloat(projectForm.hourly_rate) : null }
    if (editingProject) {
      await supabase.from("projects").update(data).eq("id", editingProject.id)
      toast.success("Projekt aktualisiert")
    } else {
      await supabase.from("projects").insert({ ...data, user_id: userId, client_id: selectedClientId })
      toast.success("Projekt erstellt")
    }
    setProjectDialog(false); setEditingProject(null)
    setProjectForm({ name: "", project_nr: "", sub_project: "", category: "", hourly_rate: "" })
    loadProjects(selectedClientId)
    loadFlatProjects(userId)
  }

  async function saveTask() {
    if (!taskForm.name.trim()) { toast.error("Name erforderlich"); return }
    const payload = {
      user_id: userId,
      name: taskForm.name,
      description: taskForm.description || null,
      project_id: taskForm.project_id || null,
      client_id: taskForm.project_id ? null : (taskForm.client_id || null),
      default_booking_item_id: taskForm.default_booking_item_id || null,
      active: true,
    }
    if (editingTask) {
      const { error } = await supabase.from("tasks").update(payload).eq("id", editingTask.id)
      if (error) { toast.error("Fehler: " + error.message); return }
      toast.success("Aufgabe aktualisiert")
    } else {
      const { error } = await supabase.from("tasks").insert(payload)
      if (error) { toast.error("Fehler: " + error.message); return }
      toast.success("Aufgabe erstellt")
    }
    setTaskDialog(false); setEditingTask(null)
    setTaskForm({ name: "", description: "", project_id: "", client_id: "", default_booking_item_id: "" })
    if (taskForm.project_id) loadProjectTasks(taskForm.project_id)
    loadAllTasks(userId)
  }

  async function saveBooking() {
    if (!bookingForm.name.trim()) { toast.error("Name erforderlich"); return }
    const payload = {
      user_id: userId,
      name: bookingForm.name,
      description: bookingForm.description || null,
      client_id: bookingForm.client_id || null,
      active: true,
    }
    if (editingBooking) {
      const { error } = await supabase.from("booking_items").update(payload).eq("id", editingBooking.id)
      if (error) { toast.error("Fehler: " + error.message); return }
      toast.success("Buchungsposten aktualisiert")
    } else {
      const { error } = await supabase.from("booking_items").insert(payload)
      if (error) { toast.error("Fehler: " + error.message); return }
      toast.success("Buchungsposten erstellt")
    }
    setBookingDialog(false); setEditingBooking(null)
    setBookingForm({ name: "", description: "", client_id: "" })
    if (bookingForm.client_id) loadProjects(bookingForm.client_id)
    loadAllBookings(userId)
  }

  async function deleteTask(id: string, projectId: string | null) {
    await supabase.from("tasks").delete().eq("id", id)
    toast.success("Aufgabe gelöscht")
    if (projectId) loadProjectTasks(projectId)
    loadAllTasks(userId)
  }

  async function deleteBooking(id: string, clientId: string | null) {
    await supabase.from("booking_items").delete().eq("id", id)
    toast.success("Buchungsposten gelöscht")
    if (clientId) loadProjects(clientId)
    loadAllBookings(userId)
  }

  async function deleteClient(id: string) {
    const { error } = await supabase.from("clients").delete().eq("id", id)
    if (error) { toast.error("Fehler: " + error.message); return }
    toast.success("Kunde gelöscht")
    setClientDialog(false); setEditingClient(null)
    setExpanded((prev) => { const n = new Set(prev); n.delete(id); return n })
    loadClients(userId)
  }

  async function deleteProject(id: string, clientId: string) {
    const { error } = await supabase.from("projects").delete().eq("id", id)
    if (error) { toast.error("Fehler: " + error.message); return }
    toast.success("Projekt gelöscht")
    setExpandedProjects((prev) => { const n = new Set(prev); n.delete(id); return n })
    setProjectDialog(false); setEditingProject(null)
    loadProjects(clientId)
    loadFlatProjects(userId)
  }

  function openEditTask(t: Task) {
    setEditingTask(t)
    setTaskForm({
      name: t.name,
      description: t.description ?? "",
      project_id: t.project_id ?? "",
      client_id: t.client_id ?? "",
      default_booking_item_id: t.default_booking_item_id ?? "",
    })
    setTaskDialog(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Kunden & Projekte</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => {
            setTaskForm({ name: "", description: "", project_id: "", client_id: "", default_booking_item_id: "" })
            setEditingTask(null); setTaskDialog(true)
          }} className="gap-2 flex-1 sm:flex-none">
            <Plus className="h-4 w-4" />Aufgabe
          </Button>
          <Button variant="outline" onClick={() => {
            setBookingForm({ name: "", description: "", client_id: "" })
            setEditingBooking(null); setBookingDialog(true)
          }} className="gap-2 flex-1 sm:flex-none">
            <Plus className="h-4 w-4" />Buchungsposten
          </Button>
          <Button onClick={() => {
            setEditingClient(null)
            resetClientForm()
            setClientDialog(true)
          }} className="gap-2 order-first w-full sm:order-none sm:w-auto">
            <Plus className="h-4 w-4" />Neuer Kunde
          </Button>
        </div>
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Kunden & Projekte</TabsTrigger>
          <TabsTrigger value="tasks">Aufgaben & Buchungsposten</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Clients & Projects ── */}
        <TabsContent value="clients" className="space-y-3 mt-4">
          {/* Search bar row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Kunden suchen..."
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              className="w-full sm:max-w-[200px]"
            />
            <Input
              placeholder="Projekte suchen..."
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              className="w-full sm:max-w-[200px]"
            />
            {(clientSearch || projectSearch) && (
              <Button variant="ghost" size="sm" onClick={() => { setClientSearch(""); setProjectSearch("") }}>
                Zurücksetzen
              </Button>
            )}
          </div>

          {/* Flat project search results */}
          {searchedProjects !== null ? (
            <Card>
              <div className="divide-y">
                {searchedProjects.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">Keine Projekte gefunden</p>
                ) : searchedProjects.map((p) => {
                  const clientName = (p as Project & { client?: { name: string } }).client?.name
                  const clientId = (p as Project & { client_id?: string }).client_id ?? ""
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-muted cursor-pointer"
                      onClick={() => {
                        setSelectedClientId(clientId)
                        setEditingProject(p)
                        setProjectForm({ name: p.name, project_nr: p.project_nr ?? "", sub_project: p.sub_project ?? "", category: p.category ?? "", hourly_rate: p.hourly_rate?.toString() ?? "" })
                        setProjectDialog(true)
                      }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{p.name}</span>
                          {p.project_nr && <span className="text-xs text-muted-foreground">{p.project_nr}</span>}
                        </div>
                        {clientName && <p className="text-xs text-muted-foreground">👤 {clientName}</p>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-9 w-9"
                          onClick={() => {
                            setSelectedClientId(clientId)
                            setEditingProject(p)
                            setProjectForm({ name: p.name, project_nr: p.project_nr ?? "", sub_project: p.sub_project ?? "", category: p.category ?? "", hourly_rate: p.hourly_rate?.toString() ?? "" })
                            setProjectDialog(true)
                          }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteProject(p.id, clientId)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          ) : (
            /* Normal accordion — filtered by clientSearch */
            <>
              {clients.filter(c =>
                clientSearch.trim() === "" ||
                c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                (c.client_nr ?? "").toLowerCase().includes(clientSearch.toLowerCase())
              ).map((client) => (
                <Card key={client.id}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 cursor-pointer select-none" onClick={() => toggleClient(client.id)}>
                    {expanded.has(client.id)
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{client.name}</span>
                      {client.client_nr && <span className="text-xs text-muted-foreground">{client.client_nr}</span>}
                      <Badge variant={client.active ? "success" : "secondary"} className="text-xs">
                        {client.active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 w-full pl-7 sm:pl-0 sm:w-auto sm:ml-auto" onClick={(e) => e.stopPropagation()}>
                      {client.default_remote && (
                        <Badge variant="outline" className="text-xs">Remote</Badge>
                      )}
                      <Switch checked={client.active}
                        onCheckedChange={async () => {
                          await supabase.from("clients").update({ active: !client.active }).eq("id", client.id)
                          loadClients(userId)
                        }} />
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7"
                        onClick={() => {
                          setSelectedClientId(client.id)
                          setBookingForm({ name: "", description: "", client_id: client.id })
                          setEditingBooking(null); setBookingDialog(true)
                        }}>
                        <Plus className="h-3 w-3" />Buchungsposten
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => {
                          setEditingClient(client)
                          const hasBudget = client.budget_h != null && client.budget_h > 0
                          const unit = client.budget_unit ?? "MT"
                          const value = hasBudget
                            ? (unit === "MT"
                              ? (client.budget_h! / hoursPerDay).toFixed(1)
                              : client.budget_h!.toFixed(1))
                            : ""
                          setClientForm({
                            name: client.name,
                            client_nr: client.client_nr ?? "",
                            country: client.country,
                            default_remote: client.default_remote ?? false,
                            budget_value: value,
                            budget_unit: unit,
                            budget_period: client.budget_period ?? "monthly",
                            budget_carry_over: client.budget_carry_over ?? false,
                            budget_date_from: client.budget_date_from ?? "",
                            budget_date_to: client.budget_date_to ?? "",
                          })
                          setClientDialog(true)
                        }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {expanded.has(client.id) && (
                    <div className="border-t bg-muted/20">
                      {/* Buchungsposten section */}
                      <div className="border-b">
                        <div className="px-6 py-2 flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Buchungsposten</p>
                        </div>
                        {(bookingItems[client.id] ?? []).length === 0 ? (
                          <p className="px-6 pb-3 text-xs text-muted-foreground">Keine Buchungsposten</p>
                        ) : (
                          <div className="divide-y">
                            {(bookingItems[client.id] ?? []).map((b) => (
                              <div key={b.id} className="flex items-center gap-3 px-6 py-2 group hover:bg-muted cursor-pointer"
                                onClick={() => {
                                  setEditingBooking(b)
                                  setBookingForm({ name: b.name, description: b.description ?? "", client_id: client.id })
                                  setBookingDialog(true)
                                }}>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-mono">{b.name}</span>
                                  {b.description && <span className="text-xs text-muted-foreground ml-2">— {b.description}</span>}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={e => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-9 w-9"
                                    onClick={() => {
                                      setEditingBooking(b)
                                      setBookingForm({ name: b.name, description: b.description ?? "", client_id: client.id })
                                      setBookingDialog(true)
                                    }}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteBooking(b.id, client.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Projekte section */}
                      <div className="p-3 flex items-center justify-between border-b">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3">Projekte</p>
                        <Button size="sm" variant="outline" className="gap-1.5"
                          onClick={() => {
                            setSelectedClientId(client.id)
                            setEditingProject(null)
                            setProjectForm({ name: "", project_nr: "", sub_project: "", category: "", hourly_rate: "" })
                            setProjectDialog(true)
                          }}>
                          <Plus className="h-3.5 w-3.5" />Projekt hinzufügen
                        </Button>
                      </div>

                      <div className="divide-y">
                        {(projects[client.id] ?? []).map((p) => (
                          <div key={p.id}>
                            <div className="flex items-center gap-3 px-6 py-2.5 group hover:bg-muted cursor-pointer"
                              onClick={() => {
                                setSelectedClientId(client.id)
                                setEditingProject(p)
                                setProjectForm({ name: p.name, project_nr: p.project_nr ?? "", sub_project: p.sub_project ?? "", category: p.category ?? "", hourly_rate: p.hourly_rate?.toString() ?? "" })
                                setProjectDialog(true)
                              }}>
                              <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={e => { e.stopPropagation(); toggleProject(p.id) }}>
                                {expandedProjects.has(p.id)
                                  ? <ChevronDown className="h-3.5 w-3.5" />
                                  : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{p.name}</span>
                                  {p.project_nr && <span className="text-xs text-muted-foreground">{p.project_nr}</span>}
                                  {p.sub_project && <span className="text-xs text-muted-foreground">/ {p.sub_project}</span>}
                                </div>
                                {p.category && <p className="text-xs text-muted-foreground">{p.category}</p>}
                              </div>
                              {p.hourly_rate && <span className="text-xs text-muted-foreground">{p.hourly_rate} €/h</span>}
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="sm" className="gap-1 text-xs h-7"
                                  onClick={() => {
                                    setTaskForm({ name: "", description: "", project_id: p.id, client_id: "", default_booking_item_id: "" })
                                    setEditingTask(null); setTaskDialog(true)
                                  }}>
                                  <Plus className="h-3 w-3" />Aufgabe
                                </Button>
                                <Button variant="ghost" size="icon" className="h-9 w-9"
                                  onClick={() => {
                                    setSelectedClientId(client.id)
                                    setEditingProject(p)
                                    setProjectForm({ name: p.name, project_nr: p.project_nr ?? "", sub_project: p.sub_project ?? "", category: p.category ?? "", hourly_rate: p.hourly_rate?.toString() ?? "" })
                                    setProjectDialog(true)
                                  }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                  onClick={() => deleteProject(p.id, client.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {expandedProjects.has(p.id) && (
                              <div className="bg-muted/10 px-10 py-2 space-y-1">
                                {(projectTasks[p.id] ?? []).length === 0
                                  ? <p className="text-xs text-muted-foreground">Keine Aufgaben</p>
                                  : (projectTasks[p.id] ?? []).map((t) => (
                                    <div key={t.id} className="flex items-center gap-2 text-xs py-1 px-2 -mx-2 rounded group hover:bg-muted cursor-pointer"
                                      onClick={() => openEditTask(t)}>
                                      <span className="flex-1 font-medium">{t.name}</span>
                                      {t.description && <span className="text-muted-foreground">{t.description}</span>}
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={e => e.stopPropagation()}>
                                        <button className="text-muted-foreground hover:text-foreground"
                                          onClick={() => openEditTask(t)}>
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                        <button className="text-muted-foreground hover:text-destructive"
                                          onClick={() => deleteTask(t.id, p.id)}>
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                }
                              </div>
                            )}
                          </div>
                        ))}
                        {(projects[client.id] ?? []).length === 0 && (
                          <p className="px-6 py-3 text-xs text-muted-foreground">Keine Projekte</p>
                        )}

                        {/* ── Aufgaben ohne Projektzuordnung ── */}
                        {(() => {
                          const unassigned = allTasks.filter(t => t.project_id === null && t.client_id === client.id)
                          if (unassigned.length === 0) return null
                          return (
                            <div className="border-t">
                              <div className="px-4 py-2 bg-muted/20">
                                <p className="text-xs font-semibold text-muted-foreground">Aufgaben ohne Projekt</p>
                              </div>
                              <div className="px-10 py-2 space-y-1">
                                {unassigned.map((t) => (
                                  <div key={t.id} className="flex items-center gap-2 text-xs py-1 px-2 -mx-2 rounded group hover:bg-muted cursor-pointer"
                                    onClick={() => openEditTask(t)}>
                                    <span className="flex-1 font-medium">{t.name}</span>
                                    {t.description && <span className="text-muted-foreground">{t.description}</span>}
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={e => e.stopPropagation()}>
                                      <button className="text-muted-foreground hover:text-foreground"
                                        onClick={() => openEditTask(t)}>
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      <button className="text-muted-foreground hover:text-destructive"
                                        onClick={() => deleteTask(t.id, null)}>
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
              {clients.filter(c =>
                clientSearch.trim() === "" ||
                c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                (c.client_nr ?? "").toLowerCase().includes(clientSearch.toLowerCase())
              ).length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  {clientSearch.trim() ? "Kein Kunde gefunden." : "Noch keine Kunden."}
                </p>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Tab 2: Tasks & Booking Items ── */}
        <TabsContent value="tasks" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="shrink-0 text-sm">Kunde:</Label>
            <Select value={filterClientId} onValueChange={setFilterClientId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Alle Kunden" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alle</SelectItem>
                <SelectItem value="_none">Ohne Kundenzuordnung</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filteredTasks.length} Aufgabe(n) · {filteredBookings.length} Buchungsposten
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tasks */}
            <Card>
              <div className="p-4 border-b space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Aufgaben</h3>
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => {
                      setTaskForm({ name: "", description: "", project_id: "", client_id: "", default_booking_item_id: "" })
                      setEditingTask(null); setTaskDialog(true)
                    }}>
                    <Plus className="h-3.5 w-3.5" />Hinzufügen
                  </Button>
                </div>
                <Input
                  placeholder="Aufgaben suchen..."
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {filteredTasks.length === 0
                  ? <p className="px-4 py-4 text-xs text-muted-foreground">Keine Aufgaben</p>
                  : filteredTasks.map((t) => {
                    const proj = t.project as { name: string } | null
                    const defaultBooking = (t as Task & { default_booking_item?: { name: string } | null }).default_booking_item
                    return (
                      <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 group hover:bg-muted cursor-pointer"
                        onClick={() => openEditTask(t)}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          {proj && <p className="text-xs text-muted-foreground truncate">📁 {proj.name}</p>}
                          {!t.project_id && <p className="text-xs text-muted-foreground">Ohne Projekt</p>}
                          {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                          {defaultBooking && <p className="text-xs text-muted-foreground font-mono truncate">🔖 {defaultBooking.name}</p>}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"
                            onClick={() => openEditTask(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteTask(t.id, t.project_id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })
                }
              </div>
            </Card>

            {/* Booking items */}
            <Card>
              <div className="p-4 border-b space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Buchungsposten</h3>
                  <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => {
                    setBookingForm({
                      name: "",
                      description: "",
                      client_id: filterClientId !== "_all" && filterClientId !== "_none" ? filterClientId : "",
                    })
                    setEditingBooking(null); setBookingDialog(true)
                  }}>
                  <Plus className="h-3.5 w-3.5" />Hinzufügen
                </Button>
                </div>
                <Input
                  placeholder="Buchungsposten suchen..."
                  value={bookingSearch}
                  onChange={e => setBookingSearch(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {filteredBookings.length === 0
                  ? <p className="px-4 py-4 text-xs text-muted-foreground">Keine Buchungsposten</p>
                  : filteredBookings.map((b) => {
                    const clientName = clients.find(c => c.id === b.client_id)?.name
                    return (
                      <div key={b.id} className="flex items-center gap-2 px-4 py-2.5 group hover:bg-muted cursor-pointer"
                        onClick={() => {
                          setEditingBooking(b)
                          setBookingForm({ name: b.name, description: b.description ?? "", client_id: b.client_id ?? "" })
                          setBookingDialog(true)
                        }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono truncate">{b.name}</p>
                          {clientName && <p className="text-xs text-muted-foreground">👤 {clientName}</p>}
                          {!b.client_id && <p className="text-xs text-muted-foreground">Ohne Kundenzuordnung</p>}
                          {b.description && <p className="text-xs text-muted-foreground truncate">{b.description}</p>}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"
                            onClick={() => {
                              setEditingBooking(b)
                              setBookingForm({ name: b.name, description: b.description ?? "", client_id: b.client_id ?? "" })
                              setBookingDialog(true)
                            }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteBooking(b.id, b.client_id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })
                }
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Client dialog */}
      <Dialog open={clientDialog} onOpenChange={setClientDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingClient ? "Kunde bearbeiten" : "Neuer Kunde"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Name *</Label><Input value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Kundennummer</Label><Input value={clientForm.client_nr} onChange={(e) => setClientForm({ ...clientForm, client_nr: e.target.value })} /></div>
            <div className="space-y-2"><Label>Land</Label><Input value={clientForm.country} onChange={(e) => setClientForm({ ...clientForm, country: e.target.value })} maxLength={2} /></div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Remote Standard</p>
                <p className="text-xs text-muted-foreground">Wird bei der Zeiterfassung vorausgefüllt</p>
              </div>
              <Switch checked={clientForm.default_remote} onCheckedChange={(v) => setClientForm({ ...clientForm, default_remote: v })} />
            </div>
            <div className="space-y-2">
              <Label>Kundenauslastung Budget</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Optional"
                  value={clientForm.budget_value}
                  onChange={(e) => setClientForm({ ...clientForm, budget_value: e.target.value })}
                  className="flex-1"
                />
                <div className="flex gap-1">
                  {(["h", "MT"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setClientForm({ ...clientForm, budget_unit: unit })}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        clientForm.budget_unit === unit
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {unit === "h" ? "h" : "MT"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Zeitraum</Label>
              <div className="flex gap-1">
                {(["total", "monthly", "range"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setClientForm({ ...clientForm, budget_period: p })}
                    className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
                      clientForm.budget_period === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {p === "total" ? "Gesamt" : p === "monthly" ? "Monatlich" : "Datum"}
                  </button>
                ))}
              </div>
            </div>
            {clientForm.budget_period === "range" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Von</Label>
                  <input
                    type="date"
                    value={clientForm.budget_date_from}
                    onChange={(e) => setClientForm({ ...clientForm, budget_date_from: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bis</Label>
                  <input
                    type="date"
                    value={clientForm.budget_date_to}
                    min={clientForm.budget_date_from || undefined}
                    onChange={(e) => setClientForm({ ...clientForm, budget_date_to: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            )}
            {clientForm.budget_period === "monthly" && (
              <div className="space-y-1.5">
                <Label>Übertrag</Label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setClientForm({ ...clientForm, budget_carry_over: false })}
                    className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
                      !clientForm.budget_carry_over
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    Neu je Monat
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientForm({ ...clientForm, budget_carry_over: true })}
                    className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
                      clientForm.budget_carry_over
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    Übertrag
                  </button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {editingClient
              ? <Button variant="destructive" onClick={() => deleteClient(editingClient.id)}><Trash2 className="h-4 w-4 mr-1.5" />Löschen</Button>
              : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setClientDialog(false)}>Abbrechen</Button>
              <Button onClick={saveClient}>{editingClient ? "Speichern" : "Erstellen"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project dialog */}
      <Dialog open={projectDialog} onOpenChange={setProjectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingProject ? "Projekt bearbeiten" : "Neues Projekt"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Projektname *</Label><Input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Projektnummer</Label><Input value={projectForm.project_nr} onChange={(e) => setProjectForm({ ...projectForm, project_nr: e.target.value })} /></div>
              <div className="space-y-2"><Label>Teilprojekt</Label><Input value={projectForm.sub_project} onChange={(e) => setProjectForm({ ...projectForm, sub_project: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Kategorie</Label><Input value={projectForm.category} onChange={(e) => setProjectForm({ ...projectForm, category: e.target.value })} /></div>
              <div className="space-y-2"><Label>Stundensatz (€)</Label><Input type="number" step="0.01" value={projectForm.hourly_rate} onChange={(e) => setProjectForm({ ...projectForm, hourly_rate: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {editingProject
              ? <Button variant="destructive" onClick={() => deleteProject(editingProject.id, selectedClientId)}><Trash2 className="h-4 w-4 mr-1.5" />Löschen</Button>
              : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setProjectDialog(false)}>Abbrechen</Button>
              <Button onClick={saveProject}>{editingProject ? "Speichern" : "Erstellen"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task dialog */}
      <Dialog open={taskDialog} onOpenChange={setTaskDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTask ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={taskForm.name} onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })} placeholder="z.B. INTPLAT-281" />
            </div>
            <div className="space-y-2">
              <Label>Beschreibung (optional)</Label>
              <Input value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
            </div>
            {!taskForm.project_id && (
              <div className="space-y-2">
                <Label>Kunde (optional)</Label>
                <Select value={taskForm.client_id || "_none"} onValueChange={(v) => setTaskForm({ ...taskForm, client_id: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Kein Kunde" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Kein Kunde —</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Projekt (optional)</Label>
              <Select value={taskForm.project_id || "_none"} onValueChange={(v) => setTaskForm({ ...taskForm, project_id: v === "_none" ? "" : v, client_id: v !== "_none" ? "" : taskForm.client_id })}>
                <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Kein Projekt —</SelectItem>
                  {flatProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Standard-Buchungsposten (optional)</Label>
              <Select value={taskForm.default_booking_item_id || "_none"} onValueChange={(v) => setTaskForm({ ...taskForm, default_booking_item_id: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Kein Standard-Buchungsposten" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Keiner —</SelectItem>
                  {taskDialogBookings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {editingTask
              ? <Button variant="destructive" onClick={() => { deleteTask(editingTask.id, editingTask.project_id); setTaskDialog(false) }}><Trash2 className="h-4 w-4 mr-1.5" />Löschen</Button>
              : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTaskDialog(false)}>Abbrechen</Button>
              <Button onClick={saveTask}>{editingTask ? "Speichern" : "Erstellen"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking dialog */}
      <Dialog open={bookingDialog} onOpenChange={setBookingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingBooking ? "Buchungsposten bearbeiten" : "Neuer Buchungsposten"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Buchungsposten *</Label>
              <Input value={bookingForm.name} onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })} placeholder="z.B. 4800061526 - Support PI/PO" />
            </div>
            <div className="space-y-2">
              <Label>Beschreibung (optional)</Label>
              <Input value={bookingForm.description} onChange={(e) => setBookingForm({ ...bookingForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Kunde (optional)</Label>
              <Select value={bookingForm.client_id || "_none"} onValueChange={(v) => setBookingForm({ ...bookingForm, client_id: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Kein Kunde" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Kein Kunde —</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {editingBooking
              ? <Button variant="destructive" onClick={() => { deleteBooking(editingBooking.id, editingBooking.client_id); setBookingDialog(false) }}><Trash2 className="h-4 w-4 mr-1.5" />Löschen</Button>
              : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBookingDialog(false)}>Abbrechen</Button>
              <Button onClick={saveBooking}>{editingBooking ? "Speichern" : "Erstellen"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
