"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { ActiveTimer, Client, Project, Task, HourCode } from "@/types/database"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Save, Plus } from "lucide-react"

const HOUR_CODES: { value: HourCode; label: string }[] = [
  { value: "BEV", label: "BEV — Beratung verrechenbar" },
  { value: "BENV", label: "BENV — Beratung nicht verrechenbar" },
  { value: "RZV", label: "RZV — Reisezeit verrechenbar" },
  { value: "RZNV", label: "RZNV — Reisezeit nicht verrechenbar" },
]

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface EditTimerDialogProps {
  timer: ActiveTimer & { client?: Client; project?: Project }
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function EditTimerDialog({ timer, open, onOpenChange, onSaved }: EditTimerDialogProps) {
  const supabase = createClient()
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [bookingItems, setBookingItems] = useState<{ id: string; name: string }[]>([])

  const [projectId, setProjectId] = useState("")
  const [taskId, setTaskId] = useState("")
  const [code, setCode] = useState<HourCode>("BEV")
  const [description, setDescription] = useState("")
  const [bookingItemText, setBookingItemText] = useState("")
  const [startedAt, setStartedAt] = useState("")
  const [saving, setSaving] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [creatingTask, setCreatingTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState("")

  // Re-init fields whenever this dialog opens (handles switching between timers)
  useEffect(() => {
    if (!open) return
    setProjectId(timer.project_id || "")
    setTaskId(timer.task_id || "")
    setCode(timer.code)
    setDescription(timer.description || "")
    setBookingItemText(timer.booking_item_text || "")
    setStartedAt(toDatetimeLocal(timer.started_at))
  }, [open, timer.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load projects + booking items for client
  useEffect(() => {
    if (!open || !timer.client_id) return
    Promise.all([
      supabase.from("projects").select("*").eq("client_id", timer.client_id).eq("active", true).order("name"),
      supabase.from("booking_items").select("id, name")
        .eq("user_id", timer.user_id)
        .or(`client_id.eq.${timer.client_id},client_id.is.null`)
        .eq("active", true).order("name"),
    ]).then(([pRes, bRes]) => {
      setProjects(pRes.data ?? [])
      setBookingItems(bRes.data ?? [])
    })
  }, [open, timer.client_id, timer.user_id, supabase])

  // Load tasks when project changes
  useEffect(() => {
    if (!open) return
    async function loadTasks() {
      const noProjectBase = supabase.from("tasks")
        .select("*").eq("user_id", timer.user_id).is("project_id", null).eq("active", true).order("name")

      const noProjectRes = timer.client_id
        ? await noProjectBase.or(`client_id.eq.${timer.client_id},client_id.is.null`)
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
  }, [open, projectId, timer.client_id, timer.user_id, supabase])

  async function handleCreateProject() {
    if (!newProjectName.trim() || !timer.client_id) return
    const { data, error } = await supabase.from("projects").insert({
      user_id: timer.user_id,
      client_id: timer.client_id,
      name: newProjectName.trim(),
      active: true,
    }).select().single()
    if (error) { toast.error("Fehler: " + error.message); return }
    setProjects(prev => [...prev, data as Project].sort((a, b) => a.name.localeCompare(b.name)))
    setProjectId(data.id)
    setTaskId("")
    setCreatingProject(false)
    setNewProjectName("")
    toast.success("Projekt erstellt")
  }

  async function handleCreateTask() {
    if (!newTaskName.trim()) return
    const { data, error } = await supabase.from("tasks").insert({
      user_id: timer.user_id,
      name: newTaskName.trim(),
      project_id: projectId || null,
      client_id: projectId ? null : (timer.client_id || null),
      active: true,
    }).select().single()
    if (error) { toast.error("Fehler: " + error.message); return }
    setTasks(prev => [...prev, data as Task].sort((a, b) => a.name.localeCompare(b.name)))
    setTaskId(data.id)
    setCreatingTask(false)
    setNewTaskName("")
    toast.success("Aufgabe erstellt")
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from("active_timers").update({
      project_id: projectId || null,
      task_id: taskId || null,
      code,
      description,
      booking_item_text: bookingItemText,
      started_at: new Date(startedAt).toISOString(),
    }).eq("id", timer.id)

    if (error) {
      toast.error("Fehler: " + error.message)
    } else {
      toast.success("Timer aktualisiert")
      onSaved()
      onOpenChange(false)
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Timer bearbeiten — {timer.client?.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">

          {/* Booking item */}
          <div className="space-y-2">
            <Label>Buchungsposten (optional)</Label>
            {bookingItems.length > 0 ? (
              <Select
                value={bookingItemText || "_manual"}
                onValueChange={v => setBookingItemText(v === "_manual" ? "" : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_manual">— Manuell eingeben —</SelectItem>
                  {bookingItems.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            {(bookingItems.length === 0 || !bookingItems.find(b => b.name === bookingItemText)) && (
              <Input
                placeholder="z.B. 4800061526 - Support PI/PO"
                value={bookingItemText}
                onChange={e => setBookingItemText(e.target.value)}
                className={bookingItems.length > 0 ? "mt-1" : ""}
              />
            )}
          </div>

          {/* Project */}
          <div className="space-y-2">
            <Label>Projekt</Label>
            <Select
              key={`project-${projectId}-${projects.length}`}
              value={projectId || "_none"}
              onValueChange={v => {
                if (v === "_create_project") { setCreatingProject(true); setNewProjectName(""); return }
                setProjectId(v === "_none" ? "" : v)
                setTaskId("")
                setCreatingProject(false)
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Kein Projekt —</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                <SelectSeparator />
                <SelectItem value="_create_project" className="text-primary font-medium">
                  <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Neues Projekt erstellen</span>
                </SelectItem>
              </SelectContent>
            </Select>
            {creatingProject && (
              <div className="flex gap-1.5">
                <Input autoFocus placeholder="Projektname..." value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleCreateProject() } if (e.key === "Escape") setCreatingProject(false) }} />
                <Button type="button" size="sm" onClick={handleCreateProject} disabled={!newProjectName.trim()} className="shrink-0"><Plus className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCreatingProject(false)} className="shrink-0 text-muted-foreground">✕</Button>
              </div>
            )}
          </div>

          {/* Task */}
          <div className="space-y-2">
            <Label>Aufgabe (optional)</Label>
            <Select
              key={`task-${taskId}-${tasks.length}`}
              value={taskId || "_none"}
              onValueChange={v => {
                if (v === "_create_task") { setCreatingTask(true); setNewTaskName(""); return }
                setTaskId(v === "_none" ? "" : v)
                setCreatingTask(false)
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Keine Aufgabe —</SelectItem>
                {tasks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                <SelectSeparator />
                <SelectItem value="_create_task" className="text-primary font-medium">
                  <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Neue Aufgabe erstellen</span>
                </SelectItem>
              </SelectContent>
            </Select>
            {creatingTask && (
              <div className="flex gap-1.5">
                <Input autoFocus placeholder="Aufgabenname..." value={newTaskName}
                  onChange={e => setNewTaskName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleCreateTask() } if (e.key === "Escape") setCreatingTask(false) }} />
                <Button type="button" size="sm" onClick={handleCreateTask} disabled={!newTaskName.trim()} className="shrink-0"><Plus className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCreatingTask(false)} className="shrink-0 text-muted-foreground">✕</Button>
              </div>
            )}
          </div>

          {/* Code */}
          <div className="space-y-2">
            <Label>Stundencode</Label>
            <Select value={code} onValueChange={v => setCode(v as HourCode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOUR_CODES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Beschreibung (optional)</Label>
            <Input
              placeholder="Tätigkeit kurz beschreiben..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Start time */}
          <div className="space-y-2">
            <Label>Startzeit</Label>
            <input
              type="datetime-local"
              value={startedAt}
              onChange={e => setStartedAt(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Speichert..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
