"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle } from "lucide-react"

type UserRow = {
  id: string
  user_id: string
  name: string
  email: string
  approval_status: "pending" | "approved" | "rejected"
  approved: boolean
  created_at: string
}

export function UserTable() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/users")
      .then(r => r.json())
      .then(setUsers)
      .finally(() => setLoading(false))
  }, [])

  async function handleAction(userId: string, action: "approve" | "reject") {
    setProcessing(userId)
    const res = await fetch("/api/admin/set-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    })
    if (res.ok) {
      const { newStatus } = await res.json()
      setUsers(prev => prev.map(u =>
        u.user_id === userId
          ? { ...u, approval_status: newStatus, approved: newStatus === "approved" }
          : u
      ))
      toast.success(action === "approve" ? "Nutzer freigeschaltet" : "Registrierung abgelehnt")
    } else {
      toast.error("Aktion fehlgeschlagen")
    }
    setProcessing(null)
  }

  function statusBadge(status: UserRow["approval_status"]) {
    if (status === "approved") {
      return <Badge className="bg-green-100 text-green-800 border border-green-200 hover:bg-green-100">Freigeschaltet</Badge>
    }
    if (status === "rejected") {
      return <Badge className="bg-red-100 text-red-800 border border-red-200 hover:bg-red-100">Abgelehnt</Badge>
    }
    return <Badge className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100">Ausstehend</Badge>
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Wird geladen…</p>
  }

  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Keine Nutzer gefunden.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left font-medium text-muted-foreground py-3 pr-4">Name</th>
            <th className="text-left font-medium text-muted-foreground py-3 pr-4">E-Mail</th>
            <th className="text-left font-medium text-muted-foreground py-3 pr-4">Registriert</th>
            <th className="text-left font-medium text-muted-foreground py-3 pr-4">Status</th>
            <th className="text-right font-medium text-muted-foreground py-3">Aktionen</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map(u => (
            <tr key={u.id} className="hover:bg-muted/30 transition-colors">
              <td className="py-3 pr-4 font-medium">{u.name}</td>
              <td className="py-3 pr-4 text-muted-foreground">{u.email}</td>
              <td className="py-3 pr-4 text-muted-foreground">
                {new Date(u.created_at).toLocaleDateString("de-DE", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                })}
              </td>
              <td className="py-3 pr-4">{statusBadge(u.approval_status)}</td>
              <td className="py-3">
                <div className="flex justify-end gap-2">
                  {u.approval_status !== "approved" && (
                    <Button
                      size="sm" variant="outline"
                      className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
                      disabled={processing === u.user_id}
                      onClick={() => handleAction(u.user_id, "approve")}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Zulassen
                    </Button>
                  )}
                  {u.approval_status !== "rejected" && (
                    <Button
                      size="sm" variant="outline"
                      className="gap-1.5 text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800"
                      disabled={processing === u.user_id}
                      onClick={() => handleAction(u.user_id, "reject")}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Ablehnen
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
