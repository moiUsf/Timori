"use client"

import { useTranslations } from "next-intl"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, Pencil } from "lucide-react"
import { formatHours } from "@/lib/utils"
import type { UtilizationTile as TileType } from "@/types/database"
import { useState } from "react"

interface UtilizationTileProps {
  tile: TileType
  consumedH: number
  effectiveBudget?: number   // set for monthly carry-over tiles, overrides tile.budget_h
  loading: boolean
  hoursPerDay: number
  onDelete: (id: string) => void
  onUpdate: (updated: TileType) => void
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
  onUpdate,
}: UtilizationTileProps) {
  const t = useTranslations("auslastung")
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState("")

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

  function startEditBudget() {
    const currentDisplay =
      tile.budget_unit === "MT"
        ? (tile.budget_h / hoursPerDay).toFixed(1)
        : tile.budget_h.toFixed(1)
    setBudgetInput(currentDisplay)
    setEditingBudget(true)
  }

  function commitBudget() {
    const val = parseFloat(budgetInput)
    if (!isNaN(val) && val > 0) {
      const newBudgetH = tile.budget_unit === "MT" ? val * hoursPerDay : val
      onUpdate({ ...tile, budget_h: newBudgetH })
    }
    setEditingBudget(false)
  }

  function toggleUnit() {
    onUpdate({ ...tile, budget_unit: tile.budget_unit === "h" ? "MT" : "h" })
  }

  function togglePeriod(period: "total" | "monthly") {
    if (period !== tile.period) onUpdate({ ...tile, period })
  }

  function toggleCarryOver(carry_over: boolean) {
    if (carry_over !== !!tile.carry_over) onUpdate({ ...tile, carry_over })
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Badge variant="secondary" className="text-xs shrink-0">{typeLabel()}</Badge>
            <span className="text-sm font-medium truncate">{tile.entity_name}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(tile.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Period toggle */}
        <div className="flex gap-1 mt-1">
          {(["total", "monthly"] as const).map((p) => (
            <button
              key={p}
              onClick={() => togglePeriod(p)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                tile.period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {p === "total" ? t("periodTotal") : t("periodMonthly")}
            </button>
          ))}
        </div>

        {/* Carry-over toggle — only for monthly */}
        {tile.period === "monthly" && (
          <div className="flex gap-1">
            <button
              onClick={() => toggleCarryOver(false)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                !tile.carry_over
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {t("noCarryOver")}
            </button>
            <button
              onClick={() => toggleCarryOver(true)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                tile.carry_over
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {t("carryOver")}
            </button>
          </div>
        )}

        {/* Unit toggle */}
        <div className="flex gap-1">
          {(["h", "MT"] as const).map((unit) => (
            <button
              key={unit}
              onClick={toggleUnit}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                tile.budget_unit === unit
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {unit === "h" ? t("unitH") : t("unitMT")}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 pt-0">
        {/* Budget row */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("budget")}</span>
          {editingBudget ? (
            <Input
              autoFocus
              className="h-6 w-24 text-xs text-right px-1"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              onBlur={commitBudget}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitBudget()
                if (e.key === "Escape") setEditingBudget(false)
              }}
            />
          ) : (
            <button className="flex items-center gap-1 group" onClick={startEditBudget}>
              <span className="font-medium">
                {/* Show effective budget for carry-over tiles */}
                {effectiveBudget !== undefined && effectiveBudget !== tile.budget_h
                  ? `${displayValue(effectiveBudget)} (${displayValue(tile.budget_h)}/M)`
                  : displayValue(tile.budget_h)}
              </span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Consumed / budget */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {loading ? (
            <span>…</span>
          ) : (
            <span>{t("hoursOf", { consumed: displayValue(consumedH), budget: displayValue(budgetForCalc) })}</span>
          )}
          <span className="font-medium">{Math.round(pct)}%</span>
        </div>

        {/* Remaining / overdrawn */}
        {!loading && (
          <div className={`text-xs font-medium ${remainingH < 0 ? "text-red-500" : "text-muted-foreground"}`}>
            {remainingH >= 0
              ? t("remaining", { h: displayValue(remainingH) })
              : t("overdrawn", { h: displayValue(Math.abs(remainingH)) })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
