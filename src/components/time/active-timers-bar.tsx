"use client"

import { useEffect, useState, useCallback } from "react"
import { Play, Pause, Square, Pencil, Trash2 } from "lucide-react"
import { TimerPlay } from "@/components/icons/timer-play"
import { createClient } from "@/lib/supabase/client"
import type { ActiveTimer, Client, Project, Task } from "@/types/database"
import { useTimerDisplay } from "@/lib/timer-display-context"
import type { TimerFieldItem } from "@/lib/timer-display-context"
import { formatDuration } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StartTimerDialog } from "./start-timer-dialog"
import { EditTimerDialog } from "./edit-timer-dialog"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

interface TimerWithRelations extends ActiveTimer {
  client: Client
  project: Project
  task?: Task
}

interface ActiveTimersBarProps {
  userId: string
}

export function ActiveTimersBar({ userId }: ActiveTimersBarProps) {
  const supabase = createClient()
  const { timerFields } = useTimerDisplay()
  const [timers, setTimers] = useState<TimerWithRelations[]>([])
  const [now, setNow] = useState(Date.now())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTimer, setEditingTimer] = useState<TimerWithRelations | null>(null)
  const [deletingTimerId, setDeletingTimerId] = useState<string | null>(null)

  // Tick every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const loadTimers = useCallback(async () => {
    const { data } = await supabase
      .from("active_timers")
      .select("*, client:clients(*), project:projects(*), task:tasks(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (data) setTimers(data as TimerWithRelations[])
  }, [supabase, userId])

  useEffect(() => {
    loadTimers()

    const channel = supabase
      .channel("active_timers")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_timers" }, loadTimers)
      .subscribe()

    window.addEventListener("timori:timer-started", loadTimers)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener("timori:timer-started", loadTimers)
    }
  }, [loadTimers, supabase])

  function getElapsed(timer: ActiveTimer): number {
    const start = new Date(timer.started_at).getTime()
    const pausedExtra = timer.total_paused_ms ?? 0
    if (timer.paused_at) {
      const pausedAt = new Date(timer.paused_at).getTime()
      return pausedAt - start - pausedExtra
    }
    return now - start - pausedExtra
  }

  async function handlePause(timer: ActiveTimer) {
    if (timer.paused_at) {
      // Resume
      const pausedAt = new Date(timer.paused_at).getTime()
      const newTotalPaused = (timer.total_paused_ms ?? 0) + (Date.now() - pausedAt)
      await supabase
        .from("active_timers")
        .update({ paused_at: null, total_paused_ms: newTotalPaused })
        .eq("id", timer.id)
    } else {
      // Pause
      await supabase
        .from("active_timers")
        .update({ paused_at: new Date().toISOString() })
        .eq("id", timer.id)
    }
    loadTimers()
  }

  async function handleStop(timer: ActiveTimer) {
    const elapsedMs = getElapsed(timer)
    const netHours = elapsedMs / 1000 / 3600

    const now = new Date()
    const startedAt = new Date(timer.started_at)

    // Calculate time_from and time_to
    const timeFrom = startedAt.toTimeString().slice(0, 5)
    const timeTo = now.toTimeString().slice(0, 5)
    const date = startedAt.toISOString().slice(0, 10)

    const grossMs = now.getTime() - startedAt.getTime()
    const grossHours = grossMs / 1000 / 3600

    await supabase.from("time_entries").insert({
      user_id: userId,
      date,
      time_from: timeFrom,
      time_to: timeTo,
      break_min: Math.round((grossMs - elapsedMs) / 1000 / 60),
      client_id: timer.client_id,
      project_id: timer.project_id,
      code: timer.code,
      description: timer.description,
      remote: timer.client?.default_remote ?? false,
      gross_h: Math.round(grossHours * 100) / 100,
      net_h: Math.round(netHours * 100) / 100,
      task_id: timer.task_id ?? null,
      booking_item_text: timer.booking_item_text ?? "",
    })

    await supabase.from("active_timers").delete().eq("id", timer.id)
    toast.success(`Zeiteintrag gespeichert: ${formatDuration(elapsedMs)}`)
    loadTimers()
    window.dispatchEvent(new CustomEvent("timori:timer-stopped"))
  }

  async function handleDelete() {
    if (!deletingTimerId) return
    await supabase.from("active_timers").delete().eq("id", deletingTimerId)
    toast.success("Timer gelöscht")
    setDeletingTimerId(null)
    loadTimers()
  }

  if (timers.length === 0 && !dialogOpen) {
    return (
      <div className="fixed bottom-0 left-0 right-0 md:left-60 border-t bg-card px-4 py-2 flex items-center gap-3 max-md:px-2 max-md:gap-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Button className="gap-2 max-md:h-11" onClick={() => setDialogOpen(true)}>
          <TimerPlay className="h-4 w-4" />
          Timer starten
        </Button>
        <StartTimerDialog
          userId={userId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={() => { loadTimers(); window.dispatchEvent(new CustomEvent("timori:timer-started")) }}
        />
        {editingTimer && (
          <EditTimerDialog
            timer={editingTimer}
            open={!!editingTimer}
            onOpenChange={open => { if (!open) setEditingTimer(null) }}
            onSaved={loadTimers}
          />
        )}
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-60 border-t bg-card px-4 py-2 flex items-center gap-3 max-md:px-2 max-md:gap-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <Button
        className="shrink-0 gap-2 max-md:h-11 max-md:w-11 max-md:p-0 max-md:gap-0"
        onClick={() => setDialogOpen(true)}
        title="Neuer Timer"
        aria-label="Neuer Timer"
      >
        <TimerPlay className="h-4 w-4" />
        <span className="max-md:hidden">Neuer Timer</span>
      </Button>
      <div className="flex items-center gap-3 overflow-x-auto min-w-0 max-md:gap-2 max-md:snap-x max-md:snap-mandatory">
      {timers.map((timer) => {
        const elapsed = getElapsed(timer)
        const isPaused = !!timer.paused_at
        return (
          <div
            key={timer.id}
            className="flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 shrink-0 max-md:px-2 max-md:py-1 max-md:snap-start"
          >
            {/* Clickable info section → edit dialog */}
            <button
              type="button"
              className="flex items-center gap-2 min-w-0 text-left hover:opacity-75 transition-opacity group"
              onClick={() => setEditingTimer(timer)}
              title="Timer bearbeiten"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium truncate max-w-[240px] max-md:text-sm max-md:max-w-[80px]">
                  {timer.client?.name}
                </span>
                {timerFields
                  .filter(f => f.enabled)
                  .map(f => {
                    const value =
                      f.field === "projekt" ? timer.project?.name :
                      f.field === "buchungsposten" ? timer.booking_item_text :
                      f.field === "aufgabe" ? timer.task?.name :
                      timer.description || undefined
                    return value ? (
                      <span key={f.field} className="text-xs text-muted-foreground truncate max-w-[240px] max-md:hidden">
                        {value}
                      </span>
                    ) : null
                  })
                }
              </div>
              <span
                className={`font-mono text-sm font-semibold tabular-nums ${isPaused ? "text-muted-foreground" : "text-foreground"}`}
              >
                {formatDuration(elapsed)}
              </span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 max-md:hidden" />
            </button>
            {/* Controls */}
            <div className="flex items-center gap-1 ml-1 max-md:gap-0.5 max-md:ml-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 max-md:h-11 max-md:w-11"
                onClick={() => handlePause(timer)}
                title={isPaused ? "Fortsetzen" : "Pausieren"}
              >
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive max-md:h-11 max-md:w-11"
                onClick={() => handleStop(timer)}
                title="Stoppen & Speichern"
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive max-md:h-11 max-md:w-11"
                onClick={() => setDeletingTimerId(timer.id)}
                title="Timer löschen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )
      })}
      </div>
      <StartTimerDialog
        userId={userId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => { loadTimers(); window.dispatchEvent(new CustomEvent("timori:timer-started")) }}
      />
      {editingTimer && (
        <EditTimerDialog
          timer={editingTimer}
          open={!!editingTimer}
          onOpenChange={open => { if (!open) setEditingTimer(null) }}
          onSaved={loadTimers}
        />
      )}
      <Dialog open={!!deletingTimerId} onOpenChange={open => { if (!open) setDeletingTimerId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Timer löschen?</DialogTitle>
            <DialogDescription>
              Der Timer wird verworfen. Es wird kein Zeiteintrag erstellt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTimerId(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleDelete}>Löschen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
