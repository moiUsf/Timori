"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"

export type TimerField = "projekt" | "buchungsposten" | "aufgabe" | "beschreibung"
export type TimerFieldItem = { field: TimerField; enabled: boolean }

export const TIMER_DISPLAY_KEY = "timerDisplayFields"
export const DEFAULT_TIMER_FIELDS: TimerFieldItem[] = [
  { field: "projekt", enabled: true },
  { field: "buchungsposten", enabled: true },
  { field: "aufgabe", enabled: true },
  { field: "beschreibung", enabled: true },
]

interface Ctx {
  timerFields: TimerFieldItem[]
  saveTimerFields: (fields: TimerFieldItem[]) => void
}

const TimerDisplayContext = createContext<Ctx>({
  timerFields: DEFAULT_TIMER_FIELDS,
  saveTimerFields: () => {},
})

export function TimerDisplayProvider({ children }: { children: ReactNode }) {
  const [timerFields, setTimerFields] = useState<TimerFieldItem[]>(DEFAULT_TIMER_FIELDS)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_DISPLAY_KEY)
      if (raw) setTimerFields(JSON.parse(raw) as TimerFieldItem[])
    } catch { /* ignore */ }
  }, [])

  function saveTimerFields(fields: TimerFieldItem[]) {
    setTimerFields(fields)
    try {
      localStorage.setItem(TIMER_DISPLAY_KEY, JSON.stringify(fields))
    } catch { /* ignore */ }
  }

  return (
    <TimerDisplayContext.Provider value={{ timerFields, saveTimerFields }}>
      {children}
    </TimerDisplayContext.Provider>
  )
}

export function useTimerDisplay() {
  return useContext(TimerDisplayContext)
}
