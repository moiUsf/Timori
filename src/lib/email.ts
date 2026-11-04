import { Resend } from "resend"

// Lazy erzeugen: new Resend() wirft ohne API-Key – beim Import würde das den Build (z. B. auf Vercel) abbrechen
let resendClient: Resend | null = null
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY ist nicht gesetzt")
  resendClient ??= new Resend(process.env.RESEND_API_KEY)
  return resendClient
}
/** Resend v6 wirft bei API-Fehlern nicht, sondern liefert { error } – hier in eine Exception umwandeln */
async function sendOrThrow(payload: Parameters<Resend["emails"]["send"]>[0]) {
  const { data, error } = await getResend().emails.send(payload)
  if (error) throw new Error(`Resend-Fehler (${error.name}): ${error.message}`)
  return data
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "youssef.elouatiq@intellinq.de"
const FROM_ADDRESS = process.env.EMAIL_FROM ?? "Timori <noreply@resend.dev>"

export async function sendAdminApprovalEmail(params: {
  userName: string
  userEmail: string
  registeredAt: string
  approveUrl: string
  rejectUrl: string
}) {
  const { userName, userEmail, registeredAt, approveUrl, rejectUrl } = params
  const date = new Date(registeredAt).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })

  return sendOrThrow({
    from: FROM_ADDRESS,
    to: ADMIN_EMAIL,
    subject: `[Timori] Neue Registrierung: ${userName} (${userEmail})`,
    html: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);">
<tr><td style="background:#18181b;padding:28px 40px;border-radius:12px 12px 0 0;">
  <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🕐 Timori</p>
  <p style="margin:4px 0 0;color:#a1a1aa;font-size:13px;">Admin-Benachrichtigung</p>
</td></tr>
<tr><td style="padding:36px 40px;">
  <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">Neue Registrierungsanfrage</p>
  <p style="margin:0 0 28px;font-size:15px;color:#71717a;">Ein neuer Benutzer möchte Zugang zu Timori erhalten.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;margin-bottom:32px;">
    <tr><td style="padding:20px 24px;">
      <table width="100%">
        <tr><td colspan="2" style="font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.6px;padding-bottom:12px;">Benutzerdetails</td></tr>
        <tr><td style="font-size:14px;color:#71717a;width:120px;padding:6px 0;vertical-align:top;">Name</td><td style="font-size:14px;font-weight:500;color:#18181b;padding:6px 0;">${userName}</td></tr>
        <tr><td style="font-size:14px;color:#71717a;padding:6px 0;vertical-align:top;">E-Mail</td><td style="font-size:14px;font-weight:500;color:#18181b;padding:6px 0;">${userEmail}</td></tr>
        <tr><td style="font-size:14px;color:#71717a;padding:6px 0;vertical-align:top;">Registriert</td><td style="font-size:14px;font-weight:500;color:#18181b;padding:6px 0;">${date}</td></tr>
      </table>
    </td></tr>
  </table>
  <p style="margin:0 0 20px;font-size:15px;color:#3f3f46;font-weight:500;">Bitte wählen Sie eine Aktion:</p>
  <table cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:12px;">
      <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">✓ Zulassen</a>
    </td>
    <td>
      <a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:#fff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">✕ Ablehnen</a>
    </td>
  </tr></table>
  <p style="margin:28px 0 0;font-size:12px;color:#a1a1aa;border-top:1px solid #f4f4f5;padding-top:20px;">Diese E-Mail wurde automatisch von Timori gesendet.</p>
</td></tr>
<tr><td style="background:#fafafa;border-top:1px solid #f4f4f5;padding:16px 40px;text-align:center;border-radius:0 0 12px 12px;">
  <p style="margin:0;font-size:12px;color:#a1a1aa;">Timori · Freelance Zeiterfassung</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
  })
}

export async function sendUserNotificationEmail(params: {
  userName: string
  userEmail: string
  action: "approve" | "reject"
  loginUrl: string
}) {
  const { userName, userEmail, action, loginUrl } = params
  const isApproved = action === "approve"

  return sendOrThrow({
    from: FROM_ADDRESS,
    to: userEmail,
    subject: isApproved
      ? "[Timori] Account freigeschaltet — Jetzt einloggen"
      : "[Timori] Registrierung nicht genehmigt",
    html: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);">
<tr><td style="background:#18181b;padding:28px 40px;border-radius:12px 12px 0 0;">
  <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🕐 Timori</p>
  <p style="margin:4px 0 0;color:#a1a1aa;font-size:13px;">Freelance Zeiterfassung</p>
</td></tr>
<tr><td style="background:${isApproved ? "#dcfce7" : "#fee2e2"};padding:14px 40px;border-bottom:1px solid ${isApproved ? "#bbf7d0" : "#fecaca"};">
  <p style="margin:0;font-size:14px;font-weight:600;color:${isApproved ? "#15803d" : "#b91c1c"};">${isApproved ? "✓ Account freigeschaltet" : "✕ Registrierung abgelehnt"}</p>
</td></tr>
<tr><td style="padding:36px 40px;">
  <p style="margin:0 0 16px;font-size:22px;font-weight:600;color:#18181b;">Hallo ${userName},</p>
  ${isApproved
    ? `<p style="margin:0 0 32px;font-size:15px;color:#3f3f46;line-height:1.6;">dein Timori-Account wurde freigeschaltet. Du kannst dich jetzt anmelden.</p>
       <a href="${loginUrl}" style="display:inline-block;background:#18181b;color:#fff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">Jetzt einloggen →</a>`
    : `<p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">deine Registrierungsanfrage für Timori wurde leider nicht genehmigt. Falls du glaubst, dass dies ein Fehler ist, wende dich bitte an den Administrator.</p>`
  }
</td></tr>
<tr><td style="background:#fafafa;border-top:1px solid #f4f4f5;padding:16px 40px;text-align:center;border-radius:0 0 12px 12px;">
  <p style="margin:0;font-size:12px;color:#a1a1aa;">Timori · Freelance Zeiterfassung</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
  })
}
