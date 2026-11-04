import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Mit und ohne Session erreichbar, ohne Umleitung; die Routen schützen sich selbst:
  // notify (direkt nach signUp, nur frische Accounts, höchstens eine Mail), approve (Link aus der Admin-Mail, per Token),
  // callback (löst den Link aus der Mail ein, auch wenn schon jemand angemeldet ist),
  // reset-password (zeigt das Formular nur mit Session, sonst den Hinweis auf einen ungültigen Link)
  const alwaysReachablePaths = ["/api/admin/notify", "/api/admin/approve", "/auth/callback", "/reset-password"]
  if (alwaysReachablePaths.includes(pathname)) {
    return supabaseResponse
  }

  // Public routes
  const publicPaths = ["/login", "/register"]
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    if (user) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    return supabaseResponse
  }

  // Protected routes
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
