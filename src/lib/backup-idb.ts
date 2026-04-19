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
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Write blob to a folder handle. Returns true if written, false if permission not granted. */
export async function writeToFolder(
  handle: FileSystemDirectoryHandle,
  blob: Blob,
  filename: string
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = handle as any
    const perm = await h.queryPermission?.({ mode: "readwrite" }) ?? "prompt"
    if (perm !== "granted") return false
    const fileHandle = await handle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch {
    return false
  }
}

export function isBackupDue(
  schedule: "never" | "daily" | "weekly" | "monthly",
  lastBackupAt: string | null,
  backupTime = "02:00"
): boolean {
  if (schedule === "never") return false

  // Reference = most recent past scheduled slot (today's if already passed, else yesterday's).
  // This catches missed backups: if the user opens before today's slot but yesterday's was missed, still triggers.
  const [bh, bm] = backupTime.split(":").map(Number)
  const now = new Date()
  const lastSlot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm, 0, 0)
  if (now < lastSlot) lastSlot.setDate(lastSlot.getDate() - 1)

  if (!lastBackupAt) return true

  const lastMs = new Date(lastBackupAt).getTime()
  const lastSlotMs = lastSlot.getTime()

  if (schedule === "daily") return lastMs < lastSlotMs
  if (schedule === "weekly") return lastSlotMs - lastMs >= 7 * 86_400_000
  if (schedule === "monthly") return lastSlotMs - lastMs >= 30 * 86_400_000
  return false
}
