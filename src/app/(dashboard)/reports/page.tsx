import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Download } from "lucide-react"

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()

  const reports = [
    {
      title: "Tätigkeitsbericht",
      description: "Monatliche Zeiterfassung nach Kunden und Projekten",
      href: `/api/export/taetigkeitsbericht?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
    },
    {
      title: "Hauptbericht",
      description: "Zusammenfassung aller Stunden, Codes und Projekte",
      href: `/api/export/hauptbericht?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
    },
    {
      title: "Urlaubsübersicht",
      description: "Jahresübersicht Urlaub, Krankheit und Schulungen",
      href: `/api/export/urlaub?year=${now.getFullYear()}`,
    },
    {
      title: "Überstundenübersicht",
      description: "Jahresübersicht der Überstunden nach Monat",
      href: `/api/export/ueberstunden?year=${now.getFullYear()}`,
    },
    {
      title: "Spesenabrechnung PDF",
      description: "Aktuelle Spesenabrechnung als PDF exportieren",
      href: `/api/export/spesen?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Berichte & Export</h1>
        <p className="text-muted-foreground">PDF und Excel-Exporte deiner Daten</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => (
          <Card key={report.title} className="hover:bg-muted/30 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <CardTitle className="text-base">{report.title}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">{report.description}</CardDescription>
                  </div>
                </div>
                <a
                  href={report.href}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </a>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export-Hinweis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            PDF-Export wird als Pro-Feature in Kürze vollständig verfügbar sein.
            Die Berichte basieren auf deinen erfassten Daten und werden im Format
            deines bisherigen Excel-Berichts ausgegeben.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
