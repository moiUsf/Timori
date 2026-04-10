import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import * as XLSX from "xlsx"

const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"]

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()))

  const [profileRes, entriesRes, overtimeRes] = await Promise.all([
    supabase.from("users_profile").select("*").eq("user_id", user.id).single(),
    supabase.from("time_entries").select("net_h, date").eq("user_id", user.id)
      .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
    supabase.from("overtime_records").select("*").eq("user_id", user.id).eq("year", year),
  ])

  const profile = profileRes.data
  const entries = entriesRes.data ?? []
  const overtimeRecords = overtimeRes.data ?? []
  const hoursPerDay = profile?.working_hours_per_day ?? 8

  const monthRows = MONTH_NAMES.map((name, i) => {
    const m = i + 1
    const monthStr = `${year}-${m.toString().padStart(2, "0")}`
    const actual = entries.filter(e => e.date.startsWith(monthStr)).reduce((s, e) => s + e.net_h, 0)
    const wd = countWorkingDays(year, m)
    const target = wd * hoursPerDay
    const diff = actual - target
    const record = overtimeRecords.find(r => r.month === m)
    const reduction = record?.reduction_h ?? 0
    const net = diff - reduction
    return [name, wd, target.toFixed(2), actual.toFixed(2), diff.toFixed(2), reduction.toFixed(2), net.toFixed(2)]
  })

  const totalNet = monthRows.reduce((s, r) => s + parseFloat(r[6] as string), 0)

  const data = [
    [`Überstundenübersicht ${year}`],
    ["Mitarbeiter:", profile?.name ?? ""],
    ["Soll-Stunden/Tag:", hoursPerDay],
    [],
    ["Monat", "Arbeitstage", "Soll-Std.", "Ist-Std.", "Aufbau/Abbau", "Manueller Abbau", "Saldo"],
    ...monthRows,
    [],
    ["", "", "", "", "", "Gesamtsaldo:", totalNet.toFixed(2)],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 10 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Überstunden")

  const fileName = `Ueberstunden_${profile?.name?.replace(/\s/g, "_") ?? "Export"}_${year}.xlsx`
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  })
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
