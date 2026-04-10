"use client"

import { useEffect, useState, useCallback } from "react"
import { Play, Pause, Square, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { ActiveTimer, Client, Project } from "@/types/database"
import { formatDuration } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StartTimerDialog } from "./start-timer-dialog"
import { toast } from "sonner"

interface TimerWithRelations extends ActiveTimer {
  client: Client
  project: Project
}

interface ActiveTimersBarProps {
  userId: string
}

export function ActiveTimersBar({ userId }: ActiveTimersBarProps) {
  const supabase = createClient()
  const [timers, setTimers] = useState<TimerWithRelations[]>([])
  const [now, setNow] = useState(Date.now())
  const [dialogOpen, setDialogOpen] = useState(false)

  // Tick every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const loadTimers = useCallback(async () => {
    const { data } = await supabase
      .from("active_timers")
      .select("*, client:clients(*), project:projects(*)")
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

    return () => { supabase.removeChannel(channel) }
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
      remote: false,
      gross_h: Math.round(grossHours * 100) / 100,
      net_h: Math.round(netHours * 100) / 100,
    })

    await supabase.from("active_timers").delete().eq("id", timer.id)
    toast.success(`Zeiteintrag gespeichert: ${formatDuration(elapsedMs)}`)
    loadTimers()
  }

  if (timers.length === 0 && !dialogOpen) {
    return (
      <div className="fixed bottom-0 left-60 right-0 border-t bg-card px-4 py-2 flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Timer starten
        </Button>
        <StartTimerDialog
          userId={userId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={loadTimers}
        />
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-60 right-0 border-t bg-card px-4 py-2 flex items-center gap-3 overflow-x-auto">
      {timers.map((timer) => {
        const elapsed = getElapsed(timer)
        const isPaused = !!timer.paused_at
        return (
          <div
            key={timer.id}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 shrink-0"
          >
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                  {timer.code}
                </Badge>
                <span className="text-xs font-medium truncate max-w-[120px]">
                  {timer.client?.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                {timer.project?.name}
              </span>
            </div>
            <span
              className={`font-mono text-sm font-semibold tabular-nums ${isPaused ? "text-muted-foreground" : "text-foreground"}`}
            >
              {formatDuration(elapsed)}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handlePause(timer)}
                title={isPaused ? "Fortsetzen" : "Pausieren"}
              >
                {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => handleStop(timer)}
                title="Stoppen & Speichern"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )
      })}
      <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={() => setDialogOpen(true)}>
        <Plus className="h-4 w-4" />
        Neuer Timer
      </Button>
      <StartTimerDialog
        userId={userId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={loadTimers}
      />
    </div>
  )
}
