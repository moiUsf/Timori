import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { sendUserNotificationEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId, action } = await request.json() as { userId: string; action: "approve" | "reject" }
  if (!userId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 })
  }

  const admin = createServiceClient()
  const isApprove = action === "approve"

  const { data: profile } = await admin
    .from("users_profile")
    .select("id, name, approval_status")
    .eq("user_id", userId)
    .single()

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })

  await admin.from("users_profile").update({
    approved: isApprove,
    approval_status: isApprove ? "approved" : "rejected",
  }).eq("id", profile.id)

  const { data: authUser } = await admin.auth.admin.getUserById(userId)
  const userEmail = authUser?.user?.email
  let emailSent = false
  if (userEmail) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    try {
      await sendUserNotificationEmail({
        userName: profile.name,
        userEmail,
        action,
        loginUrl: `${appUrl}/login`,
      })
      emailSent = true
    } catch (err) {
      console.error("[set-status] email failed:", err)
    }
  }

  return NextResponse.json({ ok: true, newStatus: isApprove ? "approved" : "rejected", emailSent })
}
