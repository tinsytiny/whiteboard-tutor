// The Library's files: every PDF or picture you give the tutor is kept in this
// browser (IndexedDB, which has room for pages that localStorage does not), so
// you can look at it again or bring it into a new lesson.

export type StoredFile = {
  id: string;
  name: string;
  type: string;
  data: string; // base64
  bytes: number;
  addedAt: number;
  lessonId?: string;
  lessonTitle?: string;
};

const DB = "tutor-files";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no storage"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = work(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Keeps a file. Storage can be full or blocked; the lesson carries on either way. */
export async function keepFile(file: StoredFile): Promise<void> {
  try { await run("readwrite", (s) => s.put(file)); } catch { /* not kept */ }
}

export async function listFiles(): Promise<StoredFile[]> {
  try {
    const all = await run<StoredFile[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export async function getFiles(ids: string[]): Promise<StoredFile[]> {
  const all = await listFiles();
  return ids.map((id) => all.find((f) => f.id === id)).filter((f): f is StoredFile => Boolean(f));
}

export async function removeFile(id: string): Promise<void> {
  try { await run("readwrite", (s) => s.delete(id)); } catch { /* already gone */ }
}

/** Opens a kept file in a new tab, the way the browser shows PDFs and pictures. */
export function viewFile(file: StoredFile) {
  const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.type }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
