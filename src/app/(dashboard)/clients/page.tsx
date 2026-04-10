"use client"

import { useEffect, useState, useCallback } from "react"
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

type TaskWithProject = Task & { project?: { name: string } | null }

export default function ClientsPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Record<string, Project[]>>({})
  const [projectTasks, setProjectTasks] = useState<Record<string, Task[]>>({}) // keyed by project_id
  const [bookingItems, setBookingItems] = useState<Record<string, BookingItem[]>>({}) // keyed by client_id
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  // Second tab state
  const [filterClientId, setFilterClientId] = useState("_all")
  const [allTasks, setAllTasks] = useState<TaskWithProject[]>([])
  const [allBookings, setAllBookings] = useState<BookingItem[]>([])
  const [flatProjects, setFlatProjects] = useState<Project[]>([])

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

  const [clientForm, setClientForm] = useState({ name: "", client_nr: "", country: "DE" })
  const [projectForm, setProjectForm] = useState({ name: "", project_nr: "", sub_project: "", category: "", hourly_rate: "" })
  const [taskForm, setTaskForm] = useState({ name: "", description: "", project_id: "" })
  const [bookingForm, setBookingForm] = useState({ name: "", description: "", client_id: "" })

  const loadAllTasks = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("tasks")
      .select("*, project:projects(name, client_id)")
      .eq("user_id", uid)
      .order("name")
    setAllTasks((data ?? []) as TaskWithProject[])
  }, [supabase])

  const loadAllBookings = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("booking_items")
      .select("*")
      .eq("user_id", uid)
      .order("name")
    setAllBookings(data ?? [])
  }, [supabase])

  const loadFlatProjects = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("projects")
      .select("*, client:clients(name)")
      .eq("user_id", uid)
      .eq("active", true)
      .order("name")
    setFlatProjects(data ?? [])
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
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
    const { data } = await supabase.from("tasks").select("*").eq("project_id", projectId).order("name")
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

  // Filtered tasks/bookings for second tab
  const filteredTasks = allTasks.filter((t) => {
    if (filterClientId === "_all") return true
    const proj = t.project as { name: string; client_id?: string } | null
    if (filterClientId === "_none") return !t.project_id
    return proj && (proj as { name: string; client_id?: string }).client_id === filterClientId
  })

  const filteredBookings = allBookings.filter((b) => {
    if (filterClientId === "_all") return true
    if (filterClientId === "_none") return !b.client_id
    return b.client_id === filterClientId
  })

  async function saveClient() {
    if (!clientForm.name.trim()) { toast.error("Name erforderlich"); return }
    if (editingClient) {
      await supabase.from("clients").update(clientForm).eq("id", editingClient.id)
      toast.success("Kunde aktualisiert")
    } else {
      await supabase.from("clients").insert({ ...clientForm, user_id: userId })
      toast.success("Kunde erstellt")
    }
    setClientDialog(false); setEditingClient(null)
    setClientForm({ name: "", client_nr: "", country: "DE" })
    loadClients(userId)
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
      active: true,
    }
    if (editingTask) {
      await supabase.from("tasks").update(payload).eq("id", editingTask.id)
      toast.success("Aufgabe aktualisiert")
    } else {
      await supabase.from("tasks").insert(payload)
      toast.success("Aufgabe erstellt")
    }
    setTaskDialog(false); setEditingTask(null)
    setTaskForm({ name: "", description: "", project_id: "" })
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
      await supabase.from("booking_items").update(payload).eq("id", editingBooking.id)
      toast.success("Buchungsposten aktualisiert")
    } else {
      await supabase.from("booking_items").insert(payload)
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

  // allProjects is now loaded upfront via loadFlatProjects (not lazily from expanded clients)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Kunden & Projekte</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            setTaskForm({ name: "", description: "", project_id: "" })
            setEditingTask(null); setTaskDialog(true)
          }} className="gap-2">
            <Plus className="h-4 w-4" />Aufgabe
          </Button>
          <Button variant="outline" onClick={() => {
            setBookingForm({ name: "", description: "", client_id: "" })
            setEditingBooking(null); setBookingDialog(true)
          }} className="gap-2">
            <Plus className="h-4 w-4" />Buchungsposten
          </Button>
          <Button onClick={() => {
            setEditingClient(null)
            setClientForm({ name: "", client_nr: "", country: "DE" })
            setClientDialog(true)
          }} className="gap-2">
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
        <TabsContent value="clients" className="space-y-2 mt-4">
          {clients.map((client) => (
            <Card key={client.id}>
              <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => toggleClient(client.id)}>
                {expanded.has(client.id)
                  ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="font-medium">{client.name}</span>
                  {client.client_nr && <span className="text-xs text-muted-foreground">{client.client_nr}</span>}
                  <Badge variant={client.active ? "success" : "secondary"} className="text-xs">
                    {client.active ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                      setClientForm({ name: client.name, client_nr: client.client_nr ?? "", country: client.country })
                      setClientDialog(true)
                    }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {expanded.has(client.id) && (
                <div className="border-t bg-muted/20">
                  {/* Booking items */}
                  {(bookingItems[client.id] ?? []).length > 0 && (
                    <div className="px-6 py-2 border-b">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Buchungsposten</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(bookingItems[client.id] ?? []).map((b) => (
                          <div key={b.id} className="flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs">
                            <span className="font-mono">{b.name}</span>
                            {b.description && <span className="text-muted-foreground ml-1">— {b.description}</span>}
                            <button className="text-muted-foreground hover:text-destructive ml-1"
                              onClick={() => deleteBooking(b.id, client.id)}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3 flex justify-end">
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
                        <div className="flex items-center gap-3 px-6 py-2.5 cursor-pointer hover:bg-muted/20"
                          onClick={() => toggleProject(p.id)}>
                          {expandedProjects.has(p.id)
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{p.name}</span>
                              {p.project_nr && <span className="text-xs text-muted-foreground">{p.project_nr}</span>}
                              {p.sub_project && <span className="text-xs text-muted-foreground">/ {p.sub_project}</span>}
                            </div>
                            {p.category && <p className="text-xs text-muted-foreground">{p.category}</p>}
                          </div>
                          {p.hourly_rate && <span className="text-xs text-muted-foreground">{p.hourly_rate} €/h</span>}
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="gap-1 text-xs h-7"
                              onClick={() => {
                                setTaskForm({ name: "", description: "", project_id: p.id })
                                setEditingTask(null); setTaskDialog(true)
                              }}>
                              <Plus className="h-3 w-3" />Aufgabe
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => {
                                setSelectedClientId(client.id)
                                setEditingProject(p)
                                setProjectForm({ name: p.name, project_nr: p.project_nr ?? "", sub_project: p.sub_project ?? "", category: p.category ?? "", hourly_rate: p.hourly_rate?.toString() ?? "" })
                                setProjectDialog(true)
                              }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {expandedProjects.has(p.id) && (
                          <div className="bg-muted/10 px-10 py-2 space-y-1">
                            {(projectTasks[p.id] ?? []).length === 0
                              ? <p className="text-xs text-muted-foreground">Keine Aufgaben</p>
                              : (projectTasks[p.id] ?? []).map((t) => (
                                <div key={t.id} className="flex items-center gap-2 text-xs py-0.5 group">
                                  <span className="flex-1 font-medium">{t.name}</span>
                                  {t.description && <span className="text-muted-foreground">{t.description}</span>}
                                  <button
                                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => deleteTask(t.id, p.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </button>
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
                  </div>
                </div>
              )}
            </Card>
          ))}
          {clients.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">Noch keine Kunden.</p>
          )}
        </TabsContent>

        {/* ── Tab 2: Tasks & Booking Items with client filter ── */}
        <TabsContent value="tasks" className="mt-4 space-y-4">
          {/* Client filter */}
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-sm">Kunde filtern:</Label>
            <Select value={filterClientId} onValueChange={setFilterClientId}>
              <SelectTrigger className="w-56">
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

          <div className="grid grid-cols-2 gap-4">
            {/* Tasks */}
            <Card>
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-medium text-sm">Aufgaben</h3>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => {
                    setTaskForm({
                      name: "",
                      description: "",
                      project_id: filterClientId !== "_all" && filterClientId !== "_none" ? "" : "",
                    })
                    setEditingTask(null); setTaskDialog(true)
                  }}>
                  <Plus className="h-3.5 w-3.5" />Hinzufügen
                </Button>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {filteredTasks.length === 0
                  ? <p className="px-4 py-4 text-xs text-muted-foreground">Keine Aufgaben</p>
                  : filteredTasks.map((t) => {
                    const proj = t.project as { name: string } | null
                    return (
                      <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          {proj && <p className="text-xs text-muted-foreground truncate">📁 {proj.name}</p>}
                          {!t.project_id && <p className="text-xs text-muted-foreground">Ohne Projekt</p>}
                          {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteTask(t.id, t.project_id)}>
                            <Trash2 className="h-3.5 w-3.5" />
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
              <div className="p-4 border-b flex items-center justify-between">
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
              <div className="divide-y max-h-96 overflow-y-auto">
                {filteredBookings.length === 0
                  ? <p className="px-4 py-4 text-xs text-muted-foreground">Keine Buchungsposten</p>
                  : filteredBookings.map((b) => {
                    const clientName = clients.find(c => c.id === b.client_id)?.name
                    return (
                      <div key={b.id} className="flex items-center gap-2 px-4 py-2.5 group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono truncate">{b.name}</p>
                          {clientName && <p className="text-xs text-muted-foreground">👤 {clientName}</p>}
                          {!b.client_id && <p className="text-xs text-muted-foreground">Ohne Kundenzuordnung</p>}
                          {b.description && <p className="text-xs text-muted-foreground truncate">{b.description}</p>}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteBooking(b.id, b.client_id)}>
                            <Trash2 className="h-3.5 w-3.5" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientDialog(false)}>Abbrechen</Button>
            <Button onClick={saveClient}>{editingClient ? "Speichern" : "Erstellen"}</Button>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialog(false)}>Abbrechen</Button>
            <Button onClick={saveProject}>{editingProject ? "Speichern" : "Erstellen"}</Button>
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
            <div className="space-y-2">
              <Label>Projekt (optional)</Label>
              <Select value={taskForm.project_id || "_none"} onValueChange={(v) => setTaskForm({ ...taskForm, project_id: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Kein Projekt —</SelectItem>
                  {flatProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialog(false)}>Abbrechen</Button>
            <Button onClick={saveTask}>{editingTask ? "Speichern" : "Erstellen"}</Button>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialog(false)}>Abbrechen</Button>
            <Button onClick={saveBooking}>{editingBooking ? "Speichern" : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
