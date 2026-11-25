import { shallowRef } from "vue";
import { browserCodec } from "./imageCodec";
import { IMAGE_LIMITS, type LibraryImage, libraryName, prepareImport } from "./images";

/**
 * Imported texture images, kept in IndexedDB.
 *
 * Images are too large for localStorage (which also holds every other
 * preference), so their bytes live in their own small database. Each record
 * is keyed by the SHA-256 of its stored bytes, which is also how an arena's
 * texture map names it (`user-image:<sha256>`), so importing the same picture
 * twice reuses one record.
 *
 * The library list is reactive so the editor's dropdowns update as soon as an
 * import finishes.
 */

const DB_NAME = "vpg-images";
const DB_VERSION = 1;
const STORE = "images";

interface StoredImage extends LibraryImage {
  blob: Blob;
}

/** Library metadata, without the bytes. Empty until `loadImageLibrary` resolves. */
export const imageLibrary = shallowRef<readonly LibraryImage[]>([]);

let opening: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed."));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
  });
}

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not allow imported images to be stored."));
  }
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Imported images could not be opened."));
    req.onblocked = () => reject(new Error("Imported images are locked by another tab."));
  }).catch((error) => {
    // A later attempt may succeed (another tab closed, storage unblocked).
    opening = null;
    throw error;
  });
  return opening;
}

function metadata({ blob: _blob, ...image }: StoredImage): LibraryImage {
  return image;
}

async function allImages(): Promise<StoredImage[]> {
  const db = await database();
  return request(db.transaction(STORE).objectStore(STORE).getAll() as IDBRequest<StoredImage[]>);
}

/** Reads the library list. Failure leaves it empty: imports are optional. */
export async function loadImageLibrary(): Promise<void> {
  try {
    const images = await allImages();
    imageLibrary.value = images.map(metadata).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    imageLibrary.value = [];
  }
}

/** Ids of every stored image, for validating arena references. */
export function libraryIds(): Set<string> {
  return new Set(imageLibrary.value.map((image) => image.id));
}

/**
 * Decodes, re-encodes and stores a chosen file.
 *
 * Every import is decoded and re-encoded (see `prepareImport`), which drops
 * metadata and shrinks oversize art rather than refusing it.
 */
export async function importImageFile(file: File): Promise<{ image: LibraryImage; duplicate: boolean }> {
  const prepared = await prepareImport(file, browserCodec);
  const db = await database();
  const existing = await request(db.transaction(STORE).objectStore(STORE).get(prepared.info.id) as IDBRequest<StoredImage | undefined>);
  if (existing) return { image: metadata(existing), duplicate: true };

  const library = imageLibrary.value;
  if (library.length >= IMAGE_LIMITS.images) {
    throw new Error(`At most ${IMAGE_LIMITS.images} images can be imported.`);
  }
  const used = library.reduce((total, image) => total + image.byteLength, 0);
  if (used + prepared.info.byteLength > IMAGE_LIMITS.libraryBytes) {
    throw new Error("Imported images would exceed 64 MiB.");
  }

  const record: StoredImage = {
    ...prepared.info,
    name: libraryName(file.name),
    importedAt: new Date().toISOString(),
    blob: prepared.blob,
  };
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(record);
  await done(tx);
  await loadImageLibrary();
  return { image: metadata(record), duplicate: false };
}

/** The bytes for each requested id that exists. */
export async function readImages(ids: readonly string[]): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  if (!ids.length) return out;
  const db = await database();
  const store = db.transaction(STORE).objectStore(STORE);
  const records = await Promise.all(ids.map((id) => request(store.get(id) as IDBRequest<StoredImage | undefined>)));
  for (const record of records) if (record) out.set(record.id, record.blob);
  return out;
}

/**
 * Deletes every image not in `keep`.
 *
 * There is no image management screen yet, so the editor calls this whenever
 * an arena is saved or deleted, or a draft is discarded. Without it, imports
 * that nothing uses would accumulate until the library limit refused more.
 */
export async function pruneImages(keep: ReadonlySet<string>): Promise<void> {
  const unused = imageLibrary.value.filter((image) => !keep.has(image.id));
  if (!unused.length) return;
  const db = await database();
  const tx = db.transaction(STORE, "readwrite");
  for (const image of unused) tx.objectStore(STORE).delete(image.id);
  await done(tx);
  await loadImageLibrary();
}
