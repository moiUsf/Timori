"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Clock, Umbrella, TrendingUp, CalendarDays, Pencil, Check } from "lucide-react"
import { formatHours, formatMonthYear } from "@/lib/utils"
import { getHolidays } from "@/lib/holidays"
import type { GermanState } from "@/lib/holidays"
import type { Client, UserProfile } from "@/types/database"

type ClientWithBooking = Client & { monthly_booked_days: number }

type ClientStat = {
  client: ClientWithBooking
  consumed_h: number
  booked_h: number
  remaining_h: number
  pct: number
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
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startOfMonth = `${year}-${month.toString().padStart(2, "0")}-01`
  const endOfMonth = new Date(year, month, 0).toISOString().slice(0, 10)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [clientStats, setClientStats] = useState<ClientStat[]>([])
  const [totalNetHours, setTotalNetHours] = useState(0)
  const [activeTimerCount, setActiveTimerCount] = useState(0)
  const [vacationRemaining, setVacationRemaining] = useState(0)
  const [totalVacationTaken, setTotalVacationTaken] = useState(0)
  const [totalOvertime, setTotalOvertime] = useState(0)
  const [upcomingHolidays, setUpcomingHolidays] = useState<{ date: string; name: string }[]>([])
  const [userId, setUserId] = useState("")
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState("")

  const loadData = useCallback(async (uid: string) => {
    const [profileRes, entriesRes, vacationRes, activeRes, overtimeRes, clientsRes] = await Promise.all([
      supabase.from("users_profile").select("*").eq("user_id", uid).single(),
      supabase.from("time_entries").select("net_h, client_id").eq("user_id", uid)
        .gte("date", startOfMonth).lte("date", endOfMonth),
      supabase.from("vacation_entries").select("days, type").eq("user_id", uid)
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
    const clients = (clientsRes.data ?? []) as ClientWithBooking[]
    const hoursPerDay = prof?.working_hours_per_day ?? 8

    setProfile(prof)
    setActiveTimerCount(activeRes.data?.length ?? 0)

    const totalH = entries.reduce((s, e) => s + (e.net_h ?? 0), 0)
    setTotalNetHours(totalH)

    const vacTaken = vacations.filter(v => v.type === "annual").reduce((s, v) => s + v.days, 0)
    setTotalVacationTaken(vacTaken)
    setVacationRemaining((prof?.vacation_quota ?? 30) - vacTaken)

    const ot = overtimeMonths.reduce((s, m) => s + m.buildup_h - m.reduction_h, 0) + (overtimeMonths[0]?.carryover_h ?? 0)
    setTotalOvertime(ot)

    const hoursByClient: Record<string, number> = {}
    entries.forEach(e => {
      if (e.client_id) hoursByClient[e.client_id] = (hoursByClient[e.client_id] ?? 0) + (e.net_h ?? 0)
    })

    const stats: ClientStat[] = clients
      .filter(c => (hoursByClient[c.id] ?? 0) > 0 || (c.monthly_booked_days ?? 0) > 0)
      .map(c => {
        const consumed_h = hoursByClient[c.id] ?? 0
        const booked_h = (c.monthly_booked_days ?? 0) * hoursPerDay
        const remaining_h = booked_h - consumed_h
        const pct = booked_h > 0 ? Math.min(100, (consumed_h / booked_h) * 100) : 0
        return { client: c, consumed_h, booked_h, remaining_h, pct }
      })
      .sort((a, b) => b.consumed_h - a.consumed_h)

    setClientStats(stats)

    const holidays = getHolidays(year, (prof?.federal_state ?? "DE-NW") as GermanState)
    const upcoming = holidays
      .filter(h => { const d = new Date(h.date); return d >= now && d.getMonth() + 1 === month })
      .slice(0, 3)
    setUpcomingHolidays(upcoming)
  }, [supabase, startOfMonth, endOfMonth, year])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); loadData(user.id) }
    })
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

  async function saveBookedDays(clientId: string, days: number) {
    const value = isNaN(days) || days < 0 ? 0 : days
    await supabase.from("clients").update({ monthly_booked_days: value }).eq("id", clientId)
    setEditingClientId(null)
    if (userId) loadData(userId)
  }

  const workingDaysInMonth = countWorkingDays(year, month)
  const targetHours = workingDaysInMonth * (profile?.working_hours_per_day ?? 8)
  const overtimeDiff = totalNetHours - targetHours

  function barColor(pct: number) {
    if (pct >= 100) return "bg-red-500"
    if (pct >= 75) return "bg-amber-400"
    return "bg-primary"
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{formatMonthYear(now)}</p>
      </div>

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
            <div className={`text-xs font-medium mt-1 ${overtimeDiff >= 0 ? "text-green-600" : "text-red-600"}`}>
              {overtimeDiff >= 0 ? "+" : ""}{formatHours(Math.abs(overtimeDiff))}{" "}
              {overtimeDiff >= 0 ? t("overtime") : t("shortfall")}
            </div>
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
          <CardContent className="space-y-5">
            {clientStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noUtilization")}</p>
            ) : clientStats.map(({ client, consumed_h, booked_h, remaining_h, pct }) => (
              <div key={client.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{client.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {editingClientId === client.id ? (
                      <>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveBookedDays(client.id, parseFloat(editingValue))
                            if (e.key === "Escape") setEditingClientId(null)
                          }}
                          autoFocus
                          className="w-20 h-6 text-xs px-2"
                        />
                        <span className="text-xs text-muted-foreground">{t("bookedDaysUnit")}</span>
                        <button
                          onClick={() => saveBookedDays(client.id, parseFloat(editingValue))}
                          className="text-green-600 hover:text-green-700">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setEditingClientId(client.id); setEditingValue(String(client.monthly_booked_days ?? 0)) }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                        <span className="font-mono">{client.monthly_booked_days ?? 0} {t("bookedDaysUnit")}</span>
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>
                </div>

                {booked_h > 0 ? (
                  <>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("hoursOf", { consumed: formatHours(consumed_h), booked: formatHours(booked_h) })}</span>
                      <span className={remaining_h < 0 ? "text-red-600 font-medium" : remaining_h === 0 ? "text-amber-600 font-medium" : ""}>
                        {remaining_h >= 0
                          ? t("remaining", { h: formatHours(remaining_h) })
                          : t("overdrawn", { h: formatHours(Math.abs(remaining_h)) })}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("workedNoUtilization", { h: formatHours(consumed_h) })}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming holidays */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {t("holidaysThisMonth")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingHolidays.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noHolidays")}</p>
            ) : (
              <div className="space-y-2">
                {upcomingHolidays.map((h) => (
                  <div key={h.date} className="flex items-center justify-between">
                    <span className="text-sm">{h.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
