import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const uid = user.id

  const [
    { data: profile },
    { data: clients },
    { data: projects },
    { data: tasks },
    { data: booking_items },
    { data: time_entries },
    { data: vacation_entries },
    { data: overtime_records },
    { data: holidays },
    { data: expense_reports },
    { data: expense_items },
  ] = await Promise.all([
    supabase.from("users_profile").select("*").eq("user_id", uid).single(),
    supabase.from("clients").select("*").eq("user_id", uid),
    supabase.from("projects").select("*").eq("user_id", uid),
    supabase.from("tasks").select("*").eq("user_id", uid),
    supabase.from("booking_items").select("*").eq("user_id", uid),
    supabase.from("time_entries").select("*").eq("user_id", uid),
    supabase.from("vacation_entries").select("*").eq("user_id", uid),
    supabase.from("overtime_records").select("*").eq("user_id", uid),
    supabase.from("holidays").select("*").eq("user_id", uid),
    supabase.from("expense_reports").select("*").eq("user_id", uid),
    supabase.from("expense_items").select("expense_reports!inner(user_id), *").eq("expense_reports.user_id", uid),
  ])

  return NextResponse.json({
    version: 1,
    exported_at: new Date().toISOString(),
    data: {
      profile,
      clients: clients ?? [],
      projects: projects ?? [],
      tasks: tasks ?? [],
      booking_items: booking_items ?? [],
      time_entries: time_entries ?? [],
      vacation_entries: vacation_entries ?? [],
      overtime_records: overtime_records ?? [],
      holidays: holidays ?? [],
      expense_reports: expense_reports ?? [],
      expense_items: (expense_items ?? []).map(({ expense_reports: _, ...rest }) => rest),
    },
  })
}
