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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Play } from "lucide-react"

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
}

export function StartTimerDialog({ userId, open, onOpenChange, onCreated }: StartTimerDialogProps) {
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
          <div className="space-y-2">
            <Label>Kunde</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId(""); setTaskId("") }}>
              <SelectTrigger><SelectValue placeholder="Kunde wählen..." /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Projekt</Label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setTaskId("") }} disabled={!clientId}>
              <SelectTrigger><SelectValue placeholder="Projekt wählen..." /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Aufgabe (optional)</Label>
            <Select value={taskId || "_none"} onValueChange={(v) => setTaskId(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Aufgabe wählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Keine Aufgabe —</SelectItem>
                {tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Buchungsposten (optional)</Label>
            {bookingItems.length > 0 ? (
              <Select value={bookingItemText || "_manual"}
                onValueChange={(v) => setBookingItemText(v === "_manual" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Buchungsposten wählen..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_manual">— Manuell eingeben —</SelectItem>
                  {bookingItems.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            {(bookingItems.length === 0 || !bookingItems.find(b => b.name === bookingItemText)) && (
              <Input
                placeholder="z.B. 4800061526 - Support PI/PO"
                value={bookingItemText}
                onChange={(e) => setBookingItemText(e.target.value)}
                className={bookingItems.length > 0 ? "mt-1" : ""}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Stundencode</Label>
            <Select value={code} onValueChange={(v) => setCode(v as HourCode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOUR_CODES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Beschreibung (optional)</Label>
            <Input placeholder="Tätigkeit kurz beschreiben..."
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleStart} disabled={loading} className="gap-2">
            <Play className="h-4 w-4" />
            {loading ? "Startet..." : "Timer starten"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
