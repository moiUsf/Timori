"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock } from "lucide-react"
import { toast } from "sonner"

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [submitted, setSubmitted] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      // Das Profil legt der DB-Trigger on_auth_user_created an (security definer).
      // Aus dem Browser geht das nicht: bei aktiver E-Mail-Bestätigung gibt es hier noch keine Session → RLS blockiert.
      // Admin benachrichtigen – serverseitig, unabhängig von der Mail-Bestätigung (non-fatal, wird sonst beim ersten Login nachgeholt).
      try {
        const res = await fetch("/api/admin/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: data.user.id }),
        })
        if (!res.ok) console.warn("Admin-Benachrichtigung fehlgeschlagen:", res.status)
      } catch (err) {
        console.warn("Admin-Benachrichtigung fehlgeschlagen:", err)
      }

      if (data.session) {
        // E-Mail-Bestätigung deaktiviert → direkt eingeloggt
        router.push("/pending-approval")
      } else {
        setSubmitted(true)
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-8 w-8" />
            <span className="text-2xl font-bold tracking-tight">Timori</span>
          </div>
          <p className="text-sm text-muted-foreground">Freelance Zeiterfassung</p>
        </div>

        {submitted ? (
        <Card>
          <CardHeader>
            <CardTitle>Registrierung eingegangen</CardTitle>
            <CardDescription>Danke, {name}! Dein Account wurde angelegt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir an {email} gesendet haben.</p>
            <p>Dein Account wird in den nächsten 48 Stunden zur Freigabe geprüft. Du wirst per E-Mail informiert, sobald die Prüfung abgeschlossen ist.</p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/login">Zur Anmeldung</Link>
            </Button>
          </CardFooter>
        </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle>Konto erstellen</CardTitle>
            <CardDescription>Starte kostenlos mit Timori</CardDescription>
          </CardHeader>
          <form onSubmit={handleRegister}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Vollständiger Name</Label>
                <Input
                  id="name"
                  placeholder="Max Mustermann"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="max@beispiel.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mindestens 6 Zeichen"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Registrieren..." : "Konto erstellen"}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Bereits ein Konto?{" "}
                <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                  Anmelden
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
        )}
      </div>
    </div>
  )
}
