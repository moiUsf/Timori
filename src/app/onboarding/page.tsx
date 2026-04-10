"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock } from "lucide-react"
import { toast } from "sonner"

const STATES = [
  { value: "DE-BW", label: "Baden-Württemberg" },
  { value: "DE-BY", label: "Bayern" },
  { value: "DE-BE", label: "Berlin" },
  { value: "DE-BB", label: "Brandenburg" },
  { value: "DE-HB", label: "Bremen" },
  { value: "DE-HH", label: "Hamburg" },
  { value: "DE-HE", label: "Hessen" },
  { value: "DE-MV", label: "Mecklenburg-Vorpommern" },
  { value: "DE-NI", label: "Niedersachsen" },
  { value: "DE-NW", label: "Nordrhein-Westfalen" },
  { value: "DE-RP", label: "Rheinland-Pfalz" },
  { value: "DE-SL", label: "Saarland" },
  { value: "DE-SN", label: "Sachsen" },
  { value: "DE-ST", label: "Sachsen-Anhalt" },
  { value: "DE-SH", label: "Schleswig-Holstein" },
  { value: "DE-TH", label: "Thüringen" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: "",
    personal_nr: "",
    working_hours_per_day: "8",
    vacation_quota: "30",
    federal_state: "DE-NW",
    hourly_rate: "",
  })

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push("/login"); return }

    const { error } = await supabase.from("users_profile").upsert({
      user_id: user.id,
      name: form.name || user.user_metadata?.name || "Benutzer",
      personal_nr: form.personal_nr || null,
      working_hours_per_day: parseFloat(form.working_hours_per_day),
      vacation_quota: parseInt(form.vacation_quota),
      federal_state: form.federal_state,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
    }, { onConflict: "user_id" })

    if (error) {
      toast.error("Fehler beim Speichern: " + error.message)
      setLoading(false)
      return
    }

    // Create free subscription
    await supabase.from("subscriptions").upsert({
      user_id: user.id,
      plan: "free",
      status: "active",
    }, { onConflict: "user_id" })

    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Clock className="h-10 w-10" />
          <h1 className="text-2xl font-bold">Willkommen bei Timori!</h1>
          <p className="text-muted-foreground text-center text-sm">
            Richte dein Profil ein, um loszulegen
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profil einrichten</CardTitle>
            <CardDescription>Diese Angaben kannst du später in den Einstellungen ändern</CardDescription>
          </CardHeader>
          <form onSubmit={handleComplete}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Vollständiger Name *</Label>
                <Input
                  placeholder="Max Mustermann"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Arbeitsstunden/Tag</Label>
                  <Input
                    type="number" step="0.5" min="1" max="24"
                    value={form.working_hours_per_day}
                    onChange={(e) => setForm({ ...form, working_hours_per_day: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jahresurlaub (Tage)</Label>
                  <Input
                    type="number" min="0"
                    value={form.vacation_quota}
                    onChange={(e) => setForm({ ...form, vacation_quota: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bundesland (für Feiertage)</Label>
                <Select value={form.federal_state} onValueChange={(v) => setForm({ ...form, federal_state: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Standard-Stundensatz (€, optional)</Label>
                <Input
                  type="number" step="0.01" placeholder="z.B. 125"
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Einrichten..." : "Timori starten →"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
