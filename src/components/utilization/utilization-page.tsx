"use client"

import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { computeTileUsage, type TileUsage } from "@/lib/utilization"
import { Button } from "@/components/ui/button"
import { Plus, Search, GripVertical } from "lucide-react"
import { toast } from "sonner"
import type { UtilizationTile, UtilizationConfig } from "@/types/database"
import { UtilizationTile as TileCard } from "./utilization-tile"
import { AddTileDialog } from "./add-tile-dialog"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type CollisionDetection,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface UtilizationPageProps {
  userId: string
  initialTiles: UtilizationTile[]
  hoursPerDay: number
  utilConfig: UtilizationConfig
}

type TileResult = TileUsage

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function UtilizationPage({ userId, initialTiles, hoursPerDay, utilConfig }: UtilizationPageProps) {
  const t = useTranslations("auslastung")
  const tCommon = useTranslations("common")
  const supabase = createClient()

  const [tiles, setTiles] = useState<UtilizationTile[]>(initialTiles)
  const [consumedMap, setConsumedMap] = useState<Record<string, TileResult>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [asOf, setAsOf] = useState("")
  const latestAsOf = useRef("")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingTile, setEditingTile] = useState<UtilizationTile | null>(null)
  const [search, setSearch] = useState("")
  const [clientFilter, setClientFilter] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("utilization_client_filter")
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  function changeAsOf(value: string) {
    latestAsOf.current = value
    setAsOf(value)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeId = String(args.active.id)
    if (activeId.startsWith("group:")) {
      const groupContainers = args.droppableContainers.filter((c) => String(c.id).startsWith("group:"))
      return closestCenter({ ...args, droppableContainers: groupContainers })
    }
    return closestCenter(args)
  }, [])

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)

    // Group-level reorder
    if (activeId.startsWith("group:")) {
      const activeName = activeId.slice(6)
      let overName: string | null = null
      if (overId.startsWith("group:")) {
        overName = overId.slice(6)
      } else {
        const tile = tiles.find((t) => t.id === overId)
        if (tile) overName = tile.client_name ?? ""
      }
      if (overName === null || overName === activeName) return
      const allClientOrder: string[] = []
      const seen = new Set<string>()
      for (const t of tiles) {
        const name = t.client_name ?? ""
        if (!seen.has(name)) { seen.add(name); allClientOrder.push(name) }
      }
      const oldIndex = allClientOrder.indexOf(activeName)
      const newIndex = allClientOrder.indexOf(overName)
      if (oldIndex === -1 || newIndex === -1) return
      const newOrder = arrayMove(allClientOrder, oldIndex, newIndex)
      const byClient = new Map<string, UtilizationTile[]>()
      for (const t of tiles) {
        const name = t.client_name ?? ""
        if (!byClient.has(name)) byClient.set(name, [])
        byClient.get(name)!.push(t)
      }
      const newTiles: UtilizationTile[] = []
      for (const name of newOrder) newTiles.push(...(byClient.get(name) ?? []))
      saveTiles(newTiles)
      return
    }

    // Tile-level reorder (within same group only)
    const activeGroup = tiles.find((t) => t.id === activeId)?.client_name ?? ""
    const overGroup = tiles.find((t) => t.id === overId)?.client_name ?? ""
    if (activeGroup !== overGroup) return
    const oldIndex = tiles.findIndex((t) => t.id === activeId)
    const newIndex = tiles.findIndex((t) => t.id === overId)
    saveTiles(arrayMove(tiles, oldIndex, newIndex))
  }

  // Unique client names across all tiles for the filter chips
  const clientNames = useMemo(() => {
    const names = new Set<string>()
    tiles.forEach((t) => names.add(t.client_name ?? ""))
    return [...names].sort((a, b) => {
      if (a === "") return 1
      if (b === "") return -1
      return a.localeCompare(b)
    })
  }, [tiles])

  // Filtered tiles (search + client filter)
  const visibleTiles = useMemo(() => {
    let result = tiles
    const q = search.trim().toLowerCase()
    if (q) result = result.filter((t) => t.entity_name.toLowerCase().includes(q))
    if (clientFilter.length > 0) result = result.filter((t) => clientFilter.includes(t.client_name ?? ""))
    return result
  }, [tiles, search, clientFilter])

  // Group visible tiles by client name in first-appearance order (user-controlled via DnD)
  const groups = useMemo(() => {
    const map = new Map<string, UtilizationTile[]>()
    const order: string[] = []
    visibleTiles.forEach((t) => {
      const key = t.client_name ?? ""
      if (!map.has(key)) { map.set(key, []); order.push(key) }
      map.get(key)!.push(t)
    })
    return order.map((key) => [key, map.get(key)!] as [string, UtilizationTile[]])
  }, [visibleTiles])

  const loadConsumed = useCallback(
    async (tilesToLoad: UtilizationTile[]) => {
      if (tilesToLoad.length === 0) return
      const ids = tilesToLoad.map((tile) => tile.id)
      setLoadingIds((prev) => new Set([...prev, ...ids]))
      const month = asOf ? asOf.slice(0, 7) : currentYearMonth()
      try {
        const results = await Promise.all(
          tilesToLoad.map(async (tile): Promise<{ id: string } & TileResult> => {
            return { id: tile.id, ...(await computeTileUsage(supabase, userId, tile, month, asOf || undefined)) }
          })
        )
        // Stichtag wurde inzwischen geändert: die neuere Abfrage liefert das Ergebnis
        if (latestAsOf.current !== asOf) return
        setConsumedMap((prev) => {
          const next = { ...prev }
          results.forEach(({ id, consumedH, effectiveBudget }) => {
            next[id] = { consumedH, effectiveBudget }
          })
          return next
        })
      } finally {
        if (latestAsOf.current === asOf) {
          setLoadingIds((prev) => {
            const next = new Set(prev)
            ids.forEach((id) => next.delete(id))
            return next
          })
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, asOf]
  )

  useEffect(() => {
    if (tiles.length > 0) loadConsumed(tiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles.length, loadConsumed])

  async function saveTiles(newTiles: UtilizationTile[]): Promise<boolean> {
    const prev = tiles
    setTiles(newTiles)
    const { data: saved, error } = await supabase
      .from("users_profile")
      .update({ utilization_tiles: newTiles })
      .eq("user_id", userId)
      .select("id")
    if (error || !saved?.length) {
      setTiles(prev)
      toast.error(error?.message ?? "Speichern fehlgeschlagen – Profil nicht gefunden")
      return false
    }
    return true
  }

  async function handleAdd(tile: UtilizationTile) {
    const newTiles = [...tiles, tile]
    const ok = await saveTiles(newTiles)
    if (ok) {
      toast.success(t("saved"))
      loadConsumed([tile])
    }
  }

  async function handleDelete(id: string) {
    const ok = await saveTiles(tiles.filter((tile) => tile.id !== id))
    if (ok) toast.success(t("deleted"))
  }

  async function handleUpdate(updated: UtilizationTile) {
    const newTiles = tiles.map((tile) => (tile.id === updated.id ? updated : tile))
    const ok = await saveTiles(newTiles)
    if (ok) {
      toast.success(t("saved"))
      loadConsumed([updated])
    }
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2 max-lg:flex-wrap">
          {tiles.length > 0 && (
            <>
              {asOf && (
                <Button variant="ghost" size="sm" onClick={() => changeAsOf("")}>
                  {t("asOfReset")}
                </Button>
              )}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                {t("asOf")}
                <input
                  type="date"
                  value={asOf}
                  onChange={(e) => changeAsOf(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </label>
            </>
          )}
          <Button onClick={() => setAddDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {t("addTile")}
          </Button>
        </div>
      </div>

      {/* Search + client filter */}
      {tiles.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder={tCommon("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {clientNames.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => {
                  setClientFilter([])
                  localStorage.setItem("utilization_client_filter", JSON.stringify([]))
                }}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  clientFilter.length === 0
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-accent"
                }`}
              >
                {t("allClients")}
              </button>
              {clientNames.map((name) => {
                const active = clientFilter.includes(name)
                return (
                  <button
                    key={name || "__no_client__"}
                    onClick={() => {
                      const next = active
                        ? clientFilter.filter((n) => n !== name)
                        : [...clientFilter, name]
                      setClientFilter(next)
                      localStorage.setItem("utilization_client_filter", JSON.stringify(next))
                    }}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {name || t("noClient")}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tile groups */}
      {tiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
          <p>{t("noTiles")}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
          <p>{tCommon("noResults")}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={onDragEnd}>
          <SortableContext items={groups.map(([name]) => `group:${name}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-6">
              {groups.map(([clientName, groupTiles]) => (
                <SortableGroup
                  key={clientName || "__no_client__"}
                  clientName={clientName}
                  showHeader={clientNames.length > 1}
                  headerLabel={clientName || t("noClient")}
                >
                  <SortableContext items={groupTiles.map((t) => t.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {groupTiles.map((tile) => (
                        <TileCard
                          key={tile.id}
                          tile={tile}
                          consumedH={consumedMap[tile.id]?.consumedH ?? 0}
                          effectiveBudget={consumedMap[tile.id]?.effectiveBudget}
                          loading={loadingIds.has(tile.id)}
                          hoursPerDay={hoursPerDay}
                          asOf={asOf || undefined}
                          onDelete={handleDelete}
                          onEdit={setEditingTile}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </SortableGroup>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AddTileDialog
        open={addDialogOpen}
        hoursPerDay={hoursPerDay}
        userId={userId}
        utilConfig={utilConfig}
        onClose={() => setAddDialogOpen(false)}
        onSave={handleAdd}
      />
      <AddTileDialog
        open={!!editingTile}
        hoursPerDay={hoursPerDay}
        userId={userId}
        utilConfig={utilConfig}
        initialTile={editingTile ?? undefined}
        onClose={() => setEditingTile(null)}
        onSave={handleUpdate}
      />
    </div>
  )
}

interface SortableGroupProps {
  clientName: string
  showHeader: boolean
  headerLabel: string
  children: ReactNode
}

function SortableGroup({ clientName, showHeader, headerLabel, children }: SortableGroupProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `group:${clientName}` })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`space-y-3 ${isDragging ? "opacity-50" : ""}`}
    >
      {showHeader && (
        <div className="flex items-center gap-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            tabIndex={-1}
            aria-label="Gruppe verschieben"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {headerLabel}
          </h2>
        </div>
      )}
      {children}
    </div>
  )
}
