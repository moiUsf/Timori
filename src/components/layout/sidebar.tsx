"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  Clock, LayoutDashboard, CalendarDays, TrendingUp, Receipt,
  Users, FileText, Settings, LogOut, Umbrella
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { UserProfile } from "@/types/database"
import type { User } from "@supabase/supabase-js"

interface SidebarProps {
  user: User
  profile: UserProfile
  onClose?: () => void
}

export function Sidebar({ user, profile, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations("nav")

  const navItems = [
    { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/time", label: t("time"), icon: Clock },
    { href: "/vacation", label: t("vacation"), icon: Umbrella },
    { href: "/overtime", label: t("overtime"), icon: TrendingUp },
    { href: "/holidays", label: t("holidays"), icon: CalendarDays },
    { href: "/expenses", label: t("expenses"), icon: Receipt },
    { href: "/clients", label: t("clients"), icon: Users },
    { href: "/reports", label: t("reports"), icon: FileText },
  ]

  async function handleLogout() {
    await supabase.auth.signOut()
    onClose?.()
    router.push("/login")
    router.refresh()
  }

  return (
    <aside className="flex w-60 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <Clock className="h-6 w-6" />
        <span className="text-lg font-bold tracking-tight">Timori</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t p-3 space-y-0.5">
        <Link
          href="/settings"
          onClick={onClose}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/settings"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Settings className="h-4 w-4" />
          {t("settings")}
        </Link>
        <div className="px-3 py-2">
          <p className="text-xs font-medium truncate">{profile.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </button>
      </div>
    </aside>
  )
}
