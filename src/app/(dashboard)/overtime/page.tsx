import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatHours } from "@/lib/utils"

const MONTH_NAMES = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

export default async function OvertimePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const year = new Date().getFullYear()

  const [profileRes, timeEntriesRes, overtimeRes] = await Promise.all([
    supabase.from("users_profile").select("*").eq("user_id", user.id).single(),
    supabase.from("time_entries").select("net_h, date").eq("user_id", user.id)
      .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
    supabase.from("overtime_records").select("*").eq("user_id", user.id).eq("year", year),
  ])

  const profile = profileRes.data
  const entries = timeEntriesRes.data ?? []
  const overtimeRecords = overtimeRes.data ?? []

  const hoursPerDay = profile?.working_hours_per_day ?? 8

  // Build monthly data
  const monthlyData = MONTH_NAMES.map((name, i) => {
    const m = i + 1
    const monthStr = `${year}-${m.toString().padStart(2, "0")}`
    const monthEntries = entries.filter((e) => e.date.startsWith(monthStr))
    const actualHours = monthEntries.reduce((s, e) => s + e.net_h, 0)
    const workingDays = countWorkingDays(year, m)
    const targetHours = workingDays * hoursPerDay
    const diff = actualHours - targetHours
    const record = overtimeRecords.find((r) => r.month === m)
    const manualReduction = record?.reduction_h ?? 0
    return { name, m, actualHours, targetHours, diff, workingDays, manualReduction }
  })

  const currentMonth = new Date().getMonth() // 0-based
  const totalAccumulated = monthlyData.slice(0, currentMonth + 1).reduce((s, m) => s + m.diff - m.manualReduction, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Überstunden</h1>
        <p className="text-muted-foreground">Jahr {year} — Basis: {hoursPerDay}h/Tag</p>
      </div>

      {/* Total balance */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Gesamtsaldo {year}</p>
              <div className={`text-4xl font-bold mt-1 ${totalAccumulated >= 0 ? "text-green-600" : "text-red-600"}`}>
                {totalAccumulated >= 0 ? "+" : ""}{formatHours(Math.abs(totalAccumulated))}
              </div>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-muted-foreground">
                Sollstunden: {formatHours(monthlyData.slice(0, currentMonth + 1).reduce((s, m) => s + m.targetHours, 0))}
              </p>
              <p className="text-xs text-muted-foreground">
                Iststunden: {formatHours(monthlyData.slice(0, currentMonth + 1).reduce((s, m) => s + m.actualHours, 0))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monatliche Übersicht</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Monat</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Soll</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Ist</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Aufbau</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Abbau</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((row, i) => {
                  const isFuture = i > currentMonth
                  const net = row.diff - row.manualReduction
                  return (
                    <tr key={row.name} className={`border-b last:border-0 ${isFuture ? "opacity-40" : ""} ${i === currentMonth ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{row.name}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{formatHours(row.targetHours)}</td>
                      <td className="px-4 py-2.5 text-right">{formatHours(row.actualHours)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${row.diff > 0 ? "text-green-600" : row.diff < 0 ? "text-red-600" : ""}`}>
                        {row.diff > 0 ? `+${formatHours(row.diff)}` : row.diff < 0 ? `-${formatHours(Math.abs(row.diff))}` : "–"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {row.manualReduction > 0 ? `-${formatHours(row.manualReduction)}` : "–"}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {net >= 0 ? "+" : ""}{formatHours(net)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
