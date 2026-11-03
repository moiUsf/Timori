import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Clock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function PendingApprovalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users_profile")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (!profile) redirect("/onboarding")
  if (profile.approved) redirect("/dashboard")

  const isRejected = profile.approval_status === "rejected"

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-8 w-8" />
            <span className="text-2xl font-bold tracking-tight">Timori</span>
          </div>
          <p className="text-sm text-muted-foreground">Freelance Zeiterfassung</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="text-4xl mb-2">{isRejected ? "❌" : "⏳"}</div>
            <CardTitle>
              {isRejected ? "Registrierung nicht genehmigt" : "Zugang wird geprüft"}
            </CardTitle>
            <CardDescription>
              {isRejected
                ? "Deine Registrierungsanfrage wurde leider abgelehnt."
                : `Hallo ${profile.name}, dein Account wartet auf Freischaltung durch den Administrator.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {isRejected
                ? "Falls du glaubst, dass dies ein Fehler ist, wende dich bitte an den Administrator."
                : "Du erhältst eine E-Mail, sobald dein Account freigeschaltet wurde. Dies dauert in der Regel weniger als 24 Stunden."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
