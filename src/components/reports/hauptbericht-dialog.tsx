"use client"

import { useState } from "react"
import { FileSpreadsheet, FileText, Download } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { buildHauptberichtData } from "@/lib/reports/hauptbericht-data"
import { generateHauptberichtExcel } from "@/lib/reports/hauptbericht-excel"
import { generateHauptberichtPDF } from "@/lib/reports/hauptbericht-pdf"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface HauptberichtDialogProps {
  userId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function HauptberichtDialog({ userId, open, onOpenChange }: HauptberichtDialogProps) {
  const supabase = createClient()
  const [month, setMonth] = useState(currentYearMonth)
  const [loadingExcel, setLoadingExcel] = useState(false)
  const [loadingPdf, setLoadingPdf] = useState(false)

  async function handleExport(format: "excel" | "pdf") {
    const [year, mon] = month.split("-").map(Number)
    const setLoading = format === "excel" ? setLoadingExcel : setLoadingPdf
    setLoading(true)
    try {
      const data = await buildHauptberichtData(supabase, userId, year, mon)
      const safeName = data.mitarbeiter.replace(/\s+/g, "_") || "Export"
      const fileSuffix = `${safeName}_${year}_${String(mon).padStart(2, "0")}`

      if (format === "excel") {
        const blob = await generateHauptberichtExcel(data)
        triggerDownload(blob, `Hauptbericht_${fileSuffix}.xlsx`)
      } else {
        const blob = generateHauptberichtPDF(data)
        triggerDownload(blob, `Hauptbericht_${fileSuffix}.pdf`)
      }
      toast.success("Hauptbericht heruntergeladen")
    } catch (err) {
      console.error(err)
      toast.error("Fehler beim Erstellen des Berichts")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Hauptbericht erstellen</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Monat</Label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 gap-2"
              onClick={() => handleExport("excel")}
              disabled={loadingExcel || loadingPdf}
            >
              {loadingExcel
                ? <Download className="h-4 w-4 animate-bounce" />
                : <FileSpreadsheet className="h-4 w-4" />
              }
              Excel
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => handleExport("pdf")}
              disabled={loadingExcel || loadingPdf}
            >
              {loadingPdf
                ? <Download className="h-4 w-4 animate-bounce" />
                : <FileText className="h-4 w-4" />
              }
              PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
