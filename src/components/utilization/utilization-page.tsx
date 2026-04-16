"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import type { UtilizationTile, UtilizationConfig } from "@/types/database"
import { UtilizationTile as TileCard } from "./utilization-tile"
import { AddTileDialog } from "./add-tile-dialog"

interface UtilizationPageProps {
  userId: string
  initialTiles: UtilizationTile[]
  hoursPerDay: number
  utilConfig: UtilizationConfig
}

type TileResult = { consumedH: number; effectiveBudget: number }

function getDateRange(period: "total" | "monthly", selectedMonth: string) {
  if (period === "total") return { gte: undefined, lte: undefined }
  const [y, m] = selectedMonth.split("-").map(Number)
  return {
    gte: `${y}-${String(m).padStart(2, "0")}-01`,
    lte: new Date(y, m, 0).toISOString().slice(0, 10),
  }
}

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function UtilizationPage({ userId, initialTiles, hoursPerDay, utilConfig }: UtilizationPageProps) {
  const t = useTranslations("auslastung")
  const supabase = createClient()

  const [tiles, setTiles] = useState<UtilizationTile[]>(initialTiles)
  const [consumedMap, setConsumedMap] = useState<Record<string, TileResult>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth())
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const hasMonthlyTile = tiles.some((tile) => tile.period === "monthly")

  async function fetchCarryOver(tile: UtilizationTile): Promise<TileResult> {
    const [year, month] = selectedMonth.split("-").map(Number)
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10)

    let q = supabase
      .from("time_entries")
      .select("date, net_h")
      .eq("user_id", userId)
      .lte("date", endDate)
    if (tile.type === "project") q = q.eq("project_id", tile.entity_id)
    else if (tile.type === "task") q = q.eq("task_id", tile.entity_id)
    else q = q.eq("booking_item_text", tile.entity_id)

    const { data } = await q

    // Group by month
    const byMonth: Record<string, number> = {}
    for (const row of (data ?? []) as { date: string; net_h: number }[]) {
      const key = row.date.slice(0, 7)
      byMonth[key] = (byMonth[key] ?? 0) + row.net_h
    }

    // Compute carry-over from all months before selectedMonth
    let carryOver = 0
    for (const m of Object.keys(byMonth).sort()) {
      if (m >= selectedMonth) break
      const available = tile.budget_h + carryOver
      carryOver = Math.max(0, available - byMonth[m])
    }

    return {
      consumedH: byMonth[selectedMonth] ?? 0,
      effectiveBudget: tile.budget_h + carryOver,
    }
  }

  const loadConsumed = useCallback(
    async (tilesToLoad: UtilizationTile[]) => {
      if (tilesToLoad.length === 0) return
      const ids = tilesToLoad.map((tile) => tile.id)
      setLoadingIds((prev) => new Set([...prev, ...ids]))
      try {
        const results = await Promise.all(
          tilesToLoad.map(async (tile): Promise<{ id: string } & TileResult> => {
            if (tile.period === "monthly" && tile.carry_over) {
              return { id: tile.id, ...(await fetchCarryOver(tile)) }
            }
            let q = supabase.from("time_entries").select("net_h").eq("user_id", userId)
            if (tile.type === "project") q = q.eq("project_id", tile.entity_id)
            else if (tile.type === "task") q = q.eq("task_id", tile.entity_id)
            else q = q.eq("booking_item_text", tile.entity_id)
            const { gte, lte } = getDateRange(tile.period, selectedMonth)
            if (gte) q = q.gte("date", gte)
            if (lte) q = q.lte("date", lte)
            const { data } = await q
            const consumedH = ((data ?? []) as { net_h: number }[]).reduce((acc, row) => acc + row.net_h, 0)
            return { id: tile.id, consumedH, effectiveBudget: tile.budget_h }
          })
        )
        setConsumedMap((prev) => {
          const next = { ...prev }
          results.forEach(({ id, consumedH, effectiveBudget }) => {
            next[id] = { consumedH, effectiveBudget }
          })
          return next
        })
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, selectedMonth]
  )

  useEffect(() => {
    if (tiles.length > 0) loadConsumed(tiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, tiles.length, loadConsumed])

  async function saveTiles(newTiles: UtilizationTile[]) {
    setTiles(newTiles)
    const { error } = await supabase
      .from("users_profile")
      .update({ utilization_tiles: newTiles })
      .eq("user_id", userId)
    if (error) toast.error(error.message)
  }

  async function handleAdd(tile: UtilizationTile) {
    const newTiles = [...tiles, tile]
    await saveTiles(newTiles)
    toast.success(t("saved"))
    loadConsumed([tile])
  }

  async function handleDelete(id: string) {
    await saveTiles(tiles.filter((tile) => tile.id !== id))
    toast.success(t("deleted"))
  }

  async function handleUpdate(updated: UtilizationTile) {
    const newTiles = tiles.map((tile) => (tile.id === updated.id ? updated : tile))
    await saveTiles(newTiles)
    // Reload consumed if anything that affects the query changed
    const original = tiles.find((tile) => tile.id === updated.id)
    if (
      original?.period !== updated.period ||
      original?.carry_over !== updated.carry_over
    ) {
      loadConsumed([updated])
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          {hasMonthlyTile && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          )}
          <Button onClick={() => setAddDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {t("addTile")}
          </Button>
        </div>
      </div>

      {tiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
          <p>{t("noTiles")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.map((tile) => (
            <TileCard
              key={tile.id}
              tile={tile}
              consumedH={consumedMap[tile.id]?.consumedH ?? 0}
              effectiveBudget={consumedMap[tile.id]?.effectiveBudget}
              loading={loadingIds.has(tile.id)}
              hoursPerDay={hoursPerDay}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      <AddTileDialog
        open={addDialogOpen}
        hoursPerDay={hoursPerDay}
        userId={userId}
        utilConfig={utilConfig}
        onClose={() => setAddDialogOpen(false)}
        onAdd={handleAdd}
      />
    </div>
  )
}
