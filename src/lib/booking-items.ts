import type { BookingItemLinkView, BookingItemOption } from "@/types/database"

type QueryClient = {
  from: (table: string) => any
}

type NestedClient = { id?: string; name?: string } | { id?: string; name?: string }[] | null

function one<T extends { id?: string; name?: string }>(value: NestedClient): T | null {
  if (!value) return null
  return (Array.isArray(value) ? value[0] : value) as T
}

export async function loadBookingItemOptions(
  supabase: QueryClient,
  userId: string,
  clientId: string,
): Promise<BookingItemOption[]> {
  const { data: own } = await supabase
    .from("booking_items")
    .select("id, name, client_id")
    .eq("user_id", userId)
    .or(`client_id.eq.${clientId},client_id.is.null`)
    .eq("active", true)
    .order("name")

  const ownRows = (own ?? []) as { id: string; name: string; client_id: string | null }[]
  const ownIds = ownRows.filter((row) => row.client_id === clientId).map((row) => row.id)

  const options: BookingItemOption[] = ownRows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: "own",
  }))

  if (ownIds.length === 0) return options

  const { data: links } = await supabase
    .from("booking_item_links")
    .select("customer_booking_item_id, vermittler_booking_item_id")
    .eq("user_id", userId)
    .in("customer_booking_item_id", ownIds)

  const linkRows = (links ?? []) as {
    customer_booking_item_id: string
    vermittler_booking_item_id: string
  }[]
  const vermittlerIds = [...new Set(linkRows.map((l) => l.vermittler_booking_item_id))]
  if (vermittlerIds.length === 0) return options

  const { data: vermittlerItems } = await supabase
    .from("booking_items")
    .select("id, name, client:clients(id, name)")
    .in("id", vermittlerIds)
    .eq("active", true)
    .order("name")

  // vermittler item id → Vermittler-Kundenname
  const vermittlerClientMap = new Map<string, string>()
  for (const item of vermittlerItems ?? []) {
    const client = one<{ id?: string; name?: string }>(item.client)
    vermittlerClientMap.set(item.id, client?.name ?? "")
  }

  // Kunden-Buchungsposten id → Liste der Vermittler-Kundennamen
  const customerLinkedNames = new Map<string, string[]>()
  for (const link of linkRows) {
    const clientName = vermittlerClientMap.get(link.vermittler_booking_item_id)
    if (clientName) {
      const arr = customerLinkedNames.get(link.customer_booking_item_id) ?? []
      if (!arr.includes(clientName)) arr.push(clientName)
      customerLinkedNames.set(link.customer_booking_item_id, arr)
    }
  }

  // Own-Options um linkedVermittlerNames anreichern
  for (const opt of options) {
    const names = customerLinkedNames.get(opt.id)
    if (names?.length) opt.linkedVermittlerNames = names
  }

  // Vermittler-Options anhängen (für Zeiterfassungs-Dropdowns)
  const seenIds = new Set(options.map((o) => o.id))
  for (const item of vermittlerItems ?? []) {
    if (seenIds.has(item.id)) continue
    seenIds.add(item.id)
    const client = one<{ id?: string; name?: string }>(item.client)
    options.push({
      id: item.id,
      name: item.name,
      kind: "vermittler",
      vermittlerClientName: client?.name,
    })
  }

  return options
}

export function bookingItemOptionLabel(item: BookingItemOption): string {
  if (item.kind === "vermittler" && item.vermittlerClientName) {
    return `${item.name} (${item.vermittlerClientName})`
  }
  return item.name
}

export async function loadBookingItemLinks(
  supabase: QueryClient,
  userId: string,
): Promise<BookingItemLinkView[]> {
  const { data } = await supabase
    .from("booking_item_links")
    .select(`
      id,
      customer_booking_item_id,
      vermittler_booking_item_id,
      customer_item:booking_items!customer_booking_item_id(
        id, name, client_id, client:clients(id, name)
      ),
      vermittler_item:booking_items!vermittler_booking_item_id(
        id, name, client_id, client:clients(id, name)
      )
    `)
    .eq("user_id", userId)

  return (data ?? []).map((row: any) => {
    const customer = one<{ id: string; name: string; client_id: string | null; client: NestedClient }>(row.customer_item)
    const vermittler = one<{ id: string; name: string; client_id: string | null; client: NestedClient }>(row.vermittler_item)
    const customerClient = one<{ id?: string; name?: string }>(customer?.client ?? null)
    const vermittlerClient = one<{ id?: string; name?: string }>(vermittler?.client ?? null)
    return {
      linkId: row.id,
      customerBookingItemId: row.customer_booking_item_id,
      customerBookingItemName: customer?.name ?? "",
      customerClientId: customer?.client_id ?? customerClient?.id ?? null,
      customerClientName: customerClient?.name ?? "",
      vermittlerBookingItemId: row.vermittler_booking_item_id,
      vermittlerBookingItemName: vermittler?.name ?? "",
      vermittlerClientId: vermittler?.client_id ?? vermittlerClient?.id ?? null,
      vermittlerClientName: vermittlerClient?.name ?? "",
    } satisfies BookingItemLinkView
  })
}
