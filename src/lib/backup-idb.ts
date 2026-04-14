const DB_NAME = "timori-backup"
const DB_VERSION = 1
const STORE_NAME = "handles"

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveHandleToIDB(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const req = tx.objectStore(STORE_NAME).put(handle, "backupDir")
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function loadHandleFromIDB(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const req = tx.objectStore(STORE_NAME).get("backupDir")
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function isBackupDue(
  schedule: "never" | "daily" | "weekly" | "monthly",
  lastBackupAt: string | null,
  backupTime = "02:00"
): boolean {
  if (schedule === "never") return false

  // Check whether today's scheduled time has already passed
  const [bh, bm] = backupTime.split(":").map(Number)
  const now = new Date()
  const scheduledToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm, 0, 0)
  if (now < scheduledToday) return false  // not yet time today

  if (!lastBackupAt) return true

  const diffDays = (Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000
  if (schedule === "daily") return diffDays >= 1
  if (schedule === "weekly") return diffDays >= 7
  if (schedule === "monthly") return diffDays >= 30
  return false
}
