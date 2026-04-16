"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import type { UtilizationTile, UtilizationConfig, Client } from "@/types/database"

interface AddTileDialogProps {
  open: boolean
  hoursPerDay: number
  userId: string
  utilConfig: UtilizationConfig
  onClose: () => void
  onAdd: (tile: UtilizationTile) => void
}

type TileType = "project" | "task" | "booking_item"
type EntityOption = { id: string; name: string; sub?: string }

export function AddTileDialog({ open, hoursPerDay, userId, utilConfig, onClose, onAdd }: AddTileDialogProps) {
  const t = useTranslations("auslastung")
  const tCommon = useTranslations("common")
  const tTime = useTranslations("time")
  const supabase = createClient()

  const [tileType, setTileType] = useState<TileType>(utilConfig.default_type ?? "project")
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState("")
  const [entities, setEntities] = useState<EntityOption[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState("")
  const [budgetInput, setBudgetInput] = useState("")
  const [budgetUnit, setBudgetUnit] = useState<"h" | "MT">(utilConfig.default_unit ?? "h")
  const [period, setPeriod] = useState<"total" | "monthly">("total")
  const [carryOver, setCarryOver] = useState(utilConfig.default_carry_over ?? false)
  const [loading, setLoading] = useState(false)

  // Re-apply defaults when dialog opens
  useEffect(() => {
    if (!open) return
    setTileType(utilConfig.default_type ?? "project")
    setBudgetUnit(utilConfig.default_unit ?? "h")
    setCarryOver(utilConfig.default_carry_over ?? false)
  }, [open])

  // Load clients once on open
  useEffect(() => {
    if (!open) return
    supabase
      .from("clients")
      .select("id, name")
      .eq("user_id", userId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setClients((data as Client[]) ?? []))
  }, [open])

  // Reset entity selection when type or client changes
  useEffect(() => {
    setSelectedEntityId("")
    setEntities([])
    if (tileType === "booking_item") {
      loadEntities("booking_item", "")
    } else if (selectedClientId) {
      loadEntities(tileType, selectedClientId)
    }
  }, [tileType, selectedClientId])

  async function loadEntities(type: TileType, clientId: string) {
    setLoading(true)
    try {
      if (type === "project") {
        let q = supabase
          .from("projects")
          .select("id, name")
          .eq("user_id", userId)
          .eq("active", true)
          .order("name")
        if (clientId) q = q.eq("client_id", clientId)
        const { data } = await q
        setEntities((data ?? []).map((p: any) => ({ id: p.id, name: p.name })))
      } else if (type === "task") {
        let q = supabase
          .from("tasks")
          .select("id, name, project:projects(name)")
          .eq("user_id", userId)
          .eq("active", true)
          .order("name")
        if (clientId) q = q.eq("client_id", clientId)
        setEntities(
          ((await q).data ?? []).map((task: any) => ({
            id: task.id,
            name: task.name,
            sub: task.project?.name,
          }))
        )
      } else {
        const { data } = await supabase
          .from("booking_items")
          .select("id, name")
          .eq("user_id", userId)
          .eq("active", true)
          .order("name")
        setEntities((data ?? []).map((b: any) => ({ id: b.name, name: b.name })))
      }
    } finally {
      setLoading(false)
    }
  }

  function handleAdd() {
    const val = parseFloat(budgetInput)
    if (!selectedEntityId || isNaN(val) || val <= 0) return
    const entity = entities.find((e) => e.id === selectedEntityId)
    if (!entity) return
    const budget_h = budgetUnit === "MT" ? val * hoursPerDay : val
    const tile: UtilizationTile = {
      id: crypto.randomUUID(),
      type: tileType,
      entity_id: selectedEntityId,
      entity_name: entity.name,
      budget_h,
      budget_unit: budgetUnit,
      period,
      carry_over: period === "monthly" ? carryOver : undefined,
    }
    onAdd(tile)
    handleClose()
  }

  function handleClose() {
    setTileType(utilConfig.default_type ?? "project")
    setSelectedClientId("")
    setSelectedEntityId("")
    setEntities([])
    setBudgetInput("")
    setBudgetUnit(utilConfig.default_unit ?? "h")
    setPeriod("total")
    setCarryOver(utilConfig.default_carry_over ?? false)
    onClose()
  }

  const canAdd =
    !!selectedEntityId &&
    !!budgetInput &&
    parseFloat(budgetInput) > 0 &&
    (tileType === "booking_item" || !!selectedClientId)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>{t("selectType")}</Label>
            <div className="flex gap-1">
              {(["project", "task", "booking_item"] as TileType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setTileType(type)}
                  className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
                    tileType === type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent"
                  }`}
                >
                  {type === "project" ? t("typeProject") : type === "task" ? t("typeTask") : t("typeBookingItem")}
                </button>
              ))}
            </div>
          </div>

          {/* Client filter (only for project / task) */}
          {tileType !== "booking_item" && (
            <div className="space-y-1.5">
              <Label>{tTime("client")}</Label>
              <Select
                value={selectedClientId}
                onValueChange={(v) => { setSelectedClientId(v); setSelectedEntityId("") }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tTime("clientPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Entity */}
          <div className="space-y-1.5">
            <Label>
              {tileType === "project" ? t("typeProject") : tileType === "task" ? t("typeTask") : t("typeBookingItem")}
            </Label>
            <Select
              value={selectedEntityId}
              onValueChange={setSelectedEntityId}
              disabled={tileType !== "booking_item" && !selectedClientId}
            >
              <SelectTrigger>
                <SelectValue placeholder={loading ? "…" : t("selectEntity")} />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span>{e.name}</span>
                    {e.sub && <span className="text-muted-foreground ml-1 text-xs">({e.sub})</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Budget */}
          <div className="space-y-1.5">
            <Label>{t("budgetLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="0.5"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="flex-1"
                placeholder="0"
              />
              <div className="flex gap-1">
                {(["h", "MT"] as const).map((unit) => (
                  <button
                    key={unit}
                    onClick={() => setBudgetUnit(unit)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      budgetUnit === unit
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {unit === "h" ? t("unitH") : t("unitMT")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Period */}
          <div className="space-y-1.5">
            <Label>{t("periodLabel")}</Label>
            <div className="flex gap-1">
              {(["total", "monthly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
                    period === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent"
                  }`}
                >
                  {p === "total" ? t("periodTotal") : t("periodMonthly")}
                </button>
              ))}
            </div>
          </div>

          {/* Carry-over — only shown for monthly */}
          {period === "monthly" && (
            <div className="space-y-1.5">
              <Label>{t("carryOver")}</Label>
              <div className="flex gap-1">
                <button
                  onClick={() => setCarryOver(false)}
                  className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
                    !carryOver
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent"
                  }`}
                >
                  {t("noCarryOver")}
                </button>
                <button
                  onClick={() => setCarryOver(true)}
                  className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
                    carryOver
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent"
                  }`}
                >
                  {t("carryOver")}
                </button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{tCommon("cancel")}</Button>
          <Button onClick={handleAdd} disabled={!canAdd}>{tCommon("add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
