"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { BookingItem, BookingItemLinkView, Client } from "@/types/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface VermittlerLinksEditorProps {
  userId: string
  customerBookingItemId: string
  customerClientId: string
  links: BookingItemLinkView[]
  clients: Client[]
  defaultVermittlerClientId?: string
  onChanged: () => void
}

export function VermittlerLinksEditor({
  userId,
  customerBookingItemId,
  customerClientId,
  links,
  clients,
  defaultVermittlerClientId,
  onChanged,
}: VermittlerLinksEditorProps) {
  const supabase = createClient()
  const [vermittlerClientId, setVermittlerClientId] = useState(defaultVermittlerClientId ?? "")
  const [vermittlerItemId, setVermittlerItemId] = useState("")
  const [vermittlerItems, setVermittlerItems] = useState<BookingItem[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)

  const otherClients = clients.filter((c) => c.id !== customerClientId && c.active)

  useEffect(() => {
    setVermittlerClientId(defaultVermittlerClientId ?? "")
    setVermittlerItemId("")
    setCreating(false)
    setNewName("")
  }, [defaultVermittlerClientId])

  useEffect(() => {
    setVermittlerItemId("")
    setCreating(false)
    setNewName("")
    if (!vermittlerClientId) {
      setVermittlerItems([])
      return
    }
    supabase
      .from("booking_items")
      .select("*")
      .eq("client_id", vermittlerClientId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setVermittlerItems((data ?? []) as BookingItem[]))
  }, [vermittlerClientId, supabase])

  const linkedIds = new Set(links.map((l) => l.vermittlerBookingItemId))
  const availableItems = vermittlerItems.filter((item) => !linkedIds.has(item.id))

  async function addLink(vermittlerBookingItemId: string) {
    setSaving(true)
    const { error } = await supabase.from("booking_item_links").insert({
      user_id: userId,
      customer_booking_item_id: customerBookingItemId,
      vermittler_booking_item_id: vermittlerBookingItemId,
    })
    setSaving(false)
    if (error) {
      toast.error("Fehler: " + error.message)
      return
    }
    toast.success("Vermittler-Buchungsposten verknüpft")
    setVermittlerItemId("")
    onChanged()
  }

  async function createAndLink() {
    if (!newName.trim() || !vermittlerClientId) return
    setSaving(true)
    const { data, error } = await supabase
      .from("booking_items")
      .insert({
        user_id: userId,
        client_id: vermittlerClientId,
        name: newName.trim(),
        active: true,
      })
      .select("id")
      .single()
    if (error || !data) {
      setSaving(false)
      toast.error("Fehler: " + (error?.message ?? "Anlegen fehlgeschlagen"))
      return
    }
    const { error: linkError } = await supabase.from("booking_item_links").insert({
      user_id: userId,
      customer_booking_item_id: customerBookingItemId,
      vermittler_booking_item_id: data.id,
    })
    setSaving(false)
    if (linkError) {
      toast.error("Fehler: " + linkError.message)
      return
    }
    toast.success("Vermittler-Buchungsposten erstellt und verknüpft")
    setCreating(false)
    setNewName("")
    setVermittlerItemId("")
    supabase
      .from("booking_items")
      .select("*")
      .eq("client_id", vermittlerClientId)
      .eq("active", true)
      .order("name")
      .then(({ data: items }) => setVermittlerItems((items ?? []) as BookingItem[]))
    onChanged()
  }

  async function removeLink(linkId: string) {
    const { error } = await supabase.from("booking_item_links").delete().eq("id", linkId)
    if (error) {
      toast.error("Fehler: " + error.message)
      return
    }
    toast.success("Verknüpfung entfernt")
    onChanged()
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <Label>Vermittler-Buchungsposten</Label>
      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine Vermittler-Buchungsposten verknüpft</p>
      ) : (
        <div className="space-y-1">
          {links.map((link) => (
            <div key={link.linkId} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{link.vermittlerBookingItemName}</p>
                <p className="truncate text-xs text-muted-foreground">{link.vermittlerClientName}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeLink(link.linkId)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Select
          value={vermittlerClientId}
          onValueChange={(v) => {
            setVermittlerClientId(v)
            setVermittlerItemId("")
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Vermittler-Kunde wählen..." />
          </SelectTrigger>
          <SelectContent>
            {otherClients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {vermittlerClientId && !creating && (
          <div className="flex gap-2">
            <Select value={vermittlerItemId} onValueChange={setVermittlerItemId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Buchungsposten wählen..." />
              </SelectTrigger>
              <SelectContent>
                {availableItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={!vermittlerItemId || saving}
              onClick={() => addLink(vermittlerItemId)}
            >
              Verknüpfen
            </Button>
          </div>
        )}

        {vermittlerClientId && creating && (
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Neuer Vermittler-Buchungsposten..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  createAndLink()
                }
                if (e.key === "Escape") setCreating(false)
              }}
            />
            <Button type="button" size="sm" disabled={!newName.trim() || saving} onClick={createAndLink}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}

        {vermittlerClientId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-0 text-xs text-primary"
            onClick={() => {
              setCreating((v) => !v)
              setNewName("")
            }}
          >
            {creating ? "Bestehenden Posten wählen" : "Neuen Vermittler-Buchungsposten anlegen"}
          </Button>
        )}
      </div>
    </div>
  )
}
