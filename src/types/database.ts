export type HourCode = "BEV" | "BENV" | "RZV" | "RZNV"

export interface UtilizationTile {
  id: string
  type: "project" | "task" | "booking_item"
  entity_id: string      // project.id / task.id / booking_item.name (for booking_item!)
  entity_name: string    // denormalized display name
  budget_h: number       // always stored in hours internally
  budget_unit: "h" | "MT"
  period: "total" | "monthly"
  carry_over?: boolean   // monthly only: carry unused budget to next month
}
export type TaetigkeitField = "booking_item" | "task" | "description" | "project"

export interface ReportConfig {
  taetigkeit_fields: TaetigkeitField[]
}

export interface UtilizationConfig {
  default_type?: "project" | "task" | "booking_item"
  default_unit?: "h" | "MT"
  default_carry_over?: boolean
}
export type VacationType = "annual" | "special" | "training" | "illness"
export type ExpenseCategory =
  | "hotel_inland" | "hotel_ausland" | "flug_inland" | "flug_ausland"
  | "bahn_inland" | "bahn_ausland" | "taxi_inland" | "taxi_ausland"
  | "privat_pkw" | "firmenfahrzeug" | "mietwagen" | "vma"
  | "internet" | "porto" | "burobedarf" | "fortbildung"
  | "geschenke_extern" | "geschenke_intern" | "bewirtung" | "sonstiges"

export interface UserProfile {
  id: string
  user_id: string
  name: string
  personal_nr: string | null
  working_hours_per_day: number
  vacation_quota: number
  federal_state: string
  hourly_rate: number | null
  report_config: ReportConfig | null
  utilization_tiles: UtilizationTile[] | null
  utilization_config: UtilizationConfig | null
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  user_id: string
  name: string
  client_nr: string | null
  country: string
  active: boolean
  default_remote: boolean
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  client_id: string
  name: string
  project_nr: string | null
  sub_project: string | null
  category: string | null
  hourly_rate: number | null
  active: boolean
  created_at: string
  client?: Client
}

export interface Task {
  id: string
  user_id: string
  project_id: string | null
  client_id: string | null
  default_booking_item_id: string | null
  name: string
  description: string | null
  active: boolean
  created_at: string
  project?: Project
  default_booking_item?: { id: string; name: string } | null
}

export interface BookingItem {
  id: string
  user_id: string
  client_id: string | null
  name: string
  description: string | null
  active: boolean
  created_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  date: string
  time_from: string
  time_to: string
  break_min: number
  client_id: string
  project_id: string
  code: HourCode
  description: string
  remote: boolean
  gross_h: number
  net_h: number
  task_id: string | null
  booking_item_text: string
  created_at: string
  client?: Client
  project?: Project
  task?: Task
}

export interface ActiveTimer {
  id: string
  user_id: string
  client_id: string
  project_id: string
  code: HourCode
  description: string
  started_at: string
  paused_at: string | null
  total_paused_ms: number
  task_id: string | null
  booking_item_text: string
  created_at: string
  client?: Client
  project?: Project
  task?: Task
}

export interface VacationEntry {
  id: string
  user_id: string
  type: VacationType
  date_from: string
  date_to: string
  days: number
  notes: string | null
  created_at: string
}

export interface OvertimeRecord {
  id: string
  user_id: string
  year: number
  month: number
  buildup_h: number
  reduction_h: number
  carryover_h: number
  created_at: string
}

export interface Holiday {
  id: string
  user_id: string
  year: number
  state: string
  name: string
  date: string
  is_custom: boolean
}

export interface ExpenseReport {
  id: string
  user_id: string
  month: number
  year: number
  travel_nr: string | null
  status: "draft" | "submitted" | "approved"
  created_at: string
  items?: ExpenseItem[]
}

export interface ExpenseItem {
  id: string
  report_id: string
  date: string
  category: ExpenseCategory
  description: string
  amount: number
  km: number | null
  km_rate: number | null
  vma_type: "none" | "partial_8" | "partial_14" | "full_24" | null
  receipt_count: number
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: "free" | "pro" | "lifetime"
  status: "active" | "canceled" | "past_due"
  current_period_end: string | null
}

export interface Database {
  public: {
    Tables: {
      users_profile: { Row: UserProfile; Insert: Omit<UserProfile, "id" | "created_at" | "updated_at">; Update: Partial<UserProfile> }
      clients: { Row: Client; Insert: Omit<Client, "id" | "created_at">; Update: Partial<Client> }
      projects: { Row: Project; Insert: Omit<Project, "id" | "created_at">; Update: Partial<Project> }
      time_entries: { Row: TimeEntry; Insert: Omit<TimeEntry, "id" | "created_at">; Update: Partial<TimeEntry> }
      active_timers: { Row: ActiveTimer; Insert: Omit<ActiveTimer, "id" | "created_at">; Update: Partial<ActiveTimer> }
      vacation_entries: { Row: VacationEntry; Insert: Omit<VacationEntry, "id" | "created_at">; Update: Partial<VacationEntry> }
      overtime_records: { Row: OvertimeRecord; Insert: Omit<OvertimeRecord, "id" | "created_at">; Update: Partial<OvertimeRecord> }
      holidays: { Row: Holiday; Insert: Omit<Holiday, "id">; Update: Partial<Holiday> }
      expense_reports: { Row: ExpenseReport; Insert: Omit<ExpenseReport, "id" | "created_at">; Update: Partial<ExpenseReport> }
      expense_items: { Row: ExpenseItem; Insert: Omit<ExpenseItem, "id" | "created_at">; Update: Partial<ExpenseItem> }
      subscriptions: { Row: Subscription; Insert: Omit<Subscription, "id">; Update: Partial<Subscription> }
    }
  }
}
