"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { UtilizationPage } from "@/components/utilization/utilization-page"
import type { UtilizationTile, UtilizationConfig } from "@/types/database"

export default function AuslastungPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState("")
  const [tiles, setTiles] = useState<UtilizationTile[]>([])
  const [hoursPerDay, setHoursPerDay] = useState(8)
  const [utilConfig, setUtilConfig] = useState<UtilizationConfig>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from("users_profile")
        .select("utilization_tiles, working_hours_per_day, utilization_config")
        .eq("user_id", user.id)
        .single()
      if (data) {
        setTiles((data.utilization_tiles as UtilizationTile[]) ?? [])
        setHoursPerDay(data.working_hours_per_day ?? 8)
        setUtilConfig((data.utilization_config as UtilizationConfig) ?? {})
      }
      setReady(true)
    })
  }, [])

  if (!ready) return null

  return (
    <div className="p-6">
      <UtilizationPage
        userId={userId}
        initialTiles={tiles}
        hoursPerDay={hoursPerDay}
        utilConfig={utilConfig}
      />
    </div>
  )
}
