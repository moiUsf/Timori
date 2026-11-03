import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const admin = createServiceClient()

  const { data: profiles } = await admin
    .from("users_profile")
    .select("id, user_id, name, approval_status, approved, created_at")
    .order("created_at", { ascending: false })

  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = Object.fromEntries(authUsers.map(u => [u.id, u.email ?? ""]))

  const result = (profiles ?? []).map(p => ({
    ...p,
    email: emailMap[p.user_id] ?? "",
  }))

  return NextResponse.json(result)
}
