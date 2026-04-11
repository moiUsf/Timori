"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import type { UserProfile } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LanguageSwitcher } from "@/components/ui/language-switcher"
import { toast } from "sonner"
import { Sun, Moon, Monitor, ChevronUp, ChevronDown } from "lucide-react"
import type { TaetigkeitField } from "@/types/database"
import { DEFAULT_TAETIGKEIT_FIELDS } from "@/lib/reports/taetigkeitsbericht-data"

type FieldItem = { field: TaetigkeitField; enabled: boolean }

const ALL_FIELDS: TaetigkeitField[] = ["booking_item", "task", "description", "project"]

function buildFieldItems(active: TaetigkeitField[]): FieldItem[] {
  const activeSet = new Set(active)
  const inactive = ALL_FIELDS.filter(f => !activeSet.has(f))
  return [
    ...active.map(f => ({ field: f, enabled: true })),
    ...inactive.map(f => ({ field: f, enabled: false })),
  ]
}

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
  const { theme, setTheme } = useTheme()
  const t = useTranslations("settings")
  const tCommon = useTranslations("common")
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [fieldItems, setFieldItems] = useState<FieldItem[]>(buildFieldItems(DEFAULT_TAETIGKEIT_FIELDS))
  const [savingConfig, setSavingConfig] = useState(false)
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
              const activeFields = data.report_config?.taetigkeit_fields ?? DEFAULT_TAETIGKEIT_FIELDS
              setFieldItems(buildFieldItems(activeFields))
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
    else toast.success(t("settingsSaved"))
    setLoading(false)
  }

  async function handlePasswordReset() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    if (error) toast.error(error.message)
    else toast.success(t("resetSent"))
  }

  function moveFieldUp(i: number) {
    if (i === 0) return
    const items = [...fieldItems]
    ;[items[i - 1], items[i]] = [items[i], items[i - 1]]
    setFieldItems(items)
  }

  function moveFieldDown(i: number) {
    if (i === fieldItems.length - 1) return
    const items = [...fieldItems]
    ;[items[i + 1], items[i]] = [items[i], items[i + 1]]
    setFieldItems(items)
  }

  function toggleField(i: number) {
    const items = [...fieldItems]
    items[i] = { ...items[i], enabled: !items[i].enabled }
    setFieldItems(items)
  }

  async function handleSaveConfig() {
    if (!profile) return
    setSavingConfig(true)
    const activeFields = fieldItems.filter(f => f.enabled).map(f => f.field)
    const { error } = await supabase.from("users_profile").update({
      report_config: { taetigkeit_fields: activeFields },
    }).eq("id", profile.id)
    if (error) toast.error(error.message)
    else toast.success(t("reportConfigSaved"))
    setSavingConfig(false)
  }

  const FIELD_LABELS: Record<TaetigkeitField, string> = {
    booking_item: t("fieldBookingItem"),
    task: t("fieldTask"),
    description: t("fieldDescription"),
    project: t("fieldProject"),
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("name")} *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{t("personalNr")}</Label>
                <Input value={form.personal_nr} onChange={(e) => setForm({ ...form, personal_nr: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("workingHoursPerDay")}</Label>
                <Input type="number" step="0.5" min="1" max="24"
                  value={form.working_hours_per_day}
                  onChange={(e) => setForm({ ...form, working_hours_per_day: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("vacationQuota")}</Label>
                <Input type="number" min="0" max="365"
                  value={form.vacation_quota}
                  onChange={(e) => setForm({ ...form, vacation_quota: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("federalState")}</Label>
                <Select value={form.federal_state} onValueChange={(v) => setForm({ ...form, federal_state: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("hourlyRate")}</Label>
                <Input type="number" step="0.01" placeholder={t("hourlyRatePlaceholder")}
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading ? tCommon("saving") : t("saveSettings")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("appearance")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("colorScheme")}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                className="flex items-center gap-2"
              >
                <Sun className="h-4 w-4" />
                {t("light")}
              </Button>
              <Button
                type="button"
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="flex items-center gap-2"
              >
                <Moon className="h-4 w-4" />
                {t("dark")}
              </Button>
              <Button
                type="button"
                variant={theme === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("system")}
                className="flex items-center gap-2"
              >
                <Monitor className="h-4 w-4" />
                {t("system")}
              </Button>
            </div>
          </div>
          <LanguageSwitcher />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reportConfig")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("reportConfigDesc")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border divide-y">
            {fieldItems.map((item, i) => (
              <div key={item.field} className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={() => toggleField(i)}
                  className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                />
                <span className={`flex-1 text-sm ${item.enabled ? "" : "text-muted-foreground"}`}>
                  {FIELD_LABELS[item.field]}
                </span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => moveFieldUp(i)} disabled={i === 0} title={t("moveUp")}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => moveFieldDown(i)} disabled={i === fieldItems.length - 1} title={t("moveDown")}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={handleSaveConfig} disabled={savingConfig}>
              {savingConfig ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("changePassword")}</p>
              <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
            </div>
            <Button variant="outline" onClick={handlePasswordReset}>
              {t("sendResetLink")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
