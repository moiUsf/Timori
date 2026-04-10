import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/sidebar"
import { ActiveTimersBar } from "@/components/time/active-timers-bar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users_profile")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (!profile) redirect("/onboarding")

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={user} profile={profile} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 pb-24">
          {children}
        </main>
        <ActiveTimersBar userId={user.id} />
      </div>
    </div>
  )
}
