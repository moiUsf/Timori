import { cn } from "@/lib/utils"
import type { FreeBudget } from "@/lib/utilization"

function fmtH(h: number) {
  return h.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

type BudgetState = "free" | "used" | "over"

function budgetState(b: FreeBudget): BudgetState {
  // Rundung auf 0,1 h, damit Kleinstreste nicht als "frei" gelten
  const rounded = Math.round(b.freeH * 10) / 10
  if (rounded > 0) return "free"
  if (rounded === 0) return "used"
  return "over"
}

// Farben analog zu den Auslastungs-Kacheln: < 75 % verbraucht grün, ab 75 % gelb, ab 100 % rot
function toneClass(b: FreeBudget) {
  const state = budgetState(b)
  if (state !== "free") return "text-red-500"
  if (b.freePct <= 25) return "text-amber-500"
  return "text-green-600 dark:text-green-500"
}

function budgetText(b: FreeBudget) {
  switch (budgetState(b)) {
    case "free": return `Budget frei: ${b.freePct} % · ${fmtH(b.freeH)} h`
    case "used": return "Budget aufgebraucht"
    case "over": return `Budget überzogen · ${fmtH(-b.freeH)} h`
  }
}

/** Für Dropdown-Einträge (rechts neben dem Namen) */
export function BudgetHint({ budget }: { budget?: FreeBudget }) {
  if (!budget) return null
  return <span className={toneClass(budget)}>{budgetText(budget)}</span>
}

/** Zeile unter dem Select nach der Auswahl */
export function BudgetLine({ budget }: { budget?: FreeBudget }) {
  if (!budget) return null
  return <p className={cn("text-xs tabular-nums", toneClass(budget))}>{budgetText(budget)}</p>
}
