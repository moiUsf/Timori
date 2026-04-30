"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, Umbrella, TrendingUp, CalendarDays, Download, X, Palmtree } from "lucide-react"
import { formatHours, formatMonthYear, toLocalDateStr } from "@/lib/utils"
import { getHolidays } from "@/lib/holidays"
import type { GermanState } from "@/lib/holidays"
import type { Client, UserProfile, VacationEntry } from "@/types/database"
import { isBackupDue, downloadBlob, loadHandleFromIDB } from "@/lib/backup-idb"
import { toast } from "sonner"

type ClientStat = {
  client: Client
  consumed_h: number
  booked_h: number
  remaining_h: number
  pct: number
  period_label: string
}

function countWorkingDays(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

export default function DashboardPage() {
  const supabase = createClient()
  const t = useTranslations("dashboard")
  const tVac = useTranslations("vacation")
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startOfMonth = `${year}-${month.toString().padStart(2, "0")}-01`
  const endOfMonth = toLocalDateStr(new Date(year, month, 0))

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [clientStats, setClientStats] = useState<ClientStat[]>([])
  const [totalNetHours, setTotalNetHours] = useState(0)
  const [activeTimerCount, setActiveTimerCount] = useState(0)
  const [vacationRemaining, setVacationRemaining] = useState(0)
  const [totalVacationTaken, setTotalVacationTaken] = useState(0)
  const [totalOvertime, setTotalOvertime] = useState(0)
  const [upcomingHolidays, setUpcomingHolidays] = useState<{ date: string; name: string }[]>([])
  const [vacationThisMonth, setVacationThisMonth] = useState<VacationEntry[]>([])
  const [userId, setUserId] = useState("")
  const [backupReminder, setBackupReminder] = useState(false)
  const [backupExporting, setBackupExporting] = useState(false)

  const loadData = useCallback(async (uid: string) => {
    const [profileRes, entriesRes, vacationRes, activeRes, overtimeRes, clientsRes] = await Promise.all([
      supabase.from("users_profile").select("*").eq("user_id", uid).single(),
      supabase.from("time_entries").select("net_h, client_id").eq("user_id", uid)
        .gte("date", startOfMonth).lte("date", endOfMonth),
      supabase.from("vacation_entries").select("*").eq("user_id", uid)
        .gte("date_from", `${year}-01-01`).lte("date_to", `${year}-12-31`),
      supabase.from("active_timers").select("id").eq("user_id", uid),
      supabase.from("overtime_records").select("buildup_h, reduction_h, carryover_h")
        .eq("user_id", uid).eq("year", year),
      supabase.from("clients").select("*").eq("user_id", uid).eq("active", true).order("name"),
    ])

    const prof = profileRes.data as UserProfile | null
    const entries = entriesRes.data ?? []
    const vacations = vacationRes.data ?? []
    const overtimeMonths = overtimeRes.data ?? []
    const clients = (clientsRes.data ?? []) as Client[]
    const hoursPerDay = prof?.working_hours_per_day ?? 8

    setProfile(prof)
    setActiveTimerCount(activeRes.data?.length ?? 0)

    const totalH = entries.reduce((s, e) => s + (e.net_h ?? 0), 0)
    setTotalNetHours(totalH)

    const vacTaken = vacations.filter(v => v.type === "annual").reduce((s, v) => s + v.days, 0)
    setTotalVacationTaken(vacTaken)
    setVacationRemaining((prof?.vacation_quota ?? 30) - vacTaken)
    setVacationThisMonth(
      (vacations as VacationEntry[]).filter(v => v.date_from <= endOfMonth && v.date_to >= startOfMonth)
        .sort((a, b) => a.date_from.localeCompare(b.date_from))
    )

    const ot = overtimeMonths.reduce((s, m) => s + m.buildup_h - m.reduction_h, 0) + (overtimeMonths[0]?.carryover_h ?? 0)
    setTotalOvertime(ot)

    const monthHoursByClient: Record<string, number> = {}
    entries.forEach(e => {
      if (e.client_id) monthHoursByClient[e.client_id] = (monthHoursByClient[e.client_id] ?? 0) + (e.net_h ?? 0)
    })

    const fmtMT = (h: number) => `${(h / hoursPerDay).toFixed(1)} MT`
    const fmtBudget = (h: number, unit: "h" | "MT" | null) =>
      unit === "MT" ? fmtMT(h) : `${h.toFixed(1)} h`

    const candidates = clients.filter(c =>
      (monthHoursByClient[c.id] ?? 0) > 0 ||
      (c.budget_h != null && c.budget_h > 0)
    )

    const stats: ClientStat[] = await Promise.all(candidates.map(async (c) => {
      const hasBudget = c.budget_h != null && c.budget_h > 0
      const period = c.budget_period ?? "monthly"

      let consumed_h = 0
      let booked_h = 0
      let period_label = ""

      if (!hasBudget) {
        consumed_h = monthHoursByClient[c.id] ?? 0
        period_label = "Dieser Monat"
      } else if (period === "monthly") {
        booked_h = c.budget_h!
        if (c.budget_carry_over) {
          const { data } = await supabase.from("time_entries")
            .select("date, net_h").eq("user_id", uid).eq("client_id", c.id)
            .lte("date", endOfMonth)
          const byMonth: Record<string, number> = {}
          for (const row of (data ?? []) as { date: string; net_h: number }[]) {
            const key = row.date.slice(0, 7)
            byMonth[key] = (byMonth[key] ?? 0) + row.net_h
          }
          const currentKey = startOfMonth.slice(0, 7)
          let carry = 0
          for (const m of Object.keys(byMonth).sort()) {
            if (m >= currentKey) break
            carry = Math.max(0, c.budget_h! + carry - byMonth[m])
          }
          consumed_h = byMonth[currentKey] ?? 0
          booked_h = c.budget_h! + carry
          period_label = `Monatlich · ${fmtBudget(c.budget_h!, c.budget_unit)}${carry > 0 ? " · Übertrag" : ""}`
        } else {
          consumed_h = monthHoursByClient[c.id] ?? 0
          period_label = `Monatlich · ${fmtBudget(c.budget_h!, c.budget_unit)}`
        }
      } else if (period === "range") {
        booked_h = c.budget_h!
        const from = c.budget_date_from ?? startOfMonth
        const to = c.budget_date_to ?? endOfMonth
        const { data } = await supabase.from("time_entries")
          .select("net_h").eq("user_id", uid).eq("client_id", c.id)
          .gte("date", from).lte("date", to)
        consumed_h = ((data ?? []) as { net_h: number }[]).reduce((s, r) => s + r.net_h, 0)
        const fmtDate = (d: string) => d.slice(5).split("-").reverse().join(".") + "." + d.slice(0, 4)
        period_label = `${fmtDate(from)} – ${fmtDate(to)} · ${fmtBudget(c.budget_h!, c.budget_unit)}`
      } else {
        booked_h = c.budget_h!
        const { data } = await supabase.from("time_entries")
          .select("net_h").eq("user_id", uid).eq("client_id", c.id)
        consumed_h = ((data ?? []) as { net_h: number }[]).reduce((s, r) => s + r.net_h, 0)
        period_label = `Gesamt · ${fmtBudget(c.budget_h!, c.budget_unit)}`
      }

      const remaining_h = booked_h - consumed_h
      const pct = booked_h > 0 ? Math.min(100, (consumed_h / booked_h) * 100) : 0
      return { client: c, consumed_h, booked_h, remaining_h, pct, period_label }
    }))

    stats.sort((a, b) => b.consumed_h - a.consumed_h)
    setClientStats(stats)

    const holidays = getHolidays(year, (prof?.federal_state ?? "DE-NW") as GermanState)
    const monthHolidays = holidays.filter(h => {
      const d = new Date(h.date)
      return d.getMonth() + 1 === month && d.getFullYear() === year
    })
    setUpcomingHolidays(monthHolidays)
  }, [supabase, startOfMonth, endOfMonth, year])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); loadData(user.id) }
    })
    const schedule = (localStorage.getItem("backupSchedule") ?? "never") as "never"|"daily"|"weekly"|"monthly"
    const last = localStorage.getItem("lastBackupAt")
    const time = localStorage.getItem("backupTime") ?? "02:00"
    if (isBackupDue(schedule, last, time)) setBackupReminder(true)

    const onBackupDone = () => setBackupReminder(false)
    window.addEventListener("timori:backup-done", onBackupDone)
    return () => window.removeEventListener("timori:backup-done", onBackupDone)
  }, [supabase, loadData])

  useEffect(() => {
    if (!userId) return
    const reload = () =>
      supabase.from("active_timers").select("id").eq("user_id", userId)
        .then(({ data }) => setActiveTimerCount(data?.length ?? 0))

    const channel = supabase
      .channel("dashboard_active_timers")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_timers" }, reload)
      .subscribe()

    window.addEventListener("timori:timer-started", reload)
    window.addEventListener("timori:timer-stopped", reload)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener("timori:timer-started", reload)
      window.removeEventListener("timori:timer-stopped", reload)
    }
  }, [supabase, userId])

  async function handleBackupNow() {
    setBackupExporting(true)
    try {
      const res = await fetch("/api/backup/export")
      if (!res.ok) throw new Error()
      const json = await res.json()
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
      const now2 = new Date()
      const pad = (n: number) => String(n).padStart(2, "0")
      const ts = `${now2.getFullYear()}-${pad(now2.getMonth()+1)}-${pad(now2.getDate())}_${pad(now2.getHours())}-${pad(now2.getMinutes())}`
      const filename = `timori-backup-${ts}.json`

      const handle = await loadHandleFromIDB()
      if (handle) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const h = handle as any
          let perm = await h.queryPermission?.({ mode: "readwrite" }) ?? "prompt"
          if (perm !== "granted") perm = await h.requestPermission?.({ mode: "readwrite" }) ?? "denied"
          if (perm === "granted") {
            const fileHandle = await handle.getFileHandle(filename, { create: true })
            const writable = await fileHandle.createWritable()
            await writable.write(blob)
            await writable.close()
            toast.success(`Backup gespeichert in „${handle.name}"`)
          } else {
            downloadBlob(blob, filename)
            toast.info("Ordnerzugriff verweigert — Backup als Download gespeichert")
          }
        } catch {
          downloadBlob(blob, filename)
          toast.info("Ordner nicht erreichbar — Backup als Download gespeichert")
        }
      } else {
        downloadBlob(blob, filename)
      }

      const iso = new Date().toISOString()
      localStorage.setItem("lastBackupAt", iso)
      localStorage.removeItem("backupPendingSince")
      setBackupReminder(false)
    } catch {
      toast.error("Backup fehlgeschlagen")
    } finally {
      setBackupExporting(false)
    }
  }

  const workingDaysInMonth = countWorkingDays(year, month)
  const targetHours = workingDaysInMonth * (profile?.working_hours_per_day ?? 8)
  const overtimeDiff = totalNetHours - targetHours

  const todayStr = `${year}-${month.toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`

  const vacTypeLabel: Record<string, string> = {
    annual: tVac("types.annual"),
    special: tVac("types.special"),
    training: tVac("types.training"),
    illness: tVac("types.illness"),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{formatMonthYear(now)}</p>
      </div>

      {/* Backup reminder */}
      {backupReminder && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <Download className="h-4 w-4 shrink-0" />
          <span className="flex-1">Dein automatisches Backup wurde verpasst. Möchtest du jetzt ein Backup erstellen?</span>
          <button
            onClick={handleBackupNow}
            disabled={backupExporting}
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {backupExporting ? "Wird erstellt…" : "Jetzt erstellen"}
          </button>
          <button onClick={() => setBackupReminder(false)} className="shrink-0 text-amber-600 hover:text-amber-900 dark:hover:text-amber-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("hoursThisMonth")}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(totalNetHours)}</div>
            <p className="text-xs text-muted-foreground">
              {t("hoursTarget", { target: formatHours(targetHours), days: workingDaysInMonth })}
            </p>
            {overtimeDiff >= 0 && (
              <div className="text-xs font-medium mt-1 text-green-600">
                +{formatHours(overtimeDiff)} {t("overtime")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("totalOvertime")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalOvertime >= 0 ? "text-green-600" : "text-red-600"}`}>
              {totalOvertime >= 0 ? "+" : ""}{formatHours(Math.abs(totalOvertime))}
            </div>
            <p className="text-xs text-muted-foreground">{t("currentYear")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("remainingVacation")}</CardTitle>
            <Umbrella className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vacationRemaining} {t("bookedDaysUnit")}</div>
            <p className="text-xs text-muted-foreground">
              {t("vacationTaken", { taken: totalVacationTaken, quota: profile?.vacation_quota ?? 30 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("activeTimers")}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTimerCount}</div>
            <p className="text-xs text-muted-foreground">
              {activeTimerCount === 0 ? t("noTimerRunning") : t("timersRunning", { count: activeTimerCount })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Client utilization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("clientUtilization", { month: formatMonthYear(now) })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-7">
            {clientStats.length === 0 ? (
              <p className="text-[13px] text-neutral-500">{t("noUtilization")}</p>
            ) : clientStats.map(({ client, consumed_h, booked_h, remaining_h, pct }) => {
              const remainingPct = Math.max(0, 100 - pct)
              const tone =
                remainingPct < 10 ? "text-red-600 dark:text-red-400"
                : remainingPct < 30 ? "text-amber-600 dark:text-amber-400"
                : ""
              const barFill =
                remainingPct < 10 ? "bg-red-500"
                : remainingPct < 30 ? "bg-amber-400"
                : "bg-primary"
              return (
                <div key={client.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm truncate">{client.name}</span>
                    {booked_h > 0 && (
                      <span className={`text-sm tabular-nums shrink-0 ${tone}`}>
                        {t("hoursOf", { consumed: formatHours(consumed_h), booked: formatHours(booked_h) })}
                      </span>
                    )}
                  </div>

                  {booked_h > 0 ? (
                    <>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barFill}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className={`text-[13px] ${tone || "text-neutral-500"}`}>
                        {remaining_h >= 0
                          ? t("remaining", { h: formatHours(remaining_h), pct: Math.round(remainingPct) })
                          : t("overdrawn", { h: formatHours(Math.abs(remaining_h)) })}
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] text-neutral-500">
                      {t("workedNoUtilization", { h: formatHours(consumed_h) })}
                    </p>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Upcoming holidays + vacation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {t("holidaysThisMonth")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingHolidays.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noHolidays")}</p>
            ) : (
              <div className="space-y-2">
                {upcomingHolidays.map((h) => {
                  const past = h.date < todayStr
                  return (
                    <div key={h.date} className={`flex items-center justify-between ${past ? "opacity-40" : ""}`}>
                      <span className="text-sm">{h.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {vacationThisMonth.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Palmtree className="h-3.5 w-3.5" />
                  {tVac("title")}
                </p>
                {vacationThisMonth.map((v) => {
                  const past = v.date_to < todayStr
                  const from = v.date_from.slice(5).split("-").reverse().join(".")
                  const to = v.date_to.slice(5).split("-").reverse().join(".")
                  return (
                    <div key={v.id} className={`flex items-center justify-between ${past ? "opacity-40" : ""}`}>
                      <span className="text-sm">{vacTypeLabel[v.type] ?? v.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {from === to ? from : `${from} – ${to}`} · {v.days} {tVac("workdays")}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
