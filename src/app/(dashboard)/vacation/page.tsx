"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import type { VacationEntry, UserProfile } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDate } from "@/lib/utils"
import { Plus, Trash2, Pencil, Umbrella, BookOpen, Heart, GraduationCap } from "lucide-react"
import { toast } from "sonner"

type VacationForm = {
  type: string
  date_from: string
  date_to: string
  days: string
  notes: string
}

const emptyForm = (): VacationForm => ({
  type: "annual", date_from: "", date_to: "", days: "", notes: "",
})

export default function VacationPage() {
  const supabase = createClient()
  const t = useTranslations("vacation")
  const tCommon = useTranslations("common")
  const [userId, setUserId] = useState("")
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [entries, setEntries] = useState<VacationEntry[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [viewMode, setViewMode] = useState<"year" | "month">("year")
  const [dialog, setDialog] = useState(false)
  const [editingEntry, setEditingEntry] = useState<VacationEntry | null>(null)
  const [form, setForm] = useState<VacationForm>(emptyForm())

  const TYPE_CONFIG = {
    annual:   { label: t("types.annual"),   icon: Umbrella,       color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
    special:  { label: t("types.special"),   icon: Heart,          color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
    training: { label: t("types.training"), icon: GraduationCap,  color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    illness:  { label: t("types.illness"),  icon: BookOpen,       color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        supabase.from("users_profile").select("*").eq("user_id", user.id).single()
          .then(({ data }) => setProfile(data))
        loadEntries(user.id, year)
      }
    })
  }, [supabase])

  async function loadEntries(uid: string, y: number) {
    const { data } = await supabase
      .from("vacation_entries")
      .select("*")
      .eq("user_id", uid)
      .gte("date_from", `${y}-01-01`)
      .lte("date_to", `${y}-12-31`)
      .order("date_from", { ascending: true })
    setEntries(data ?? [])
  }

  useEffect(() => {
    if (form.date_from && form.date_to) {
      const from = new Date(form.date_from)
      const to = new Date(form.date_to)
      let count = 0
      const d = new Date(from)
      while (d <= to) {
        const dow = d.getDay()
        if (dow !== 0 && dow !== 6) count++
        d.setDate(d.getDate() + 1)
      }
      setForm((prev) => ({ ...prev, days: String(count) }))
    }
  }, [form.date_from, form.date_to])

  async function handleSave() {
    if (!form.date_from || !form.date_to || !form.days) {
      toast.error(t("errorRequired"))
      return
    }

    if (editingEntry) {
      const { error } = await supabase.from("vacation_entries").update({
        type: form.type as VacationEntry["type"],
        date_from: form.date_from,
        date_to: form.date_to,
        days: parseFloat(form.days),
        notes: form.notes || null,
      }).eq("id", editingEntry.id)
      if (error) { toast.error(error.message); return }
    } else {
      const { error } = await supabase.from("vacation_entries").insert({
        user_id: userId,
        type: form.type as VacationEntry["type"],
        date_from: form.date_from,
        date_to: form.date_to,
        days: parseFloat(form.days),
        notes: form.notes || null,
      })
      if (error) { toast.error(error.message); return }
    }

    toast.success(t("saved"))
    closeDialog()
    loadEntries(userId, year)
  }

  async function handleDelete(id: string) {
    await supabase.from("vacation_entries").delete().eq("id", id)
    toast.success(t("deleted"))
    loadEntries(userId, year)
  }

  function openNew() {
    setEditingEntry(null)
    setForm(emptyForm())
    setDialog(true)
  }

  function openEdit(entry: VacationEntry) {
    setEditingEntry(entry)
    setForm({
      type: entry.type,
      date_from: entry.date_from,
      date_to: entry.date_to,
      days: String(entry.days),
      notes: entry.notes ?? "",
    })
    setDialog(true)
  }

  function closeDialog() {
    setDialog(false)
    setEditingEntry(null)
    setForm(emptyForm())
  }

  const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"]

  const visibleEntries = viewMode === "month"
    ? entries.filter(e => {
        const from = e.date_from.slice(0, 7)
        const to = e.date_to.slice(0, 7)
        const ym = `${year}-${String(month).padStart(2, "0")}`
        return from <= ym && to >= ym
      })
    : entries

  const byType = (type: string) => entries.filter((e) => e.type === type)
  const totalAnnual = byType("annual").reduce((s, e) => s + e.days, 0)
  const totalIllness = byType("illness").reduce((s, e) => s + e.days, 0)
  const totalTraining = byType("training").reduce((s, e) => s + e.days, 0)
  const quota = profile?.vacation_quota ?? 30

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {viewMode === "month" ? `${monthNames[month - 1]} ${year}` : t("year", { year })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(month)}
            onValueChange={(v) => { setMonth(parseInt(v)); setViewMode("month") }}
            onOpenChange={(open) => { if (open) setViewMode("month") }}
          >
            <SelectTrigger
              className={`w-36 font-medium transition-colors ${viewMode === "month" ? "bg-primary text-primary-foreground border-primary [&>svg]:text-primary-foreground" : ""}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(year)}
            onValueChange={(v) => { setYear(parseInt(v)); loadEntries(userId, parseInt(v)); setViewMode("year") }}
            onOpenChange={(open) => { if (open) setViewMode("year") }}
          >
            <SelectTrigger
              className={`w-28 font-medium transition-colors ${viewMode === "year" ? "bg-primary text-primary-foreground border-primary [&>svg]:text-primary-foreground" : ""}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("newEntry")}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("annualVacation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{quota - totalAnnual}</div>
            <p className="text-xs text-muted-foreground">{t("daysTaken", { taken: totalAnnual, quota })}</p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, totalAnnual / quota * 100)}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("sickDays")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalIllness}</div>
            <p className="text-xs text-muted-foreground">{t("daysInYear", { year })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("trainings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalTraining}</div>
            <p className="text-xs text-muted-foreground">{t("daysInYear", { year })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Entry list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("entries", { year })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {visibleEntries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noEntries")}</p>
          ) : (
            <div className="divide-y">
              {visibleEntries.map((entry) => {
                const config = TYPE_CONFIG[entry.type as keyof typeof TYPE_CONFIG]
                return (
                  <div key={entry.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 group hover:bg-muted cursor-pointer"
                    onClick={() => openEdit(entry)}>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-sm">{formatDate(entry.date_from)}</span>
                    <span className="text-muted-foreground text-sm">→</span>
                    <span className="text-sm">{formatDate(entry.date_to)}</span>
                    <span className="text-sm font-medium">{t("daysLabel", { days: entry.days })}</span>
                    {entry.notes && <span className="text-xs text-muted-foreground truncate flex-1">{entry.notes}</span>}
                    <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"
                        onClick={() => openEdit(entry)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(entry.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? t("editAbsenceEntry") : t("newAbsenceEntry")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("type")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_CONFIG).map(([v, c]) => (
                    <SelectItem key={v} value={v}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{tCommon("from")}</Label>
                <Input type="date" value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{tCommon("to")}</Label>
                <Input type="date" value={form.date_to} min={form.date_from} onChange={(e) => setForm({ ...form, date_to: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("workdays")}</Label>
              <Input type="number" step="0.5" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("notesOptional")}</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {editingEntry
              ? <Button variant="destructive" onClick={() => { handleDelete(editingEntry.id); closeDialog() }}><Trash2 className="h-4 w-4 mr-1.5" />Löschen</Button>
              : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeDialog}>{tCommon("cancel")}</Button>
              <Button onClick={handleSave}>{tCommon("save")}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
