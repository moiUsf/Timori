# Vermittler-Kunden & Buchungsposten-Links

**Datum:** 2026-11-02

---

## Kontext & Ziel

Freelancer arbeiten oft über Vermittler (Recruiter/Agenturen). Ein Endkunde (z. B. SAP AG) hat einen Buchungsposten "Support". Der Vermittler (z. B. Recrutio GmbH) hat dazu einen eigenen Buchungsposten mit Budget (z. B. "Support Phase 1", 100h). Wenn dieses Budget erschöpft ist, legt der Vermittler einen neuen Posten an ("Support Phase 2", 100h) — beide verknüpft mit demselben Endkunden-Buchungsposten.

Das Feature ermöglicht:
1. Kunden als Vermittler markieren (Flag)
2. Einem Endkunden-Kunden einen Standard-Vermittler zuweisen
3. Einem Buchungsposten mehrere Vermittler-Buchungsposten zuordnen (bereits durch Migration 009 möglich)
4. In der Auslastung: Kunden-Buchungsposten inkl. Vermittler-Kontext anzeigen und als Tiles tracken

---

## Teil 1: DB-Migration 010

Zwei neue Spalten auf der `clients`-Tabelle:

```sql
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_vermittler boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vermittler_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
```

**Regeln:**
- Ein Vermittler-Kunde (`is_vermittler = true`) darf keinen `vermittler_client_id` haben (kein Vermittler für Vermittler)
- Diese Regel wird im UI durchgesetzt (kein DB-Constraint nötig)

**Type-Update `database.ts`:**
```typescript
interface Client {
  // ... bestehende Felder
  is_vermittler: boolean
  vermittler_client_id: string | null
}
```

---

## Teil 2: Client-Formular

Im bestehenden Kunden-Dialog (anlegen & bearbeiten) auf der Clients-Seite — **zwei neue Felder am Ende des Formulars**:

### "Ist Vermittler"-Toggle
- Switch-Komponente, Label: "Dieser Kunde ist ein Vermittler"
- Wenn aktiviert: `vermittler_client_id`-Feld wird ausgeblendet (Vermittler hat keinen eigenen Vermittler)
- Wenn deaktiviert: Standard-Vermittler-Feld wird sichtbar

### "Standard-Vermittler"-Dropdown
- Zeigt nur Kunden mit `is_vermittler = true` aus der Kunden-Liste
- Wert: `vermittler_client_id`
- Placeholder: "Kein Vermittler"
- Leerauswahl möglich (keinen Vermittler zuweisen)
- Nur sichtbar wenn `is_vermittler = false`

---

## Teil 3: VermittlerLinksEditor — Default-Vermittler vorausfüllen

In `vermittler-links-editor.tsx`:

Der Editor erhält einen neuen optionalen Prop `defaultVermittlerClientId?: string`.

Wenn gesetzt (Kunde hat Standard-Vermittler):
- Das "Vermittler-Kunde wählen"-Dropdown ist beim Öffnen automatisch auf diesen Kunden vorausgewählt
- Der Nutzer sieht sofort die verfügbaren Buchungsposten des Standard-Vermittlers
- Kann manuell auf einen anderen Vermittler-Kunden wechseln

In `clients/page.tsx` wird `defaultVermittlerClientId={editingClient?.vermittler_client_id ?? undefined}` an den Editor übergeben — `editingClient` ist der gerade bearbeitete Kunden-Datensatz.

---

## Teil 4: Auslastung — Tile-Erstellung

### Problem
Aktuell zeigt `add-tile-dialog.tsx` beim Typ `booking_item` sowohl eigene als auch Vermittler-Buchungsposten. Das ist verwirrend und unvollständig (kein Kontext zu verknüpften Vermittlern).

### Lösung

**`loadBookingItemOptions` erweitern:**
`BookingItemOption` bekommt ein neues optionales Feld:
```typescript
type BookingItemOption = {
  id: string
  name: string
  kind: "own" | "vermittler"
  vermittlerClientName?: string       // für vermittler-Items
  linkedVermittlerNames?: string[]    // für own-Items: Namen verknüpfter Vermittler-Kunden
}
```

Die Funktion befüllt `linkedVermittlerNames` für "own"-Items: wenn ein eigener Buchungsposten Links hat, werden die Vermittler-Kundennamen gesammelt und mitgegeben.

**`add-tile-dialog.tsx` — nur "own"-Items zeigen:**

Wenn `clientId` gewählt und `tileType === "booking_item"`:
- Nur Items mit `kind === "own"` anzeigen
- `sub`-Label: Vermittler-Kundennamen falls vorhanden, z. B. `"via Recrutio GmbH, Headhunter AG"`
- `entity_id` bleibt der Buchungsposten-**Name** (bestehende Tracking-Logik bleibt unverändert)

**Warum Name als entity_id beibehalten:**
Zeiteinträge speichern `booking_item_text` (Name, kein FK). Da der Scope für Berichte/Exporte vorerst nicht geändert werden soll, bleibt die Tracking-Logik unverändert. Zwei gleichnamige Buchungsposten würden zusammen getrackt — das ist in der Praxis kein Problem, da Phasen eines Vermittlers unterschiedliche Namen haben.

---

## Dateien die geändert werden

| Datei | Änderung |
|---|---|
| `supabase/migrations/010_vermittler_client.sql` | Neue Migration |
| `src/types/database.ts` | `Client` + `BookingItemOption` erweitern |
| `src/lib/booking-items.ts` | `loadBookingItemOptions` + `linkedVermittlerNames` |
| `src/app/(dashboard)/clients/page.tsx` | Client-Form: is_vermittler + vermittler_client_id |
| `src/components/clients/vermittler-links-editor.tsx` | Prop `defaultVermittlerClientId` |
| `src/components/utilization/add-tile-dialog.tsx` | Nur own-Items, sub-Label mit Vermittler |

---

## Was NICHT geändert wird (bewusst)

- Zeiteinträge: kein `booking_item_id` FK (würde Berichte/Exporte brechen)
- Berichte & Exporte: kein Vermittler-Bezug vorerst
- `entity_id` in Tiles: bleibt Name-basiert für Backward-Kompatibilität
