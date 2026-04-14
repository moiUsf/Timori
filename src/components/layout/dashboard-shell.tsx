"use client"

import { useEffect, useRef, useState } from "react"
import { Menu, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sidebar } from "./sidebar"
import { ActiveTimersBar } from "@/components/time/active-timers-bar"
import { TimerDisplayProvider } from "@/lib/timer-display-context"
import { isBackupDue, downloadBlob } from "@/lib/backup-idb"
import type { UserProfile } from "@/types/database"
import type { User } from "@supabase/supabase-js"

export function DashboardShell({
  user,
  profile,
  children,
}: {
  user: User
  profile: UserProfile
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const backupInProgress = useRef(false)

  useEffect(() => {
    async function checkAndBackup() {
      if (backupInProgress.current) return
      const schedule = (localStorage.getItem("backupSchedule") ?? "never") as "never"|"daily"|"weekly"|"monthly"
      const last = localStorage.getItem("lastBackupAt")
      const time = localStorage.getItem("backupTime") ?? "02:00"
      if (!isBackupDue(schedule, last, time)) return

      backupInProgress.current = true
      try {
        const res = await fetch("/api/backup/export")
        if (!res.ok) return
        const json = await res.json()
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, "0")
        const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
        downloadBlob(blob, `timori-backup-${ts}.json`)
        localStorage.setItem("lastBackupAt", now.toISOString())
        // Notify dashboard reminder to hide if visible
        window.dispatchEvent(new CustomEvent("timori:backup-done"))
      } catch {
        // silent — dashboard reminder will still show on next login
      } finally {
        backupInProgress.current = false
      }
    }

    checkAndBackup() // immediate check on mount (catches missed backups)
    const interval = setInterval(checkAndBackup, 60_000) // re-check every minute
    return () => clearInterval(interval)
  }, [])

  return (
    <TimerDisplayProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:z-auto md:flex md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <Sidebar user={user} profile={profile} onClose={() => setOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent"
            aria-label="Menü öffnen"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Clock className="h-5 w-5" />
          <span className="text-base font-bold">Timori</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-24">
          {children}
        </main>

        <ActiveTimersBar userId={user.id} />
      </div>
    </div>
    </TimerDisplayProvider>
  )
}
