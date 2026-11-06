"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

interface VermittlerMissingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingItemName: string
  confirmLabel: string
  onConfirm: () => void
}

/** Rückfrage, wenn ein Buchungsposten mit Vermittler-Verknüpfung ohne Vermittler-BP gebucht wird. */
export function VermittlerMissingDialog({
  open,
  onOpenChange,
  bookingItemName,
  confirmLabel,
  onConfirm,
}: VermittlerMissingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            Kein Vermittler-Buchungsposten gewählt
          </DialogTitle>
          <DialogDescription>
            „{bookingItemName}“ ist mit Vermittler-Buchungsposten verknüpft. Ohne Auswahl zählen die Stunden
            nur für den Kunden-Buchungsposten, nicht für die Kachel des Vermittlers.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zurück zur Auswahl</Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
