"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Client, Project, Task, HourCode, BookingItemOption } from "@/types/database"
import { bookingItemOptionLabel, linkedVermittlerItemNames, loadBookingItemOptions } from "@/lib/booking-items"
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
import { BudgetHint, BudgetLine } from "@/components/time/budget-hint"
import { VermittlerMissingDialog } from "@/components/time/vermittler-missing-dialog"
import { useBookingItemBudgets } from "@/lib/use-booking-item-budgets"

export interface TimerInitialValues {
  clientId?: string
  projectId?: string
  taskId?: string
  bookingItemText?: string
  vermittlerBookingItemText?: string
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
  const [bookingItems, setBookingItems] = useState<BookingItemOption[]>([])
  const [bookingItemsClientId, setBookingItemsClientId] = useState("")
  const [clientId, setClientId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [taskId, setTaskId] = useState("")
  const [code, setCode] = useState<HourCode>("BEV")
  const [description, setDescription] = useState("")
  const [bookingItemText, setBookingItemText] = useState("")
  const [vermittlerBookingItemText, setVermittlerBookingItemText] = useState("")
  const [loading, setLoading] = useState(false)
  const [showVermittlerDialog, setShowVermittlerDialog] = useState(false)
  const [creatingBookingItem, setCreatingBookingItem] = useState(false)
  const [newBookingItemName, setNewBookingItemName] = useState("")
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [creatingTask, setCreatingTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState("")
  const budgetItemNames = useMemo(
    () => bookingItems.flatMap(b => [b.name, ...(b.linkedVermittlerItemNames ?? [])]),
    [bookingItems],
  )
  const bookingBudgets = useBookingItemBudgets(userId, clientId, null, budgetItemNames)

  // Apply initial values when dialog opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !initialValues) return
    if (initialValues.clientId) setClientId(initialValues.clientId)
    if (initialValues.projectId) setProjectId(initialValues.projectId)
    if (initialValues.taskId) setTaskId(initialValues.taskId)
    if (initialValues.bookingItemText !== undefined) setBookingItemText(initialValues.bookingItemText)
    if (initialValues.vermittlerBookingItemText !== undefined) setVermittlerBookingItemText(initialValues.vermittlerBookingItemText)
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
      loadBookingItemOptions(supabase, userId, clientId),
    ]).then(([pRes, bookingOptions]) => {
      setProjects(pRes.data ?? [])
      setBookingItems(bookingOptions)
      setBookingItemsClientId(clientId)
    })
  }, [clientId, supabase, userId])

  // Genau ein verknüpfter Vermittler-BP: automatisch vorauswählen. Läuft nur bei
  // Änderung des Buchungspostens, damit ein manuelles "Keiner" bestehen bleibt.
  useEffect(() => {
    if (bookingItemsClientId !== clientId) return
    const linked = linkedVermittlerItemNames(bookingItems, bookingItemText)
    if (linked.length === 1) setVermittlerBookingItemText(current => current || linked[0])
  }, [bookingItems, bookingItemsClientId, clientId, bookingItemText])

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
    setBookingItems(prev => [...prev, { ...data, kind: "own" as const }].sort((a, b) => a.name.localeCompare(b.name)))
    setBookingItemText(data.name)
    setVermittlerBookingItemText("")
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

  async function handleStart(confirmedWithoutVermittler = false) {
    if (!clientId) { toast.error("Bitte Kunde auswählen"); return }
    if (!confirmedWithoutVermittler && !vermittlerBookingItemText && linkedVermittlerItemNames(bookingItems, bookingItemText).length > 0) {
      setShowVermittlerDialog(true)
      return
    }
    setShowVermittlerDialog(false)
    setLoading(true)
    const { error } = await supabase.from("active_timers").insert({
      user_id: userId,
      client_id: clientId,
      project_id: projectId || null,
      code,
      description,
      task_id: taskId || null,
      booking_item_text: bookingItemText,
      vermittler_booking_item_text: vermittlerBookingItemText,
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
      setClientId(""); setProjectId(""); setTaskId(""); setDescription("")
      setBookingItemText(""); setVermittlerBookingItemText("")
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
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId(""); setTaskId(""); setVermittlerBookingItemText(""); setCreatingProject(false); setCreatingTask(false) }}>
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
                setVermittlerBookingItemText("")
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
                {bookingItems.filter((b) => b.kind === "own").map((b) => (
                  <SelectItem key={b.id} value={b.name} hint={<BudgetHint budget={bookingBudgets.get(b.name)} />}>{bookingItemOptionLabel(b)}</SelectItem>
                ))}
                {bookingItems.some((b) => b.kind === "vermittler") && <SelectSeparator />}
                {bookingItems.filter((b) => b.kind === "vermittler").map((b) => (
                  <SelectItem key={b.id} value={b.name} hint={<BudgetHint budget={bookingBudgets.get(b.name)} />}>{bookingItemOptionLabel(b)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bookingItemText && <BudgetLine budget={bookingBudgets.get(bookingItemText)} />}
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
            {/* Vermittler sub-dropdown */}
            {(() => {
              const opts = linkedVermittlerItemNames(bookingItems, bookingItemText)
              if (opts.length === 0) return null
              return (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Vermittler-Buchungsposten</Label>
                  <Select
                    value={vermittlerBookingItemText || "_none"}
                    onValueChange={v => setVermittlerBookingItemText(v === "_none" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Welcher Vermittler-Buchungsposten?" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Keiner —</SelectItem>
                      {opts.map(name => (
                        <SelectItem key={name} value={name} hint={<BudgetHint budget={bookingBudgets.get(name)} />}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })()}
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
          <Button onClick={() => handleStart()} disabled={loading} className="gap-2">
            <TimerPlay className="h-4 w-4 max-md:h-6 max-md:w-6" />
            {loading ? "Startet..." : "Timer starten"}
          </Button>
        </DialogFooter>
        <VermittlerMissingDialog
          open={showVermittlerDialog}
          onOpenChange={setShowVermittlerDialog}
          bookingItemName={bookingItemText}
          confirmLabel="Ohne Vermittler-BP starten"
          onConfirm={() => handleStart(true)}
        />
      </DialogContent>
    </Dialog>
  )
}
