// Nur serverseitig verwenden (Service-Role-Key)!
import { createServiceClient } from "@/lib/supabase/service"
import { sendAdminApprovalEmail } from "@/lib/email"

/** Nur für frisch registrierte Accounts darf die (öffentliche) Notify-Route eine Mail auslösen */
const MAX_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000

export type NotifyResult =
  | { status: "sent" }
  | { status: "already-notified" }
  | { status: "skipped"; reason: string }

/**
 * Stellt sicher, dass ein Profil existiert (Fallback, falls der DB-Trigger fehlt)
 * und schickt die Admin-Freigabe-Mail genau einmal (Markierung über admin_notified_at).
 * Läuft ausschließlich serverseitig mit dem Service-Role-Key.
 * Wirft bei Versandfehlern – Aufrufer loggen das (sichtbar in den Vercel-Logs).
 */
export async function ensureProfileAndNotifyAdmin(
  userId: string,
  opts: { enforceMaxAge?: boolean } = {},
): Promise<NotifyResult> {
  const admin = createServiceClient()

  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId)
  const authUser = authData?.user
  if (authError || !authUser?.email) {
    return { status: "skipped", reason: `auth user not found (${authError?.message ?? "no email"})` }
  }

  if (opts.enforceMaxAge && Date.now() - new Date(authUser.created_at).getTime() > MAX_ACCOUNT_AGE_MS) {
    return { status: "skipped", reason: "account older than 24h" }
  }

  const fallbackName =
    (typeof authUser.user_metadata?.name === "string" && authUser.user_metadata.name.trim()) ||
    authUser.email.split("@")[0]

  // Fallback: Profil anlegen, falls der Trigger (noch) nicht existiert. approved/approval_status kommen aus den DB-Defaults.
  const { error: upsertError } = await admin
    .from("users_profile")
    .upsert({ user_id: userId, name: fallbackName }, { onConflict: "user_id", ignoreDuplicates: true })
  if (upsertError) throw new Error(`Profil konnte nicht angelegt werden: ${upsertError.message}`)

  const { data: profile, error: profileError } = await admin
    .from("users_profile")
    .select("name, approval_token, approval_status, admin_notified_at, created_at")
    .eq("user_id", userId)
    .single()
  if (profileError || !profile) throw new Error(`Profil nicht lesbar: ${profileError?.message ?? "leer"}`)

  if (profile.admin_notified_at) return { status: "already-notified" }
  if (profile.approval_status !== "pending") return { status: "skipped", reason: `status ${profile.approval_status}` }

  // Erst "claimen", dann senden → keine Doppelmails bei parallelen Aufrufen
  const claimedAt = new Date().toISOString()
  const { data: claimed, error: claimError } = await admin
    .from("users_profile")
    .update({ admin_notified_at: claimedAt })
    .eq("user_id", userId)
    .is("admin_notified_at", null)
    .select("id")
  if (claimError) throw new Error(`admin_notified_at konnte nicht gesetzt werden: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return { status: "already-notified" }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  try {
    await sendAdminApprovalEmail({
      userName: profile.name,
      userEmail: authUser.email,
      registeredAt: profile.created_at,
      approveUrl: `${appUrl}/api/admin/approve?token=${profile.approval_token}&action=approve`,
      rejectUrl: `${appUrl}/api/admin/approve?token=${profile.approval_token}&action=reject`,
    })
  } catch (err) {
    // Markierung zurücknehmen, damit ein späterer Aufruf (z. B. /pending-approval) es erneut versucht
    await admin.from("users_profile").update({ admin_notified_at: null }).eq("user_id", userId)
    throw err
  }

  return { status: "sent" }
}
