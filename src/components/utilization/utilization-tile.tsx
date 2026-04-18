"use client"

import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trash2, Pencil, GripVertical } from "lucide-react"
import { formatHours } from "@/lib/utils"
import type { UtilizationTile as TileType } from "@/types/database"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface UtilizationTileProps {
  tile: TileType
  consumedH: number
  effectiveBudget?: number
  loading: boolean
  hoursPerDay: number
  onDelete: (id: string) => void
  onEdit: (tile: TileType) => void
}

function barColor(pct: number) {
  if (pct >= 100) return "bg-red-500"
  if (pct >= 75) return "bg-amber-400"
  return "bg-primary"
}

export function UtilizationTile({
  tile,
  consumedH,
  effectiveBudget,
  loading,
  hoursPerDay,
  onDelete,
  onEdit,
}: UtilizationTileProps) {
  const t = useTranslations("auslastung")

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.id })

  const budgetForCalc = effectiveBudget ?? tile.budget_h
  const pct = budgetForCalc > 0 ? Math.min(100, (consumedH / budgetForCalc) * 100) : 0
  const remainingH = budgetForCalc - consumedH

  function displayValue(h: number) {
    if (tile.budget_unit === "MT") {
      return `${(h / hoursPerDay).toFixed(1)} ${t("unitMT")}`
    }
    return `${formatHours(h)} ${t("unitH")}`
  }

  function typeLabel() {
    if (tile.type === "project") return t("typeProject")
    if (tile.type === "task") return t("typeTask")
    return t("typeBookingItem")
  }

  const rangeDateClass = (() => {
    if (tile.period !== "range" || !tile.date_to) return ""
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const [y, m, d] = tile.date_to.split("-").map(Number)
    const end = new Date(y, m - 1, d)
    const diffDays = Math.floor((end.getTime() - now.getTime()) / 86_400_000)
    if (diffDays < 0) return "text-red-500 font-medium"
    if (diffDays <= 21) return "text-amber-500 font-medium"
    return ""
  })()

  const periodLabel = tile.period === "monthly"
    ? `${t("periodMonthly")}${tile.carry_over ? ` · ${t("carryOver")}` : ""}`
    : tile.period === "range" && tile.date_from && tile.date_to
    ? `${tile.date_from} – ${tile.date_to}`
    : t("periodTotal")

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-col ${isDragging ? "opacity-50 shadow-lg" : ""}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1 min-w-0 flex-1">
            <button
              {...attributes}
              {...listeners}
              className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
              tabIndex={-1}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs shrink-0">{typeLabel()}</Badge>
                <span className="text-sm font-medium truncate">{tile.entity_name}</span>
              </div>
              {tile.client_name && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{tile.client_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(tile)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(tile.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p className={`text-xs ${rangeDateClass || "text-muted-foreground"}`}>{periodLabel}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 pt-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("budget")}</span>
          <span className="font-medium">
            {effectiveBudget !== undefined && effectiveBudget !== tile.budget_h
              ? `${displayValue(effectiveBudget)} (${displayValue(tile.budget_h)}/M)`
              : displayValue(tile.budget_h)}
          </span>
        </div>

        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {loading ? (
            <span>…</span>
          ) : (
            <span>{t("hoursOf", { consumed: displayValue(consumedH), budget: displayValue(budgetForCalc) })}</span>
          )}
          <span className="font-medium">{Math.round(pct)}%</span>
        </div>

        {!loading && (
          <div className={`text-xs font-medium flex items-center justify-between ${remainingH < 0 ? "text-red-500" : "text-muted-foreground"}`}>
            <span>
              {remainingH >= 0
                ? t("remaining", { h: displayValue(remainingH) })
                : t("overdrawn", { h: displayValue(Math.abs(remainingH)) })}
            </span>
            {budgetForCalc > 0 && (
              <span>{Math.round(Math.max(0, 100 - (consumedH / budgetForCalc) * 100))}%</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
