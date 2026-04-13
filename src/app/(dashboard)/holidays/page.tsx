import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getHolidays, type GermanState } from "@/lib/holidays"

const STATE_LABELS: Record<GermanState, string> = {
  "DE-BW": "Baden-Württemberg", "DE-BY": "Bayern", "DE-BE": "Berlin",
  "DE-BB": "Brandenburg", "DE-HB": "Bremen", "DE-HH": "Hamburg",
  "DE-HE": "Hessen", "DE-MV": "Mecklenburg-Vorpommern", "DE-NI": "Niedersachsen",
  "DE-NW": "Nordrhein-Westfalen", "DE-RP": "Rheinland-Pfalz", "DE-SL": "Saarland",
  "DE-SN": "Sachsen", "DE-ST": "Sachsen-Anhalt", "DE-SH": "Schleswig-Holstein",
  "DE-TH": "Thüringen",
}

const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"]

export default async function HolidaysPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("users_profile").select("federal_state").eq("user_id", user.id).single()

  const year = new Date().getFullYear()
  const state = (profile?.federal_state ?? "DE-NW") as GermanState
  const holidays = getHolidays(year, state)

  // Group by month
  const byMonth: Record<number, typeof holidays> = {}
  for (const h of holidays) {
    const m = new Date(h.date).getMonth() + 1
    if (!byMonth[m]) byMonth[m] = []
    byMonth[m].push(h)
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feiertage</h1>
        <p className="text-muted-foreground">{year} — {STATE_LABELS[state]}</p>
      </div>

      <div className="grid gap-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {holidays.length} Feiertage in {STATE_LABELS[state]}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {holidays.map((h) => {
                const d = new Date(h.date)
                const isPast = h.date < today
                const isToday = h.date === today
                return (
                  <div key={h.date} className={`flex items-center gap-2 sm:gap-4 px-4 py-3 ${isPast ? "opacity-50" : ""} ${isToday ? "bg-primary/5" : ""}`}>
                    <div className="w-24 sm:w-28 shrink-0">
                      <div className="text-sm font-medium">
                        {d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                      </div>
                    </div>
                    <div className="flex-1">
                      <span className="text-sm">{h.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isToday && <Badge variant="default" className="text-xs">Heute</Badge>}
                      <Badge variant={h.national ? "default" : "secondary"} className="text-xs">
                        {h.national ? "Bundesweit" : "Landesweit"}
                      </Badge>
                      <span className="text-xs text-muted-foreground w-16 text-right">
                        {MONTH_NAMES[d.getMonth()]}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
