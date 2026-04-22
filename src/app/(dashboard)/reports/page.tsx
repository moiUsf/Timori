"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Download } from "lucide-react"
import { TaetigkeitsberichtDialog } from "@/components/reports/taetigkeitsbericht-dialog"
import { HauptberichtDialog } from "@/components/reports/hauptbericht-dialog"
import { DynamischesBerichtDialog } from "@/components/reports/dynamisches-bericht-dialog"

const PLACEHOLDER_REPORTS = [
  { title: "Urlaubsübersicht", description: "Jahresübersicht Urlaub, Krankheit und Schulungen" },
  { title: "Überstundenübersicht", description: "Jahresübersicht der Überstunden nach Monat" },
  { title: "Spesenabrechnung", description: "Aktuelle Spesenabrechnung als PDF exportieren" },
]

export default function ReportsPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hauptberichtOpen, setHauptberichtOpen] = useState(false)
  const [dynamischOpen, setDynamischOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [supabase])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Berichte & Export</h1>
        <p className="text-muted-foreground">PDF und Excel-Exporte deiner Daten</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Tätigkeitsbericht — fully implemented */}
        <Card className="hover:bg-muted/30 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <CardTitle className="text-base">Tätigkeitsbericht</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Monatliche Zeiterfassung nach Kunden und Projekten
                  </CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!userId} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Erstellen
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Hauptbericht */}
        <Card className="hover:bg-muted/30 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <CardTitle className="text-base">Hauptbericht</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Monatliche Übersicht: Stunden, Urlaub, Abwesenheiten pro Tag und Kunde
                  </CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => setHauptberichtOpen(true)} disabled={!userId} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Erstellen
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Dynamisches Bericht */}
        <Card className="hover:bg-muted/30 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <CardTitle className="text-base">Dynamisches Bericht</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Tagesweise kumulierte Stunden nach wählbarer Dimension
                  </CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => setDynamischOpen(true)} disabled={!userId} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Erstellen
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Placeholder cards */}
        {PLACEHOLDER_REPORTS.map(r => (
          <Card key={r.title} className="opacity-60">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <CardTitle className="text-base">{r.title}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">{r.description}</CardDescription>
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled className="gap-1.5 text-xs">
                  Demnächst
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {userId && (
        <TaetigkeitsberichtDialog
          userId={userId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
      {userId && (
        <HauptberichtDialog
          userId={userId}
          open={hauptberichtOpen}
          onOpenChange={setHauptberichtOpen}
        />
      )}
      {userId && (
        <DynamischesBerichtDialog
          userId={userId}
          open={dynamischOpen}
          onOpenChange={setDynamischOpen}
        />
      )}
    </div>
  )
}
