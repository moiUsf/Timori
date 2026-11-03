"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { computeTileUsage, toFreeBudget, type FreeBudget } from "@/lib/utilization"
import { toLocalDateStr } from "@/lib/utils"
import type { UtilizationTile } from "@/types/database"

const EMPTY: Map<string, FreeBudget> = new Map()

/**
 * Freies Budget je Buchungsposten-Name, basierend auf den Auslastungs-Kacheln (Typ booking_item).
 * `date` (YYYY-MM-DD) bestimmt den Monat für monatliche Kacheln.
 */
export function useBookingItemBudgets(
  userId: string | null | undefined,
  clientId: string | null | undefined,
  date: string | null | undefined,
  itemNames: string[],
): Map<string, FreeBudget> {
  const [supabase] = useState(() => createClient())
  const [tiles, setTiles] = useState<UtilizationTile[] | null>(null)
  const [budgets, setBudgets] = useState<Map<string, FreeBudget>>(new Map())

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from("users_profile")
      .select("utilization_tiles")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        const all = (data?.utilization_tiles as UtilizationTile[] | null) ?? []
        setTiles(all.filter((t) => t.type === "booking_item"))
      })
    return () => { cancelled = true }
  }, [supabase, userId])

  const month = (date || toLocalDateStr(new Date())).slice(0, 7)
  const namesKey = [...new Set(itemNames.filter(Boolean))].sort().join("\u0000")

  // Pro Name eine Kachel: bevorzugt die des aktuellen Kunden
  const selectedTiles = useMemo(() => {
    if (!tiles || !namesKey) return []
    const names = new Set(namesKey.split("\u0000"))
    const byName = new Map<string, UtilizationTile>()
    for (const tile of tiles) {
      if (!names.has(tile.entity_id)) continue
      const current = byName.get(tile.entity_id)
      if (!current || (current.client_id !== clientId && tile.client_id === clientId)) {
        byName.set(tile.entity_id, tile)
      }
    }
    return [...byName.values()]
  }, [tiles, namesKey, clientId])

  useEffect(() => {
    if (!userId || selectedTiles.length === 0) return
    let cancelled = false
    Promise.all(
      selectedTiles.map(async (tile) => [tile.entity_id, toFreeBudget(await computeTileUsage(supabase, userId, tile, month))] as const)
    ).then((entries) => {
      if (!cancelled) setBudgets(new Map(entries))
    })
    return () => { cancelled = true }
  }, [supabase, userId, selectedTiles, month])

  return userId && selectedTiles.length > 0 ? budgets : EMPTY
}
