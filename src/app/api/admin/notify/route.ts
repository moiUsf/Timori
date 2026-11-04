import { NextRequest, NextResponse } from "next/server"
import { ensureProfileAndNotifyAdmin } from "@/lib/registration"

/**
 * Wird direkt nach signUp() aus dem Browser aufgerufen – zu diesem Zeitpunkt gibt es bei
 * aktiver E-Mail-Bestätigung noch keine Session, daher öffentlich.
 * Schutz vor Missbrauch: nur Accounts < 24 h, nur Status "pending", Mail höchstens einmal (admin_notified_at).
 */
export async function POST(request: NextRequest) {
  let userId: string | undefined
  try {
    ({ userId } = (await request.json()) as { userId?: string })
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "Missing or invalid userId" }, { status: 400 })
  }

  try {
    const result = await ensureProfileAndNotifyAdmin(userId, { enforceMaxAge: true })
    console.info(`[admin-notify] user=${userId} result=${JSON.stringify(result)}`)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error(`[admin-notify] user=${userId} FEHLGESCHLAGEN:`, err)
    return NextResponse.json({ error: "Admin-Benachrichtigung fehlgeschlagen" }, { status: 500 })
  }
}
