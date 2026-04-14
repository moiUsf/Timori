"use client"

import { useState } from "react"
import * as Popover from "@radix-ui/react-popover"
import { Check, ChevronDown, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Option {
  value: string
  label: string
}

interface MultiSelectFilterProps {
  label: string
  options: Option[]
  selected: string[]
  onChange: (values: string[]) => void
  className?: string
}

export function MultiSelectFilter({ label, options, selected, onChange, className }: MultiSelectFilterProps) {
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(value: string) {
    onChange(selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value]
    )
  }

  const buttonLabel =
    selected.length === 0 ? "Alle" :
    selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? "1 ausgewählt") :
    `${selected.length} ausgewählt`

  return (
    <Popover.Root open={open} onOpenChange={v => { setOpen(v); if (!v) setSearch("") }}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "flex h-8 items-center justify-between gap-1.5 rounded-md border border-input bg-background px-2 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            selected.length > 0 ? "border-primary text-primary font-medium" : "text-foreground",
            className
          )}
        >
          <span className="truncate">{buttonLabel}</span>
          {selected.length > 0 ? (
            <X
              className="h-3 w-3 shrink-0 opacity-60 hover:opacity-100"
              onClick={e => { e.stopPropagation(); onChange([]) }}
            />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-56 rounded-md border bg-popover text-popover-foreground shadow-md outline-none"
          align="start"
          sideOffset={4}
        >
          <div className="p-2 border-b">
            <Input
              autoFocus
              placeholder={`${label} suchen…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">Keine Ergebnisse</p>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent text-left"
                  onClick={() => toggle(opt.value)}
                >
                  <div className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                    selected.includes(opt.value)
                      ? "bg-primary border-primary"
                      : "border-input"
                  )}>
                    {selected.includes(opt.value) && (
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    )}
                  </div>
                  <span className="truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <button
                className="w-full rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground text-left"
                onClick={() => onChange([])}
              >
                Auswahl zurücksetzen
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
