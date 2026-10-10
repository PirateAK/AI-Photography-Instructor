// On-device photo gallery for the phone workflow. Photos the user picks (or
// shoots with the Camera button) are stored in IndexedDB on THIS device only —
// nothing uploads until the coach analyzes one. The gallery is a working set:
// capped at 100 entries with oldest-first eviction, swipe-to-trim in the UI.

const DB_NAME = "photo-coach-gallery";
const DB_VERSION = 1;
const STORE = "photos";
export const GALLERY_CAP = 100;

export interface GalleryEntry {
  id?: number;
  addedAt: number;
  name: string;
  size: number;
  type: string;
  blob: Blob;
  thumb: string;
}

export interface GalleryMeta {
  id: number;
  addedAt: number;
  name: string;
  size: number;
  thumb: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
            store.createIndex("addedAt", "addedAt");
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function storeFor(mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
  const db = await openDb();
  if (!db) return null;
  return db.transaction(STORE, mode).objectStore(STORE);
}

function requestDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Resolves when the transaction commits (or rejects/aborts cleanly). */
function commit(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** Number of oldest entries to evict so `count` fits the cap. */
export function applyCap(count: number, cap: number = GALLERY_CAP): number {
  return Math.max(0, count - cap);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Small JPEG preview (max 320px edge) for the gallery grid. Tries the fast
 *  path (createImageBitmap) then an <img> decode — a photo that survives both
 *  still gets stored with an empty thumb rather than dropping the shot. */
export async function makeThumb(blob: Blob): Promise<string> {
  const drawTo = (source: ImageBitmap | HTMLImageElement, w: number, h: number): string => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(source, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.72);
  };
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
      return drawTo(bitmap, Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    } finally {
      bitmap.close?.();
    }
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image decode failed"));
        img.src = url;
      });
      const scale = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
      return drawTo(img, Math.max(1, Math.round(img.naturalWidth * scale)), Math.max(1, Math.round(img.naturalHeight * scale)));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function listGallery(): Promise<GalleryMeta[]> {
  const store = await storeFor("readonly");
  if (!store) return [];
  const entries = (await requestDone(store.getAll())) as GalleryEntry[];
  return entries
    .sort((a, b) => b.addedAt - a.addedAt)
    .map(({ id, addedAt, name, size, thumb }) => ({ id: id as number, addedAt, name, size, thumb }));
}

export async function addToGallery(files: File[]): Promise<{ added: number; evicted: number; skipped: number }> {
  // prepare thumbnails BEFORE opening the write transaction — IDB transactions
  // auto-commit when a task yields, so no awaits may sit between puts
  const base = Date.now();
  const prepared: GalleryEntry[] = [];
  const images = files.filter(isImageFile);
  for (let i = 0; i < images.length; i++) {
    try {
      const thumb = await makeThumb(images[i]);
      prepared.push({
        addedAt: base + i,
        name: images[i].name || "photo.jpg",
        size: images[i].size,
        type: images[i].type,
        blob: images[i],
        thumb,
      });
    } catch {
      // unreadable image — counted as skipped, never aborts the batch
    }
  }
  const skipped = images.length - prepared.length + (files.length - images.length);
  if (!prepared.length) return { added: 0, evicted: 0, skipped };

  const store = await storeFor("readwrite");
  if (!store) return { added: 0, evicted: 0, skipped };
  for (const entry of prepared) store.put(entry);
  await commit(store.transaction);

  // cap: evict oldest-first — every read/write after the commit needs a FRESH
  // transaction; reusing `store` here throws TransactionInactiveError
  let evicted = 0;
  const readStore = await storeFor("readonly");
  if (readStore) {
    const all = (await requestDone(readStore.getAll())) as GalleryEntry[];
    const excess = applyCap(all.length);
    if (excess > 0) {
      const oldest = all.sort((a, b) => a.addedAt - b.addedAt).slice(0, excess);
      const delStore = await storeFor("readwrite");
      if (delStore) {
        for (const entry of oldest) delStore.delete(entry.id as number);
        await commit(delStore.transaction);
      }
      evicted = excess;
    }
  }
  return { added: prepared.length, evicted, skipped };
}

export async function getGalleryBlob(id: number): Promise<Blob | null> {
  const store = await storeFor("readonly");
  if (!store) return null;
  const entry = (await requestDone(store.get(id))) as GalleryEntry | undefined;
  return entry?.blob ?? null;
}

/** Removes an entry and returns it (so the UI can offer undo). */
export async function removeGallery(id: number): Promise<GalleryEntry | null> {
  const readStore = await storeFor("readonly");
  if (!readStore) return null;
  const entry = (await requestDone(readStore.get(id))) as GalleryEntry | undefined;
  if (!entry) return null;
  const delStore = await storeFor("readwrite");
  if (!delStore) return null;
  delStore.delete(id);
  await commit(delStore.transaction);
  return entry;
}

/** Puts an entry back (undo path — gets a fresh id). */
export async function restoreGalleryEntry(entry: GalleryEntry): Promise<void> {
  const store = await storeFor("readwrite");
  if (!store) return;
  const { id: _ignored, ...rest } = entry;
  void _ignored;
  store.put(rest as GalleryEntry);
  await commit(store.transaction);
}
