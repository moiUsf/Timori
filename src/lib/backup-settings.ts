"use client"

import { createClient } from "@/lib/supabase/client"
import type { UserProfile } from "@/types/database"

export type BackupSchedule = "never" | "daily" | "weekly" | "monthly"

export type BackupSettings = {
  schedule: BackupSchedule
  time: string
  lastBackupAt: string | null
}

/** Ab so vielen Tagen ohne Backup wird im Dashboard gewarnt */
export const BACKUP_STALE_AFTER_DAYS = 3

const KEY_SCHEDULE = "backupSchedule"
const KEY_TIME = "backupTime"
const KEY_LAST = "lastBackupAt"
const KEY_PENDING = "backupPendingSince"
export const KEY_FOLDER_NAME = "backupFolderName"

/** Wird gefeuert, nachdem die Einstellungen aus dem Profil in den localStorage übernommen wurden */
export const BACKUP_SETTINGS_SYNCED_EVENT = "timori:backup-settings-synced"

export function readBackupSettings(): BackupSettings {
  return {
    schedule: (localStorage.getItem(KEY_SCHEDULE) ?? "never") as BackupSchedule,
    time: localStorage.getItem(KEY_TIME) ?? "02:00",
    lastBackupAt: localStorage.getItem(KEY_LAST),
  }
}

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

/**
 * Gleicht localStorage mit den im Profil gespeicherten Werten ab.
 * Profil gewinnt für Zeitplan/Uhrzeit (Quelle der Wahrheit), beim letzten Backup zählt das spätere Datum.
 * Fehlen die Spalten (Migration 012 nicht eingespielt), bleibt localStorage unverändert.
 */
export function syncBackupSettingsFromProfile(profile: Partial<UserProfile> | null | undefined): BackupSettings {
  const local = readBackupSettings()
  const merged: BackupSettings = {
    schedule: profile?.backup_schedule ?? local.schedule,
    time: profile?.backup_time ?? local.time,
    lastBackupAt: laterIso(local.lastBackupAt, profile?.last_backup_at),
  }
  localStorage.setItem(KEY_SCHEDULE, merged.schedule)
  localStorage.setItem(KEY_TIME, merged.time)
  if (merged.lastBackupAt) localStorage.setItem(KEY_LAST, merged.lastBackupAt)

  // Profil nachziehen, falls dort noch ältere/keine Werte stehen (z. B. erste Nutzung nach Migration)
  if (profile?.user_id && profile.backup_schedule !== undefined) {
    const patch: Record<string, unknown> = {}
    if (merged.lastBackupAt && merged.lastBackupAt !== profile.last_backup_at) patch.last_backup_at = merged.lastBackupAt
    if (Object.keys(patch).length > 0) void persist(profile.user_id, patch)
  }
  window.dispatchEvent(new CustomEvent(BACKUP_SETTINGS_SYNCED_EVENT))
  return merged
}

async function persist(userId: string, patch: Record<string, unknown>) {
  try {
    const { error } = await createClient().from("users_profile").update(patch).eq("user_id", userId)
    if (error) console.warn("Backup-Einstellungen konnten nicht im Profil gespeichert werden:", error.message)
  } catch (e) {
    console.warn("Backup-Einstellungen konnten nicht im Profil gespeichert werden:", e)
  }
}

export function saveBackupSchedule(userId: string | null | undefined, schedule: BackupSchedule) {
  localStorage.setItem(KEY_SCHEDULE, schedule)
  if (userId) void persist(userId, { backup_schedule: schedule })
}

export function saveBackupTime(userId: string | null | undefined, time: string) {
  localStorage.setItem(KEY_TIME, time)
  if (userId) void persist(userId, { backup_time: time })
}

/** Erfolgreiches Backup festhalten (localStorage + Profil) und andere Komponenten informieren. */
export function recordBackupDone(userId: string | null | undefined): string {
  const iso = new Date().toISOString()
  localStorage.setItem(KEY_LAST, iso)
  localStorage.removeItem(KEY_PENDING)
  if (userId) void persist(userId, { last_backup_at: iso })
  window.dispatchEvent(new CustomEvent("timori:backup-done", { detail: { at: iso } }))
  return iso
}

export function isBackupStale(lastBackupAt: string | null, days = BACKUP_STALE_AFTER_DAYS): boolean {
  if (!lastBackupAt) return true
  return Date.now() - new Date(lastBackupAt).getTime() > days * 86_400_000
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}
