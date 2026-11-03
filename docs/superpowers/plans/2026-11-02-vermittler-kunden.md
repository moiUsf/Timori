# Vermittler-Kunden & Buchungsposten-Links — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kunden als Vermittler markieren, Standard-Vermittler pro Kunde zuweisen, und Vermittler-Kontext in Buchungsposten-Dialogen und Auslastungs-Tiles anzeigen.

**Architecture:** DB-Migration fügt `is_vermittler` und `vermittler_client_id` zu `clients` hinzu. Das Client-Formular bekommt zwei neue Felder. Der `VermittlerLinksEditor` erhält einen `defaultVermittlerClientId`-Prop zum Vorausfüllen. `loadBookingItemOptions` wird um `linkedVermittlerNames` für eigene Items erweitert. Der `AddTileDialog` zeigt nur eigene Buchungsposten mit Vermittler-Sub-Label.

**Tech Stack:** Next.js 16, Supabase, TypeScript, shadcn/ui (Switch, Select)

---

## Dateienübersicht

| Datei | Aktion |
|---|---|
| `supabase/migrations/010_vermittler_client.sql` | Neu anlegen |
| `src/types/database.ts` | `Client` + `BookingItemOption` erweitern |
| `src/lib/booking-items.ts` | `loadBookingItemOptions` um `linkedVermittlerNames` |
| `src/app/(dashboard)/clients/page.tsx` | Form-State, saveClient, UI, VermittlerLinksEditor-Prop |
| `src/components/clients/vermittler-links-editor.tsx` | `defaultVermittlerClientId`-Prop |
| `src/components/utilization/add-tile-dialog.tsx` | Nur own-Items, Vermittler-Sub-Label |

---

## Task 1: Migration 010

**Files:**
- Create: `supabase/migrations/010_vermittler_client.sql`

- [ ] **Schritt 1: Migrationsdatei anlegen**

Inhalt der Datei:

```sql
-- Migration 010: Vermittler-Flag und Standard-Vermittler für Kunden
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_vermittler boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vermittler_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
```

- [ ] **Schritt 2: Migration in Supabase ausführen**

In Supabase SQL Editor (`https://app.supabase.com` → Projekt → SQL Editor) den obigen SQL-Inhalt einfügen und **Run** klicken.

Erwartetes Ergebnis: Kein Fehler, Tabelle `clients` hat zwei neue Spalten.

- [ ] **Schritt 3: Commit**

```bash
git add supabase/migrations/010_vermittler_client.sql
git commit -m "feat: migration 010 — Vermittler-Flag und Standard-Vermittler auf clients"
```

---

## Task 2: TypeScript-Typen

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Schritt 1: `Client`-Interface erweitern**

In `src/types/database.ts`, das `Client`-Interface (nach `created_at`-Zeile) um zwei Felder ergänzen:

```typescript
export interface Client {
  id: string
  user_id: string
  name: string
  client_nr: string | null
  country: string
  active: boolean
  default_remote: boolean
  budget_h: number | null
  budget_unit: "h" | "MT" | null
  budget_period: "total" | "monthly" | "range" | null
  budget_carry_over: boolean | null
  budget_date_from: string | null
  budget_date_to: string | null
  is_vermittler: boolean
  vermittler_client_id: string | null
  created_at: string
}
```

- [ ] **Schritt 2: `BookingItemOption`-Typ erweitern**

Den bestehenden `BookingItemOption`-Typ (in derselben Datei) um `linkedVermittlerNames` ergänzen:

```typescript
export type BookingItemOption = {
  id: string
  name: string
  kind: "own" | "vermittler"
  vermittlerClientName?: string
  linkedVermittlerNames?: string[]
}
```

