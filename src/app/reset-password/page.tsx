"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock } from "lucide-react"
import { toast } from "sonner"

export default function ResetPasswordPage() {
  const router = useRouter()
  const t = useTranslations("login")
  const [supabase] = useState(() => createClient())
  // Die Session stammt aus dem Link in der Mail (/auth/callback). Ohne Session ist der Link ungültig oder abgelaufen.
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setHasSession(!!user))
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmation) {
      toast.error(t("newPasswordMismatch"))
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    toast.success(t("newPasswordSaved"))
    router.push("/dashboard")
    router.refresh()
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

        {hasSession === true && (
          <Card>
            <CardHeader>
              <CardTitle>{t("newPasswordTitle")}</CardTitle>
              <CardDescription>{t("newPasswordDescription")}</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("newPasswordLabel")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("newPasswordConfirm")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={loading}>
                  {t("newPasswordSubmit")}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {hasSession === false && (
          <Card>
            <CardHeader>
              <CardTitle>{t("newPasswordInvalidTitle")}</CardTitle>
              <CardDescription>{t("newPasswordInvalidDescription")}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/login">{t("backToLogin")}</Link>
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  )
}
