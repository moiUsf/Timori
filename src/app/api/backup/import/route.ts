import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const contentLength = request.headers.get("content-length")
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 })
  }

  const body = await request.json()
  if (!body?.version || !body?.data) {
    return NextResponse.json({ error: "Invalid backup file" }, { status: 400 })
  }

  const uid = user.id
  const d = body.data

  const withUid = <T extends object>(rows: T[]) =>
    rows.map(r => ({ ...r, user_id: uid }))

  const errors: string[] = []

  const upsert = async (table: string, rows: object[], conflict = "id") => {
    if (!rows?.length) return
    const { error } = await supabase.from(table).upsert(rows, { onConflict: conflict })
    if (error) errors.push(`${table}: ${error.message}`)
  }

  // Order respects FK dependencies
  await upsert("clients", withUid(d.clients ?? []))
  await upsert("projects", withUid(d.projects ?? []))
  await upsert("booking_items", withUid(d.booking_items ?? []))
  await upsert("tasks", withUid(d.tasks ?? []))
  await upsert("time_entries", withUid(d.time_entries ?? []))
  await upsert("vacation_entries", withUid(d.vacation_entries ?? []))
  await upsert("overtime_records", withUid(d.overtime_records ?? []))
  await upsert("holidays", withUid(d.holidays ?? []))
  await upsert("expense_reports", withUid(d.expense_reports ?? []))
  await upsert("expense_items", d.expense_items ?? [])

  if (d.profile) {
    const { error } = await supabase
      .from("users_profile")
      .upsert({ ...d.profile, user_id: uid }, { onConflict: "user_id" })
    if (error) errors.push(`users_profile: ${error.message}`)
  }

  if (errors.length > 0) {
    console.error("Backup import errors:", errors)
    return NextResponse.json({ error: "Import partially failed", count: errors.length }, { status: 207 })
  }

  return NextResponse.json({ ok: true })
}
