"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Client, Project, Task, HourCode } from "@/types/database"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { TimerPlay } from "@/components/icons/timer-play"

export interface TimerInitialValues {
  clientId?: string
  projectId?: string
  taskId?: string
  bookingItemText?: string
  description?: string
  code?: HourCode
}

const HOUR_CODES: { value: HourCode; label: string }[] = [
  { value: "BEV", label: "BEV — Beratung verrechenbar" },
  { value: "BENV", label: "BENV — Beratung nicht verrechenbar" },
  { value: "RZV", label: "RZV — Reisezeit verrechenbar" },
  { value: "RZNV", label: "RZNV — Reisezeit nicht verrechenbar" },
]

interface StartTimerDialogProps {
  userId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  initialValues?: TimerInitialValues
}

export function StartTimerDialog({ userId, open, onOpenChange, onCreated, initialValues }: StartTimerDialogProps) {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [bookingItems, setBookingItems] = useState<{ id: string; name: string }[]>([])
  const [clientId, setClientId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [taskId, setTaskId] = useState("")
  const [code, setCode] = useState<HourCode>("BEV")
  const [description, setDescription] = useState("")
  const [bookingItemText, setBookingItemText] = useState("")
  const [loading, setLoading] = useState(false)
  const [creatingBookingItem, setCreatingBookingItem] = useState(false)
  const [newBookingItemName, setNewBookingItemName] = useState("")
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [creatingTask, setCreatingTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState("")

  // Apply initial values when dialog opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !initialValues) return
    if (initialValues.clientId) setClientId(initialValues.clientId)
    if (initialValues.projectId) setProjectId(initialValues.projectId)
    if (initialValues.taskId) setTaskId(initialValues.taskId)
    if (initialValues.bookingItemText !== undefined) setBookingItemText(initialValues.bookingItemText)
    if (initialValues.description !== undefined) setDescription(initialValues.description)
    if (initialValues.code) setCode(initialValues.code)
  }, [open])

  useEffect(() => {
    supabase.from("clients").select("*").eq("user_id", userId).eq("active", true).order("name")
      .then(({ data }) => setClients(data ?? []))
  }, [supabase, userId])

  useEffect(() => {
    if (!clientId) { setProjects([]); setBookingItems([]); return }
    Promise.all([
      supabase.from("projects").select("*").eq("client_id", clientId).eq("active", true).order("name"),
      supabase.from("booking_items").select("id, name")
        .eq("user_id", userId)
        .or(`client_id.eq.${clientId},client_id.is.null`)
        .eq("active", true).order("name"),
    ]).then(([pRes, bRes]) => {
      setProjects(pRes.data ?? [])
      setBookingItems(bRes.data ?? [])
    })
  }, [clientId, supabase, userId])

  useEffect(() => {
    if (!userId) return

    async function loadTasks() {
      const noProjectBase = supabase.from("tasks")
        .select("*").eq("user_id", userId).is("project_id", null).eq("active", true).order("name")

      const noProjectRes = clientId
        ? await noProjectBase.or(`client_id.eq.${clientId},client_id.is.null`)
        : await noProjectBase

      if (!projectId) {
        setTasks(noProjectRes.data ?? [])
        return
      }

      const projRes = await supabase.from("tasks")
        .select("*").eq("project_id", projectId).eq("active", true).order("name")

      const combined = [...(projRes.data ?? []), ...(noProjectRes.data ?? [])]
      combined.sort((a: Task, b: Task) => a.name.localeCompare(b.name))
      setTasks(combined)
    }

    loadTasks()
  }, [projectId, clientId, supabase, userId])

  async function handleCreateBookingItem() {
    if (!newBookingItemName.trim()) return
    const { data, error } = await supabase.from("booking_items").insert({
      user_id: userId,
      client_id: clientId || null,
      name: newBookingItemName.trim(),
      active: true,
    }).select("id, name").single()
    if (error) { toast.error("Fehler: " + error.message); return }
    setBookingItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setBookingItemText(data.name)
    setCreatingBookingItem(false)
    setNewBookingItemName("")
    toast.success("Buchungsposten erstellt")
  }

  async function handleCreateProject() {
    if (!newProjectName.trim() || !clientId) return
    const { data, error } = await supabase.from("projects").insert({
      user_id: userId,
      client_id: clientId,
      name: newProjectName.trim(),
      active: true,
    }).select().single()
    if (error) { toast.error("Fehler: " + error.message); return }
    setProjects(prev => [...prev, data as Project].sort((a, b) => a.name.localeCompare(b.name)))
    setProjectId(data.id)
    setCreatingProject(false)
    setNewProjectName("")
    toast.success("Projekt erstellt")
  }

  async function handleCreateTask() {
    if (!newTaskName.trim()) return
    const { data, error } = await supabase.from("tasks").insert({
      user_id: userId,
      name: newTaskName.trim(),
      project_id: projectId || null,
      client_id: projectId ? null : (clientId || null),
      active: true,
    }).select().single()
    if (error) { toast.error("Fehler: " + error.message); return }
    setTasks(prev => [...prev, data as Task].sort((a, b) => a.name.localeCompare(b.name)))
    setTaskId(data.id)
    setCreatingTask(false)
    setNewTaskName("")
    toast.success("Aufgabe erstellt")
  }

  async function handleStart() {
    if (!clientId) { toast.error("Bitte Kunde auswählen"); return }
    setLoading(true)
    const { error } = await supabase.from("active_timers").insert({
      user_id: userId,
      client_id: clientId,
      project_id: projectId || null,
      code,
      description,
      task_id: taskId || null,
      booking_item_text: bookingItemText,
      started_at: new Date().toISOString(),
      paused_at: null,
      total_paused_ms: 0,
    })
    if (error) {
      toast.error("Fehler: " + error.message)
    } else {
      toast.success("Timer gestartet")
      onCreated()
      onOpenChange(false)
      setClientId(""); setProjectId(""); setTaskId(""); setDescription(""); setBookingItemText("")
      setCreatingBookingItem(false); setCreatingProject(false); setCreatingTask(false)
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuen Timer starten</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">

          {/* Kunde */}
          <div className="space-y-2">
            <Label>Kunde</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId(""); setTaskId(""); setCreatingProject(false); setCreatingTask(false) }}>
              <SelectTrigger><SelectValue placeholder="Kunde wählen..." /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Buchungsposten */}
          <div className="space-y-2">
            <Label>Buchungsposten (optional)</Label>
            <Select key={`booking-${bookingItems.length}`} value={bookingItemText}
              onValueChange={(v) => {
                if (v === "_create_booking_item") {
                  setCreatingBookingItem(true)
                  setNewBookingItemName("")
                  return
                }
                setBookingItemText(v)
                setCreatingBookingItem(false)
              }}>
              <SelectTrigger><SelectValue placeholder="Buchungsposten wählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_create_booking_item" className="text-primary font-medium">
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />Neuen Buchungsposten erstellen
                  </span>
                </SelectItem>
                {bookingItems.length > 0 && <SelectSeparator />}
                {bookingItems.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {creatingBookingItem && (
              <div className="flex gap-1.5 mt-1">
                <Input
                  autoFocus
                  placeholder="Buchungspostenname..."
                  value={newBookingItemName}
                  onChange={e => setNewBookingItemName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); handleCreateBookingItem() }
                    if (e.key === "Escape") setCreatingBookingItem(false)
                  }}
                />
                <Button type="button" size="sm" onClick={handleCreateBookingItem}
                  disabled={!newBookingItemName.trim()} className="shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost"
                  onClick={() => setCreatingBookingItem(false)} className="shrink-0 text-muted-foreground">
                  ✕
                </Button>
              </div>
            )}
          </div>

          {/* Projekt */}
          <div className="space-y-2">
            <Label>Projekt</Label>
            <Select
              key={`project-${projectId}-${projects.length}`}
              value={projectId || "_none"}
              onValueChange={v => {
                if (v === "_create_project") {
                  setCreatingProject(true)
                  setNewProjectName("")
                  return
                }
                setProjectId(v === "_none" ? "" : v)
                setTaskId("")
                setCreatingProject(false)
              }}
              disabled={!clientId}
            >
              <SelectTrigger><SelectValue placeholder="Projekt wählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_create_project" className="text-primary font-medium">
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />Neues Projekt erstellen
                  </span>
                </SelectItem>
                <SelectSeparator />
                <SelectItem value="_none">— Kein Projekt —</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
                />
                <Button type="button" size="sm" onClick={handleCreateProject}
                  disabled={!newProjectName.trim()} className="shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost"
                  onClick={() => setCreatingProject(false)} className="shrink-0 text-muted-foreground">
                  ✕
                </Button>
              </div>
            )}
          </div>

          {/* Aufgabe */}
          <div className="space-y-2">
            <Label>Aufgabe (optional)</Label>
            <Select
              key={`task-${taskId}-${tasks.length}`}
              value={taskId || "_none"}
              onValueChange={(v) => {
                if (v === "_create_task") {
                  setCreatingTask(true)
                  setNewTaskName("")
                  return
                }
                setTaskId(v === "_none" ? "" : v)
                setCreatingTask(false)
              }}
            >
              <SelectTrigger><SelectValue placeholder="Aufgabe wählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_create_task" className="text-primary font-medium">
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />Neue Aufgabe erstellen
                  </span>
                </SelectItem>
                <SelectSeparator />
                <SelectItem value="_none">— Keine Aufgabe —</SelectItem>
                {tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
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
                />
                <Button type="button" size="sm" onClick={handleCreateTask}
                  disabled={!newTaskName.trim()} className="shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost"
                  onClick={() => setCreatingTask(false)} className="shrink-0 text-muted-foreground">
                  ✕
                </Button>
              </div>
            )}
          </div>

          {/* Beschreibung */}
          <div className="space-y-2">
            <Label>Beschreibung (optional)</Label>
            <Input placeholder="Tätigkeit kurz beschreiben..."
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Stundencode */}
          <div className="space-y-2">
            <Label>Stundencode</Label>
            <Select value={code} onValueChange={(v) => setCode(v as HourCode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOUR_CODES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleStart} disabled={loading} className="gap-2">
            <TimerPlay className="h-4 w-4 max-md:h-6 max-md:w-6" />
            {loading ? "Startet..." : "Timer starten"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