- [ ] **Schritt 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: Client + BookingItemOption Typen um Vermittler-Felder erweitern"
```

---

## Task 3: `loadBookingItemOptions` erweitern

**Files:**
- Modify: `src/lib/booking-items.ts`

- [ ] **Schritt 1: Funktion ersetzen**

Die gesamte `loadBookingItemOptions`-Funktion in `src/lib/booking-items.ts` (Zeilen 14–68) durch folgende Version ersetzen:

```typescript
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
```

- [ ] **Schritt 2: Commit**

```bash
git add src/lib/booking-items.ts
git commit -m "feat: loadBookingItemOptions mit linkedVermittlerNames für eigene Buchungsposten"
```

---

## Task 4: Client-Formular

**Files:**
- Modify: `src/app/(dashboard)/clients/page.tsx`

- [ ] **Schritt 1: `clientForm`-State erweitern**

Den `useState`-Aufruf für `clientForm` (ca. Zeile 56) um zwei neue Felder ergänzen:

```typescript
const [clientForm, setClientForm] = useState({
  name: "",
  client_nr: "",
  country: "DE",
  default_remote: false,
  budget_value: "",
  budget_unit: "MT" as "h" | "MT",
  budget_period: "monthly" as "total" | "monthly" | "range",
  budget_carry_over: false,
  budget_date_from: "",
  budget_date_to: "",
  is_vermittler: false,
  vermittler_client_id: "",
})
```

- [ ] **Schritt 2: `resetClientForm` aktualisieren**

```typescript
function resetClientForm() {
  setClientForm({
    name: "", client_nr: "", country: "DE", default_remote: false,
    budget_value: "", budget_unit: "MT", budget_period: "monthly",
    budget_carry_over: false, budget_date_from: "", budget_date_to: "",
    is_vermittler: false, vermittler_client_id: "",
  })
}
```

- [ ] **Schritt 3: `saveClient` payload erweitern**

In `saveClient` (ca. Zeile 194), das `payload`-Objekt um die neuen Felder ergänzen:

```typescript
const payload = {
  name: clientForm.name,
  client_nr: clientForm.client_nr,
  country: clientForm.country,
  default_remote: clientForm.default_remote,
  budget_h,
  budget_unit: hasBudget ? clientForm.budget_unit : null,
  budget_period: hasBudget ? clientForm.budget_period : null,
  budget_carry_over: hasBudget && clientForm.budget_period === "monthly" ? clientForm.budget_carry_over : null,
  budget_date_from: hasBudget && clientForm.budget_period === "range" ? clientForm.budget_date_from : null,
  budget_date_to: hasBudget && clientForm.budget_period === "range" ? clientForm.budget_date_to : null,
  is_vermittler: clientForm.is_vermittler,
  vermittler_client_id: !clientForm.is_vermittler && clientForm.vermittler_client_id
    ? clientForm.vermittler_client_id
    : null,
}
```

- [ ] **Schritt 4: Edit-Prefill aktualisieren**

Im `onClick` des Bearbeiten-Buttons (ca. Zeile 511, `setClientForm({...})`), die neuen Felder hinzufügen:

```typescript
setClientForm({
  name: client.name,
  client_nr: client.client_nr ?? "",
  country: client.country,
  default_remote: client.default_remote ?? false,
  budget_value: value,
  budget_unit: unit,
  budget_period: client.budget_period ?? "monthly",
  budget_carry_over: client.budget_carry_over ?? false,
  budget_date_from: client.budget_date_from ?? "",
  budget_date_to: client.budget_date_to ?? "",
  is_vermittler: client.is_vermittler ?? false,
  vermittler_client_id: client.vermittler_client_id ?? "",
})
```

- [ ] **Schritt 5: Vermittler-UI im Client-Dialog einfügen**

Direkt vor `<DialogFooter ...>` (ca. Zeile 998) im Client-Dialog folgenden Block einfügen:

```tsx
{/* Vermittler-Einstellungen */}
<div className="space-y-3 border-t pt-4">
  <div className="flex items-center justify-between">
    <Label htmlFor="is_vermittler">Dieser Kunde ist ein Vermittler</Label>
    <Switch
      id="is_vermittler"
      checked={clientForm.is_vermittler}
      onCheckedChange={(v) =>
        setClientForm({ ...clientForm, is_vermittler: v, vermittler_client_id: "" })
      }
    />
  </div>
  {!clientForm.is_vermittler && (
    <div className="space-y-1.5">
      <Label>Standard-Vermittler</Label>
      <Select
        value={clientForm.vermittler_client_id || "_none"}
        onValueChange={(v) =>
          setClientForm({ ...clientForm, vermittler_client_id: v === "_none" ? "" : v })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Kein Vermittler" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">— Kein Vermittler —</SelectItem>
          {clients
            .filter((c) => c.is_vermittler && c.id !== editingClient?.id)
            .map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  )}
</div>
```

- [ ] **Schritt 6: `defaultVermittlerClientId`-Prop an `VermittlerLinksEditor` übergeben**

Den bestehenden `VermittlerLinksEditor`-Aufruf (Zeilen 1118–1131) ersetzen:

```tsx
{editingBooking && bookingForm.client_id && !bookingLinks.some((l) => l.vermittlerBookingItemId === editingBooking.id) && (
  <VermittlerLinksEditor
    userId={userId}
    customerBookingItemId={editingBooking.id}
    customerClientId={bookingForm.client_id}
    links={bookingLinks.filter((l) => l.customerBookingItemId === editingBooking.id)}
    clients={clients}
    defaultVermittlerClientId={
      clients.find((c) => c.id === bookingForm.client_id)?.vermittler_client_id ?? undefined
    }
    onChanged={() => {
      loadBookingLinks(userId)
      loadAllBookings(userId)
      loadProjects(bookingForm.client_id)
    }}
  />
)}
```

- [ ] **Schritt 7: Commit**

```bash
git add "src/app/(dashboard)/clients/page.tsx"
git commit -m "feat: Vermittler-Flag und Standard-Vermittler im Client-Formular"
```

---

## Task 5: `VermittlerLinksEditor` — Default-Vorausfüllung

**Files:**
- Modify: `src/components/clients/vermittler-links-editor.tsx`

- [ ] **Schritt 1: Prop hinzufügen**

Das Interface `VermittlerLinksEditorProps` um den neuen Prop erweitern:

```typescript
interface VermittlerLinksEditorProps {
  userId: string
  customerBookingItemId: string
  customerClientId: string
  links: BookingItemLinkView[]
  clients: Client[]
  defaultVermittlerClientId?: string
  onChanged: () => void
}
```

- [ ] **Schritt 2: Prop in Funktionssignatur aufnehmen und State initialisieren**

Die Destrukturierung der Props (Zeile 22) erweitern:

```typescript
export function VermittlerLinksEditor({
  userId,
  customerBookingItemId,
  customerClientId,
  links,
  clients,
  defaultVermittlerClientId,
  onChanged,
}: VermittlerLinksEditorProps) {
```

Den `useState`-Aufruf für `vermittlerClientId` (Zeile 31) anpassen:

```typescript
const [vermittlerClientId, setVermittlerClientId] = useState(defaultVermittlerClientId ?? "")
```

- [ ] **Schritt 3: `useEffect` zum Aktualisieren bei Prop-Änderung hinzufügen**

Direkt nach den `useState`-Deklarationen (nach Zeile 36) einfügen:

```typescript
useEffect(() => {
  setVermittlerClientId(defaultVermittlerClientId ?? "")
  setVermittlerItemId("")
  setCreating(false)
  setNewName("")
}, [defaultVermittlerClientId])
```

- [ ] **Schritt 4: Commit**

```bash
git add src/components/clients/vermittler-links-editor.tsx
git commit -m "feat: VermittlerLinksEditor vorausfüllen via defaultVermittlerClientId"
```

---

## Task 6: Auslastungs-Tile-Dialog

**Files:**
- Modify: `src/components/utilization/add-tile-dialog.tsx`

- [ ] **Schritt 1: `loadEntities` — `else if (clientId)`-Branch ersetzen**

Den Block (Zeilen 134–140):

```typescript
} else if (clientId) {
  const options = await loadBookingItemOptions(supabase, userId, clientId)
  setEntities(options.map((b) => ({
    id: b.name,
    name: b.name,
    sub: b.kind === "vermittler" ? b.vermittlerClientName : undefined,
  })))
```

durch folgenden ersetzen:

```typescript
} else if (clientId) {
  const options = await loadBookingItemOptions(supabase, userId, clientId)
  setEntities(
    options
      .filter((b) => b.kind === "own")
      .map((b) => ({
        id: b.name,
        name: b.name,
        sub: b.linkedVermittlerNames?.length
          ? `via ${b.linkedVermittlerNames.join(", ")}`
          : undefined,
      }))
  )
```

- [ ] **Schritt 2: Commit**

```bash
git add src/components/utilization/add-tile-dialog.tsx
git commit -m "feat: Auslastung-Tile-Dialog zeigt nur eigene Buchungsposten mit Vermittler-Kontext"
```

---

## Manuelle Verifikation

Nach allen Tasks lokal testen:

1. **Client als Vermittler markieren:** Kunden "Recrutio GmbH" bearbeiten → Toggle "Ist Vermittler" aktivieren → Speichern. In der DB: `is_vermittler = true`.

2. **Standard-Vermittler zuweisen:** Kunden "SAP AG" bearbeiten → Dropdown "Standard-Vermittler" zeigt "Recrutio GmbH" → Auswählen → Speichern. In der DB: `vermittler_client_id = <id von Recrutio>`.

3. **VermittlerLinksEditor vorausgefüllt:** Buchungsposten von "SAP AG" bearbeiten → Abschnitt "Vermittler-Buchungsposten" öffnet sich mit "Recrutio GmbH" bereits vorausgewählt im Dropdown.

4. **Auslastung-Tile:** Neues Tile anlegen → Typ "Buchungsposten" → Kunde "SAP AG" wählen → Buchungsposten-Dropdown zeigt nur eigene Items. Falls ein Item Vermittler-Links hat: Sub-Label `via Recrutio GmbH` sichtbar.

5. **Ohne Vermittler:** Kunden ohne `vermittler_client_id` funktionieren unverändert. VermittlerLinksEditor öffnet sich mit leerem Dropdown.
