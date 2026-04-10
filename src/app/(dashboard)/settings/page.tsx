"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { UserProfile } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

const STATES: { value: string; label: string }[] = [
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

export default function SettingsPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: "", personal_nr: "", working_hours_per_day: "8",
    vacation_quota: "30", federal_state: "DE-NW", hourly_rate: "",
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("users_profile").select("*").eq("user_id", user.id).single()
          .then(({ data }) => {
            if (data) {
              setProfile(data)
              setForm({
                name: data.name,
                personal_nr: data.personal_nr ?? "",
                working_hours_per_day: String(data.working_hours_per_day),
                vacation_quota: String(data.vacation_quota),
                federal_state: data.federal_state,
                hourly_rate: data.hourly_rate?.toString() ?? "",
              })
            }
          })
      }
    })
  }, [supabase])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setLoading(true)
    const { error } = await supabase.from("users_profile").update({
      name: form.name,
      personal_nr: form.personal_nr || null,
      working_hours_per_day: parseFloat(form.working_hours_per_day),
      vacation_quota: parseInt(form.vacation_quota),
      federal_state: form.federal_state,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
    }).eq("id", profile.id)
    if (error) toast.error(error.message)
    else toast.success("Einstellungen gespeichert")
    setLoading(false)
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground">Profil und Arbeitszeitkonfiguration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Personal-Nr.</Label>
                <Input value={form.personal_nr} onChange={(e) => setForm({ ...form, personal_nr: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Arbeitsstunden/Tag</Label>
                <Input type="number" step="0.5" min="1" max="24"
                  value={form.working_hours_per_day}
                  onChange={(e) => setForm({ ...form, working_hours_per_day: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Jahresurlaub (Tage)</Label>
                <Input type="number" min="0" max="365"
                  value={form.vacation_quota}
                  onChange={(e) => setForm({ ...form, vacation_quota: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bundesland (Feiertage)</Label>
                <Select value={form.federal_state} onValueChange={(v) => setForm({ ...form, federal_state: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Standard Stundensatz (€)</Label>
                <Input type="number" step="0.01" placeholder="Optional"
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading ? "Speichern..." : "Einstellungen speichern"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
