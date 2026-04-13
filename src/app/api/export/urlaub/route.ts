import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import * as XLSX from "xlsx"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = Math.max(2000, Math.min(2100, parseInt(searchParams.get("year") ?? "") || new Date().getFullYear()))

  const [profileRes, vacationRes] = await Promise.all([
    supabase.from("users_profile").select("*").eq("user_id", user.id).single(),
    supabase
      .from("vacation_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("date_from", `${year}-01-01`)
      .lte("date_to", `${year}-12-31`)
      .order("date_from", { ascending: true }),
  ])

  const profile = profileRes.data
  const entries = vacationRes.data ?? []

  const typeLabels: Record<string, string> = {
    annual: "Jahresurlaub",
    special: "Sonderurlaub",
    training: "Ausbildung/Schulung",
    illness: "Krankheit",
  }

  const totalAnnual = entries.filter(e => e.type === "annual").reduce((s, e) => s + e.days, 0)
  const totalSpecial = entries.filter(e => e.type === "special").reduce((s, e) => s + e.days, 0)
  const totalTraining = entries.filter(e => e.type === "training").reduce((s, e) => s + e.days, 0)
  const totalIllness = entries.filter(e => e.type === "illness").reduce((s, e) => s + e.days, 0)
  const quota = profile?.vacation_quota ?? 30

  const data = [
    [`Urlaubsübersicht ${year}`],
    ["Mitarbeiter:", profile?.name ?? ""],
    ["Jahresurlaub gesamt:", quota],
    [],
    ["Zusammenfassung:"],
    ["Jahresurlaub genommen:", totalAnnual, "Resturlaub:", quota - totalAnnual],
    ["Sonderurlaub:", totalSpecial],
    ["Schulungen:", totalTraining],
    ["Krankheitstage:", totalIllness],
    [],
    ["Detailansicht:"],
    ["Art", "Von", "Bis", "Tage", "Notizen"],
    ...entries.map(e => [
      typeLabels[e.type] ?? e.type,
      new Date(e.date_from).toLocaleDateString("de-DE"),
      new Date(e.date_to).toLocaleDateString("de-DE"),
      e.days,
      e.notes ?? "",
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 30 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Urlaubsübersicht")

  const fileName = `Urlaub_${profile?.name?.replace(/\s/g, "_") ?? "Export"}_${year}.xlsx`
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  })
}
