"use client"

import { useEffect, useRef, useState } from "react"
import { Menu, Clock } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Sidebar } from "./sidebar"
import { ActiveTimersBar } from "@/components/time/active-timers-bar"
import { TimerDisplayProvider } from "@/lib/timer-display-context"
import { isBackupDue, downloadBlob, loadHandleFromIDB, writeToFolder } from "@/lib/backup-idb"
import type { UserProfile } from "@/types/database"
import type { User } from "@supabase/supabase-js"

const PENDING_KEY = "backupPendingSince"
const FALLBACK_AFTER_MS = 30 * 60 * 1000

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
  const pendingToastShown = useRef(false)

  useEffect(() => {
    function makeFilename(now: Date): string {
      const pad = (n: number) => String(n).padStart(2, "0")
      const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
      return `timori-backup-${ts}.json`
    }

    async function fetchBlob(): Promise<Blob | null> {
      const res = await fetch("/api/backup/export")
      if (!res.ok) return null
      const json = await res.json()
      return new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
    }

    function markDone() {
      localStorage.setItem("lastBackupAt", new Date().toISOString())
      localStorage.removeItem(PENDING_KEY)
      pendingToastShown.current = false
      toast.dismiss("backup-pending")
      window.dispatchEvent(new CustomEvent("timori:backup-done"))
    }

    async function checkAndBackup() {
      if (backupInProgress.current) return
      const schedule = (localStorage.getItem("backupSchedule") ?? "never") as "never"|"daily"|"weekly"|"monthly"
      const last = localStorage.getItem("lastBackupAt")
      const time = localStorage.getItem("backupTime") ?? "02:00"
      if (!isBackupDue(schedule, last, time)) {
        localStorage.removeItem(PENDING_KEY)
        pendingToastShown.current = false
        toast.dismiss("backup-pending")
        return
      }

      backupInProgress.current = true
      try {
        const handle = await loadHandleFromIDB()
        const now = new Date()
        const filename = makeFilename(now)

        if (!handle) {
          const blob = await fetchBlob()
          if (!blob) return
          downloadBlob(blob, filename)
          markDone()
          return
        }

        // Folder configured — try to write there first
        const blob = await fetchBlob()
        if (!blob) return
        const saved = await writeToFolder(handle, blob, filename)
        if (saved) { markDone(); return }

        // Permission not granted — prompt user, fall back to download after 30 min
        const pendingRaw = localStorage.getItem(PENDING_KEY)
        const pendingMs = pendingRaw ? Number(pendingRaw) : null
        const nowMs = now.getTime()

        if (pendingMs && nowMs - pendingMs > FALLBACK_AFTER_MS) {
          downloadBlob(blob, filename)
          markDone()
          toast.info("Backup als Download gespeichert (Ordnerzugriff nicht bestätigt)")
          return
        }

        if (!pendingMs) {
          localStorage.setItem(PENDING_KEY, String(nowMs))
        }
        if (!pendingToastShown.current) {
          pendingToastShown.current = true
          toast("Backup fällig — Ordnerzugriff erneut bestätigen?", {
            id: "backup-pending",
            duration: Infinity,
            action: {
              label: "Zugriff gewähren",
              onClick: async () => {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const h = handle as any
                  const perm = await h.requestPermission?.({ mode: "readwrite" }) ?? "denied"
                  if (perm !== "granted") {
                    toast.error("Zugriff verweigert")
                    return
                  }
                  const freshBlob = await fetchBlob()
                  if (!freshBlob) { toast.error("Backup-Export fehlgeschlagen"); return }
                  const freshName = makeFilename(new Date())
                  const ok = await writeToFolder(handle, freshBlob, freshName)
                  if (ok) {
                    markDone()
                    toast.success("Backup gespeichert")
                  } else {
                    toast.error("Backup fehlgeschlagen")
                  }
                } catch {
                  toast.error("Backup fehlgeschlagen")
                }
              },
            },
          })
        }
      } catch {
        // silent — reminder stays visible
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
