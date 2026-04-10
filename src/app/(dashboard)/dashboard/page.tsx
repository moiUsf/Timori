import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Umbrella, TrendingUp, CalendarDays } from "lucide-react"
import { formatHours, formatMonthYear } from "@/lib/utils"
import { getHolidays } from "@/lib/holidays"
import type { GermanState } from "@/lib/holidays"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startOfMonth = `${year}-${month.toString().padStart(2, "0")}-01`
  const endOfMonth = new Date(year, month, 0).toISOString().slice(0, 10)

  const [profileRes, timeEntriesRes, vacationRes, activeTimersRes, overtimeRes] =
    await Promise.all([
      supabase.from("users_profile").select("*").eq("user_id", user.id).single(),
      supabase.from("time_entries").select("net_h, date, code").eq("user_id", user.id)
        .gte("date", startOfMonth).lte("date", endOfMonth),
      supabase.from("vacation_entries").select("days, type").eq("user_id", user.id)
        .gte("date_from", `${year}-01-01`).lte("date_to", `${year}-12-31`),
      supabase.from("active_timers").select("id").eq("user_id", user.id),
      supabase.from("overtime_records").select("buildup_h, reduction_h, carryover_h")
        .eq("user_id", user.id).eq("year", year),
    ])

  const profile = profileRes.data
  const entries = timeEntriesRes.data ?? []
  const vacations = vacationRes.data ?? []
  const activeTimerCount = activeTimersRes.data?.length ?? 0
  const overtimeMonths = overtimeRes.data ?? []

  // Calculate stats
  const totalNetHours = entries.reduce((sum, e) => sum + (e.net_h ?? 0), 0)
  const workingDaysInMonth = countWorkingDays(year, month)
  const targetHours = workingDaysInMonth * (profile?.working_hours_per_day ?? 8)
  const overtimeDiff = totalNetHours - targetHours

  const totalVacationTaken = vacations
    .filter((v) => v.type === "annual")
    .reduce((sum, v) => sum + v.days, 0)
  const vacationRemaining = (profile?.vacation_quota ?? 30) - totalVacationTaken

  const totalOvertime = overtimeMonths.reduce(
    (sum, m) => sum + m.buildup_h - m.reduction_h,
    0
  ) + (overtimeMonths[0]?.carryover_h ?? 0)

  // Upcoming holidays this month
  const holidays = getHolidays(year, (profile?.federal_state ?? "DE-NW") as GermanState)
  const upcomingHolidays = holidays
    .filter((h) => {
      const d = new Date(h.date)
      return d >= now && d.getMonth() + 1 === month
    })
    .slice(0, 3)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">{formatMonthYear(now)}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stunden diesen Monat</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(totalNetHours)}</div>
            <p className="text-xs text-muted-foreground">
              Ziel: {formatHours(targetHours)} ({workingDaysInMonth} AT)
            </p>
            <div className={`text-xs font-medium mt-1 ${overtimeDiff >= 0 ? "text-green-600" : "text-red-600"}`}>
              {overtimeDiff >= 0 ? "+" : ""}{formatHours(Math.abs(overtimeDiff))} {overtimeDiff >= 0 ? "Überstunden" : "Fehlstunden"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Überstunden gesamt</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalOvertime >= 0 ? "text-green-600" : "text-red-600"}`}>
              {totalOvertime >= 0 ? "+" : ""}{formatHours(Math.abs(totalOvertime))}
            </div>
            <p className="text-xs text-muted-foreground">Aktuelles Jahr</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resturlaub</CardTitle>
            <Umbrella className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vacationRemaining} Tage</div>
            <p className="text-xs text-muted-foreground">
              {totalVacationTaken} von {profile?.vacation_quota ?? 30} genommen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktive Timer</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTimerCount}</div>
            <p className="text-xs text-muted-foreground">
              {activeTimerCount === 0 ? "Kein Timer läuft" : `${activeTimerCount} Timer läuft`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-2 gap-4">
        {/* Stunden nach Code */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stunden nach Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["BEV", "BENV", "RZV", "RZNV"] as const).map((code) => {
              const h = entries.filter((e) => e.code === code).reduce((s, e) => s + e.net_h, 0)
              return (
                <div key={code} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{code}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {code === "BEV" ? "Beratung verr." : code === "BENV" ? "Beratung n.v." : code === "RZV" ? "Reisezeit verr." : "Reisezeit n.v."}
                    </span>
                  </div>
                  <span className="text-sm font-medium">{formatHours(h)}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Upcoming holidays */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Feiertage diesen Monat
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingHolidays.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine weiteren Feiertage</p>
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

function countWorkingDays(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}
