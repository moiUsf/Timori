import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { sendAdminApprovalEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  const { userId } = await request.json() as { userId: string }
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

  const supabase = createServiceClient()

  const { data: profile } = await supabase
    .from("users_profile")
    .select("name, approval_token, created_at")
    .eq("user_id", userId)
    .single()

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  if (!authUser?.user?.email) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const token = profile.approval_token

  await sendAdminApprovalEmail({
    userName: profile.name,
    userEmail: authUser.user.email,
    registeredAt: profile.created_at,
    approveUrl: `${appUrl}/api/admin/approve?token=${token}&action=approve`,
    rejectUrl: `${appUrl}/api/admin/approve?token=${token}&action=reject`,
  })

  return NextResponse.json({ ok: true })
}
