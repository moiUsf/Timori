import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { sendUserNotificationEmail } from "@/lib/email"

type Action = "approve" | "reject"
type PageState = boolean | "confirm"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function htmlPage(title: string, body: string, state: PageState): NextResponse {
  const ok = state === true
  const icon = state === "confirm" ? "⏳" : ok ? "✅" : "❌"
  const badge = state === "confirm"
    ? ""
    : `<div class="badge">${ok ? "Erfolgreich" : "Abgelehnt"}</div>`

  return new NextResponse(
    `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} — Timori</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f4f4f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 16px; padding: 48px 56px; max-width: 480px; width: 100%; box-shadow: 0 1px 8px rgba(0,0,0,.08); text-align: center; }
    .icon { font-size: 48px; margin-bottom: 24px; }
    h1 { font-size: 24px; font-weight: 700; color: #18181b; margin-bottom: 12px; }
    p { font-size: 15px; color: #71717a; line-height: 1.6; }
    .badge { display: inline-block; margin-top: 24px; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: ${ok ? "#dcfce7" : "#fee2e2"}; color: ${ok ? "#15803d" : "#b91c1c"}; }
    .confirm { margin-top: 24px; padding: 12px 28px; border: 0; border-radius: 8px; font: inherit; font-size: 15px; font-weight: 600; color: #fff; cursor: pointer; }
    .confirm-approve { background: #16a34a; }
    .confirm-reject { background: #dc2626; }
    .footer { margin-top: 40px; font-size: 12px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    ${body}
    ${badge}
    <p class="footer">🕐 Timori · Freelance Zeiterfassung</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
}

function isAction(value: unknown): value is Action {
  return value === "approve" || value === "reject"
}

function invalidLinkPage(): NextResponse {
  return htmlPage("Ungültiger Link", "<p>Dieser Link ist ungültig oder unvollständig.</p>", false)
}

async function findProfile(token: string) {
  const supabase = createServiceClient()
  const { data: profile } = await supabase
    .from("users_profile")
    .select("id, user_id, name, approval_status")
    .eq("approval_token", token)
    .single()
  return { supabase, profile }
}

function notFoundPage(): NextResponse {
  return htmlPage("Token nicht gefunden", "<p>Dieser Link ist ungültig oder wurde bereits verarbeitet.</p>", false)
}

function alreadyProcessedPage(status: string): NextResponse {
  const already = status === "approved"
  return htmlPage(
    already ? "Bereits freigeschaltet" : "Bereits abgelehnt",
    `<p>Dieser Account wurde bereits ${already ? "freigeschaltet" : "abgelehnt"}. Keine weitere Aktion notwendig.</p>`,
    already
  )
}

// GET ändert nichts: Mail-Scanner rufen Links automatisch auf und dürfen dabei keine Freigabe auslösen.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")
  const action = searchParams.get("action")

  if (!token || !isAction(action)) return invalidLinkPage()

  const { profile } = await findProfile(token)
  if (!profile) return notFoundPage()
  if (profile.approval_status !== "pending") return alreadyProcessedPage(profile.approval_status)

  const isApprove = action === "approve"
  const name = escapeHtml(profile.name)

  return htmlPage(
    isApprove ? "Account freischalten?" : "Registrierung ablehnen?",
    `<p>${isApprove
      ? `Soll der Account von <strong>${name}</strong> freigeschaltet werden?`
      : `Soll die Registrierung von <strong>${name}</strong> abgelehnt werden?`
    }</p>
    <form method="post" action="/api/admin/approve">
      <input type="hidden" name="token" value="${escapeHtml(token)}"/>
      <input type="hidden" name="action" value="${action}"/>
      <button type="submit" class="confirm ${isApprove ? "confirm-approve" : "confirm-reject"}">${isApprove ? "✓ Jetzt freischalten" : "✕ Jetzt ablehnen"}</button>
    </form>`,
    "confirm"
  )
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const token = form?.get("token")
  const action = form?.get("action")

  if (typeof token !== "string" || !token || !isAction(action)) return invalidLinkPage()

  const { supabase, profile } = await findProfile(token)
  if (!profile) return notFoundPage()
  if (profile.approval_status !== "pending") return alreadyProcessedPage(profile.approval_status)

  const isApprove = action === "approve"

  const { error: updateError } = await supabase
    .from("users_profile")
    .update({
      approved: isApprove,
      approval_status: isApprove ? "approved" : "rejected",
    })
    .eq("id", profile.id)

  if (updateError) {
    console.error("[approve] DB update failed:", updateError)
    return htmlPage("Datenbankfehler", "<p>Die Aktion konnte nicht gespeichert werden. Bitte versuche es erneut.</p>", false)
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(profile.user_id)
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
      console.error("[approve] user email failed:", err)
    }
  }

  const emailNote = emailSent
    ? "Der Benutzer wurde per E-Mail informiert."
    : "<strong>Die E-Mail an den Benutzer konnte nicht gesendet werden.</strong> Bitte informiere ihn selbst."
  const name = escapeHtml(profile.name)

  return htmlPage(
    isApprove ? "Account freigeschaltet" : "Registrierung abgelehnt",
    `<p>${isApprove
      ? `Der Account von <strong>${name}</strong> wurde freigeschaltet. ${emailNote}`
      : `Die Registrierung von <strong>${name}</strong> wurde abgelehnt. ${emailNote}`
    }</p>`,
    isApprove
  )
}
