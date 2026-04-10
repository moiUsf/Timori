import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import * as XLSX from "xlsx"

const CATEGORY_LABELS: Record<string, string> = {
  hotel_inland: "Hotel Inland", hotel_ausland: "Hotel Ausland",
  flug_inland: "Flug Inland", flug_ausland: "Flug Ausland",
  bahn_inland: "Bahn Inland", bahn_ausland: "Bahn Ausland",
  taxi_inland: "Taxi Inland", taxi_ausland: "Taxi Ausland",
  privat_pkw: "Privater PKW", mietwagen: "Mietwagen", vma: "VMA",
  internet: "Internetkosten", porto: "Porto", burobedarf: "Bürobedarf",
  fortbildung: "Fortbildung", bewirtung: "Bewirtung", sonstiges: "Sonstiges",
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1))

  const [profileRes, reportRes] = await Promise.all([
    supabase.from("users_profile").select("*").eq("user_id", user.id).single(),
    supabase.from("expense_reports").select("*, items:expense_items(*)")
      .eq("user_id", user.id).eq("year", year).eq("month", month).single(),
  ])

  const profile = profileRes.data
  const report = reportRes.data
  const items = (report?.items ?? []) as Array<{
    date: string; category: string; description: string;
    amount: number; km: number | null; receipt_count: number
  }>

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" })
  const total = items.reduce((s, i) => s + i.amount, 0)

  const data = [
    [`Spesenabrechnung ${monthName}`],
    ["Mitarbeiter:", profile?.name ?? ""],
    ["Personal-Nr.:", profile?.personal_nr ?? ""],
    report?.travel_nr ? ["Reisenummer:", report.travel_nr] : [],
    [],
    ["Datum", "Kategorie", "Beschreibung", "km", "Belege", "Betrag (€)"],
    ...items.map(i => [
      new Date(i.date).toLocaleDateString("de-DE"),
      CATEGORY_LABELS[i.category] ?? i.category,
      i.description,
      i.km ?? "",
      i.receipt_count,
      i.amount.toFixed(2),
    ]),
    [],
    ["", "", "", "", "Gesamtbetrag:", total.toFixed(2)],
    [],
    ["Unterschrift Mitarbeiter/in:", "___________________________"],
    ["Datum:", new Date().toLocaleDateString("de-DE")],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 35 }, { wch: 8 }, { wch: 8 }, { wch: 12 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Spesenabrechnung")

  const fileName = `Spesen_${profile?.name?.replace(/\s/g, "_") ?? "Export"}_${year}_${month.toString().padStart(2, "0")}.xlsx`
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  })
}
