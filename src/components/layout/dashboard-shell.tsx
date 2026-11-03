"use client"

import { useEffect, useRef, useState } from "react"
import { Menu, Clock } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Sidebar } from "./sidebar"
import { ActiveTimersBar } from "@/components/time/active-timers-bar"
import { TimerDisplayProvider } from "@/lib/timer-display-context"
import { useRouter } from "next/navigation"
import { isBackupDue, downloadBlob, loadHandleFromIDB, writeToFolder } from "@/lib/backup-idb"
import { KEY_FOLDER_NAME, readBackupSettings, recordBackupDone, syncBackupSettingsFromProfile } from "@/lib/backup-settings"
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
  const errorToastShown = useRef(false)
  const router = useRouter()

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
      recordBackupDone(user.id)
      pendingToastShown.current = false
      errorToastShown.current = false
      toast.dismiss("backup-pending")
      toast.dismiss("backup-error")
    }

    const goToSettings = { label: "Einstellungen", onClick: () => router.push("/settings") }

    /** Fehler sichtbar machen – nur einmal pro Sitzung, damit der Minuten-Check nicht spammt */
    function showError(message: string) {
      if (errorToastShown.current) return
      errorToastShown.current = true
      toast.error(message, { id: "backup-error", duration: Infinity, action: goToSettings })
    }

    function folderLostWarning(folderName: string | null) {
      toast.warning(
        `Backup-Ordner${folderName ? ` „${folderName}"` : ""} nicht erreichbar — Backup wurde als Download gespeichert. Bitte Ordner in den Einstellungen neu wählen.`,
        { id: "backup-folder-lost", duration: Infinity, action: goToSettings },
      )
    }

    async function checkAndBackup() {
      if (backupInProgress.current) return
      const { schedule, lastBackupAt, time } = readBackupSettings()
      if (!isBackupDue(schedule, lastBackupAt, time)) {
        localStorage.removeItem(PENDING_KEY)
        pendingToastShown.current = false
        toast.dismiss("backup-pending")
        return
      }

      backupInProgress.current = true
      try {
        const handle = await loadHandleFromIDB()
        const folderName = localStorage.getItem(KEY_FOLDER_NAME)
        const now = new Date()
        const filename = makeFilename(now)

        const blob = await fetchBlob()
        if (!blob) {
          showError("Automatisches Backup fehlgeschlagen — Daten-Export nicht möglich. Bitte manuell in den Einstellungen prüfen.")
          return
        }

        if (!handle) {
          downloadBlob(blob, filename)
          markDone()
          // Ordnername bekannt, aber Zugriff fehlt → Ordner ist "verloren gegangen"
          if (folderName) folderLostWarning(folderName)
          else toast.success(`Backup heruntergeladen: ${filename}`)
          return
        }

        // Folder configured — try to write there first
        const result = await writeToFolder(handle, blob, filename)
        if (result === "ok") {
          markDone()
          toast.success(`Backup gespeichert in „${handle.name}"`)
          return
        }
        if (result === "error") {
          downloadBlob(blob, filename)
          markDone()
          folderLostWarning(handle.name)
          return
        }

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
                  const res = await writeToFolder(handle, freshBlob, freshName)
                  if (res === "ok") {
                    markDone()
                    toast.success("Backup gespeichert")
                  } else {
                    downloadBlob(freshBlob, freshName)
                    markDone()
                    folderLostWarning(handle.name)
                  }
                } catch {
                  toast.error("Backup fehlgeschlagen")
                }
              },
            },
          })
        }
      } catch (e) {
        console.error("Automatisches Backup fehlgeschlagen:", e)
        showError("Automatisches Backup fehlgeschlagen. Bitte in den Einstellungen prüfen.")
      } finally {
        backupInProgress.current = false
      }
    }

    // Einstellungen aus dem Profil übernehmen (überlebt Port-/Browserwechsel und gelöschte Browserdaten)
    syncBackupSettingsFromProfile(profile)
    checkAndBackup() // immediate check on mount (catches missed backups)
    const interval = setInterval(checkAndBackup, 60_000) // re-check every minute
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
