"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

type View = "login" | "reset" | "reset-sent"

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations("login")
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<View>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [resetEmail, setResetEmail] = useState("")

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(error.message)
      setResetEmail(email)
    } else {
      router.push("/dashboard")
      router.refresh()
    }
    setLoading(false)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetEmail.trim()) { toast.error(t("errorEmailRequired")); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    if (error) {
      toast.error(error.message)
    } else {
      setView("reset-sent")
    }
    setLoading(false)
  }

  function goToReset() {
    setResetEmail(email)
    setView("reset")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-8 w-8" />
            <span className="text-2xl font-bold tracking-tight">Timori</span>
          </div>
          <p className="text-sm text-muted-foreground">{t("tagline")}</p>
        </div>

        {view === "login" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("title")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </CardHeader>
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t("password")}</Label>
                    <button
                      type="button"
                      onClick={goToReset}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
                    >
                      {t("forgotPassword")}
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("submitting") : t("submit")}
                </Button>
                <p className="text-sm text-muted-foreground text-center">
                  {t("noAccount")}{" "}
                  <Link href="/register" className="underline underline-offset-4 hover:text-foreground">
                    {t("register")}
                  </Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        )}

        {view === "reset" && (
          <Card>
            <CardHeader>
              <button
                onClick={() => setView("login")}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("backToLogin")}
              </button>
              <CardTitle>{t("resetTitle")}</CardTitle>
              <CardDescription>{t("resetDescription")}</CardDescription>
            </CardHeader>
            <form onSubmit={handleReset}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">{t("email")}</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="max@beispiel.de"
                    required
                    autoFocus
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("sending") : t("sendReset")}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {view === "reset-sent" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("sentTitle")}</CardTitle>
              <CardDescription>
                {t("sentDescription", { email: resetEmail })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("sentHint")}</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={() => setView("login")}>
                {t("backToLogin")}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  )
}
