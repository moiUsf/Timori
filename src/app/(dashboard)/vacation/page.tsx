"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { VacationEntry, UserProfile } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDate } from "@/lib/utils"
import { Plus, Trash2, Umbrella, BookOpen, Heart, GraduationCap } from "lucide-react"
import { toast } from "sonner"

const TYPE_CONFIG = {
  annual:   { label: "Jahresurlaub",       icon: Umbrella,       color: "bg-blue-100 text-blue-800" },
  special:  { label: "Sonderurlaub",        icon: Heart,          color: "bg-purple-100 text-purple-800" },
  training: { label: "Ausbildung/Schulung", icon: GraduationCap,  color: "bg-green-100 text-green-800" },
  illness:  { label: "Krankheit",           icon: BookOpen,       color: "bg-red-100 text-red-800" },
}

export default function VacationPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState("")
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [entries, setEntries] = useState<VacationEntry[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState({ type: "annual", date_from: "", date_to: "", days: "", notes: "" })

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

  // Auto-calculate days when dates change
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
      toast.error("Bitte alle Pflichtfelder ausfüllen")
      return
    }
    const { error } = await supabase.from("vacation_entries").insert({
      user_id: userId,
      type: form.type as VacationEntry["type"],
      date_from: form.date_from,
      date_to: form.date_to,
      days: parseFloat(form.days),
      notes: form.notes || null,
    })
    if (error) { toast.error(error.message); return }
    toast.success("Eintrag gespeichert")
    setDialog(false)
    setForm({ type: "annual", date_from: "", date_to: "", days: "", notes: "" })
    loadEntries(userId, year)
  }

  async function handleDelete(id: string) {
    await supabase.from("vacation_entries").delete().eq("id", id)
    toast.success("Eintrag gelöscht")
    loadEntries(userId, year)
  }

  const byType = (type: string) => entries.filter((e) => e.type === type)
  const totalAnnual = byType("annual").reduce((s, e) => s + e.days, 0)
  const totalIllness = byType("illness").reduce((s, e) => s + e.days, 0)
  const totalTraining = byType("training").reduce((s, e) => s + e.days, 0)
  const quota = profile?.vacation_quota ?? 30

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Urlaub & Abwesenheit</h1>
          <p className="text-muted-foreground">Jahr {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => { setYear(parseInt(v)); loadEntries(userId, parseInt(v)) }}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Eintrag
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Jahresurlaub</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{quota - totalAnnual}</div>
            <p className="text-xs text-muted-foreground">{totalAnnual} von {quota} Tagen genommen</p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, totalAnnual / quota * 100)}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Krankheitstage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalIllness}</div>
            <p className="text-xs text-muted-foreground">Tage in {year}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Schulungen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalTraining}</div>
            <p className="text-xs text-muted-foreground">Tage in {year}</p>
          </CardContent>
        </Card>
      </div>

      {/* Entry list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Einträge {year}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Keine Einträge</p>
          ) : (
            <div className="divide-y">
              {entries.map((entry) => {
                const config = TYPE_CONFIG[entry.type]
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-6 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-sm">{formatDate(entry.date_from)}</span>
                    <span className="text-muted-foreground text-sm">→</span>
                    <span className="text-sm">{formatDate(entry.date_to)}</span>
                    <span className="text-sm font-medium">{entry.days} Tage</span>
                    {entry.notes && <span className="text-xs text-muted-foreground truncate flex-1">{entry.notes}</span>}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive ml-auto"
                      onClick={() => handleDelete(entry.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuer Abwesenheitseintrag</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Art</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_CONFIG).map(([v, c]) => (
                    <SelectItem key={v} value={v}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Von</Label>
                <Input type="date" value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Bis</Label>
                <Input type="date" value={form.date_to} min={form.date_from} onChange={(e) => setForm({ ...form, date_to: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Arbeitstage</Label>
              <Input type="number" step="0.5" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Notizen (optional)</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Abbrechen</Button>
            <Button onClick={handleSave}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
