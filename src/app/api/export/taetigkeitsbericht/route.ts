import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import * as XLSX from "xlsx"
import { toLocalDateStr } from "@/lib/utils"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = Math.max(2000, Math.min(2100, parseInt(searchParams.get("year") ?? "") || new Date().getFullYear()))
  const month = Math.max(1, Math.min(12, parseInt(searchParams.get("month") ?? "") || new Date().getMonth() + 1))

  const startDate = `${year}-${month.toString().padStart(2, "0")}-01`
  const endDate = toLocalDateStr(new Date(year, month, 0))

  const [profileRes, entriesRes] = await Promise.all([
    supabase.from("users_profile").select("*").eq("user_id", user.id).single(),
    supabase
      .from("time_entries")
      .select("*, client:clients(name, client_nr), project:projects(name, project_nr)")
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })
      .order("time_from", { ascending: true }),
  ])

  const profile = profileRes.data
  const entries = entriesRes.data ?? []

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  })

  // Build worksheet data
  const headerInfo = [
    ["Tätigkeitsbericht"],
    ["Mitarbeiter:", profile?.name ?? ""],
    ["Personal-Nr.:", profile?.personal_nr ?? ""],
    ["Monat / Jahr:", monthName],
    [],
  ]

  const tableHeader = [
    "Datum",
    "Von",
    "Bis",
    "Pause (Min)",
    "Kunde",
    "Kunden-Nr.",
    "Projekt",
    "Projekt-Nr.",
    "Code",
    "Beschreibung",
    "Remote",
    "Brutto-Std.",
    "Netto-Std.",
  ]

  const rows = entries.map((e) => {
    const client = e.client as { name: string; client_nr: string | null } | null
    const project = e.project as { name: string; project_nr: string | null } | null
    return [
      new Date(e.date).toLocaleDateString("de-DE"),
      e.time_from,
      e.time_to,
      e.break_min,
      client?.name ?? "",
      client?.client_nr ?? "",
      project?.name ?? "",
      project?.project_nr ?? "",
      e.code,
      e.description,
      e.remote ? "Ja" : "Nein",
      e.gross_h,
      e.net_h,
    ]
  })

  const totalNet = entries.reduce((s, e) => s + e.net_h, 0)
  const totalGross = entries.reduce((s, e) => s + e.gross_h, 0)

  const summaryRows = [
    [],
    ["", "", "", "", "", "", "", "", "", "", "Summe Brutto:", totalGross.toFixed(2)],
    ["", "", "", "", "", "", "", "", "", "", "Summe Netto:", totalNet.toFixed(2)],
  ]

  const byCode = ["BEV", "BENV", "RZV", "RZNV"].map((code) => {
    const h = entries.filter((e) => e.code === code).reduce((s, e) => s + e.net_h, 0)
    return ["", "", "", "", "", "", "", "", "", "", `${code}:`, h.toFixed(2)]
  })

  const allData = [
    ...headerInfo,
    tableHeader,
    ...rows,
    ...summaryRows,
    [],
    ["Stundenaufteilung nach Code:"],
    ...byCode,
  ]

  const ws = XLSX.utils.aoa_to_sheet(allData)

  // Column widths
  ws["!cols"] = [
    { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 12 },
    { wch: 25 }, { wch: 14 }, { wch: 8 }, { wch: 35 }, { wch: 8 }, { wch: 13 }, { wch: 12 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Tätigkeitsbericht")

  const fileName = `Taetigkeitsbericht_${profile?.name?.replace(/\s/g, "_") ?? "Export"}_${year}_${month.toString().padStart(2, "0")}.xlsx`
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  })
}
