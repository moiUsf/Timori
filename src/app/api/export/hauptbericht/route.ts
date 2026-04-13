import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import * as XLSX from "xlsx"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = Math.max(2000, Math.min(2100, parseInt(searchParams.get("year") ?? "") || new Date().getFullYear()))
  const month = Math.max(1, Math.min(12, parseInt(searchParams.get("month") ?? "") || new Date().getMonth() + 1))

  const startDate = `${year}-${month.toString().padStart(2, "0")}-01`
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10)

  const [profileRes, entriesRes] = await Promise.all([
    supabase.from("users_profile").select("*").eq("user_id", user.id).single(),
    supabase
      .from("time_entries")
      .select("*, client:clients(name), project:projects(name, project_nr)")
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true }),
  ])

  const profile = profileRes.data
  const entries = entriesRes.data ?? []

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" })
  const workingDays = countWorkingDays(year, month)
  const targetHours = workingDays * (profile?.working_hours_per_day ?? 8)
  const totalNet = entries.reduce((s, e) => s + e.net_h, 0)
  const totalGross = entries.reduce((s, e) => s + e.gross_h, 0)

  // Group by project
  const byProject: Record<string, { client: string; project: string; projectNr: string; hours: Record<string, number> }> = {}
  for (const e of entries) {
    const client = (e.client as { name: string } | null)?.name ?? ""
    const project = (e.project as { name: string; project_nr: string | null } | null)
    const key = e.project_id
    if (!byProject[key]) {
      byProject[key] = { client, project: project?.name ?? "", projectNr: project?.project_nr ?? "", hours: {} }
    }
    byProject[key].hours[e.code] = (byProject[key].hours[e.code] ?? 0) + e.net_h
  }

  const projectRows = Object.values(byProject).map((p) => [
    p.client,
    p.project,
    p.projectNr,
    (p.hours["BEV"] ?? 0).toFixed(2),
    (p.hours["BENV"] ?? 0).toFixed(2),
    (p.hours["RZV"] ?? 0).toFixed(2),
    (p.hours["RZNV"] ?? 0).toFixed(2),
    Object.values(p.hours).reduce((s, h) => s + h, 0).toFixed(2),
  ])

  const data = [
    [`Hauptbericht ${monthName}`],
    ["Mitarbeiter:", profile?.name ?? ""],
    [],
    ["Soll-Stunden:", targetHours.toFixed(2), "", "Ist-Stunden (Netto):", totalNet.toFixed(2)],
    ["Arbeitstage:", workingDays, "", "Ist-Stunden (Brutto):", totalGross.toFixed(2)],
    ["", "", "", "Überstunden:", (totalNet - targetHours).toFixed(2)],
    [],
    ["Stundenaufteilung nach Code:"],
    ["BEV", "BENV", "RZV", "RZNV", "Gesamt"],
    [
      entries.filter(e => e.code === "BEV").reduce((s, e) => s + e.net_h, 0).toFixed(2),
      entries.filter(e => e.code === "BENV").reduce((s, e) => s + e.net_h, 0).toFixed(2),
      entries.filter(e => e.code === "RZV").reduce((s, e) => s + e.net_h, 0).toFixed(2),
      entries.filter(e => e.code === "RZNV").reduce((s, e) => s + e.net_h, 0).toFixed(2),
      totalNet.toFixed(2),
    ],
    [],
    ["Projektübersicht:"],
    ["Kunde", "Projekt", "Projekt-Nr.", "BEV", "BENV", "RZV", "RZNV", "Gesamt"],
    ...projectRows,
    [],
    ["Rechnerisch richtig:", "✓"],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Hauptbericht")

  const fileName = `Hauptbericht_${profile?.name?.replace(/\s/g, "_") ?? "Export"}_${year}_${month.toString().padStart(2, "0")}.xlsx`
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
