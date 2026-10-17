/**
 * High-Performance Browser Session Asset Cache
 *
 * Caches assets (textures, sprite blobs, and WZ JSON data) on the client's local
 * browser storage for the duration of the browser session.
 *
 * Performance Architecture:
 * 1. Synchronous In-Memory Index (knownBlobKeys / knownJsonKeys):
 *    - On startup, loads existing keys into memory once.
 *    - All cache miss checks are 100% synchronous (0ms, 0 transactions).
 *    - Never opens an IndexedDB transaction for missing assets.
 * 2. Batched Asynchronous Disk Writes:
 *    - Saves items to in-memory cache instantly.
 *    - Writes to IndexedDB are queued and flushed in a single debounced batch transaction
 *      during idle time, completely eliminating main-thread transaction stalls.
 * 3. Bounded Memory Footprint:
 *    - In-memory Blobs capped with FIFO eviction so RAM remains lean while IndexedDB holds data on disk.
 * 4. Automatic Session Lifecycle:
 *    - Session marker in session cookie + sessionStorage is cleared when browser closes.
 *    - On fresh browser launch, stale caches from previous sessions are wiped clean.
 */

const SESSION_COOKIE_NAME = "ms_browser_session";
const SESSION_STORAGE_KEY = "ms_browser_session";
const DB_NAME = "MapleSessionAssetsDB";
const DB_VERSION = 1;
const STORE_BLOBS = "blobs";
const STORE_JSON = "json";
const STORE_META = "meta";
const MAX_MEM_BLOBS = 20;

function readSessionToken(): string | null {
  try {
    if (typeof document !== "undefined" && document.cookie) {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
  } catch {}
  try {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem(SESSION_STORAGE_KEY);
    }
  } catch {}
  return null;
}

function writeSessionToken(token: string) {
  try {
    if (typeof document !== "undefined") {
      document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
    }
  } catch {}
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(SESSION_STORAGE_KEY, token);
    }
  } catch {}
}

export class SessionAssetCache {
  // L1 In-Memory Fast Cache
  private static memBlobs = new Map<string, Blob>();
  private static memJson = new Map<string, any>();

  // Synchronous Key Index for instant O(1) hit/miss checks without IndexedDB transactions
  private static knownBlobKeys = new Set<string>();
  private static knownJsonKeys = new Set<string>();
  private static keysLoaded = false;

  // Batched disk writes
  private static pendingBlobWrites = new Map<string, Blob>();
  private static pendingJsonWrites = new Map<string, any>();
  private static batchTimer: any = null;

  private static dbPromise: Promise<IDBDatabase | null> | null = null;
  private static initPromise: Promise<void> | null = null;
  private static initialized = false;

  private static getDB(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === "undefined") {
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS);
          if (!db.objectStoreNames.contains(STORE_JSON)) db.createObjectStore(STORE_JSON);
          if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn("[SessionAssetCache] Failed to open IndexedDB:", req.error);
          resolve(null);
        };
        req.onblocked = () => {
          console.warn("[SessionAssetCache] IndexedDB open blocked");
          resolve(null);
        };
      } catch (e) {
        console.warn("[SessionAssetCache] IndexedDB error:", e);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  /**
   * Initializes the session cache and pre-indexes keys for zero-latency lookups.
   */
  static async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const db = await this.getDB();
        const activeToken = readSessionToken();

        if (!db) {
          if (!activeToken) {
            writeSessionToken(`sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
          }
          this.initialized = true;
          this.keysLoaded = true;
          return;
        }

        const storedToken = await this.getMeta(db, "currentSessionId");

        if (!activeToken || activeToken !== storedToken) {
          // Fresh browser session: purge old caches from previous sessions
          await this.clearAllStores(db);
          const newToken = activeToken || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          writeSessionToken(newToken);
          await this.setMeta(db, "currentSessionId", newToken);
          await this.setMeta(db, "sessionCreatedAt", Date.now());
          this.knownBlobKeys.clear();
          this.knownJsonKeys.clear();
        } else {
          // Same session: load existing keys into memory for instant O(1) lookups
          writeSessionToken(activeToken);
          await this.loadAllKeyIndices(db);
        }

        this.initialized = true;
        this.keysLoaded = true;
      } catch (err) {
        console.warn("[SessionAssetCache] Init fallback:", err);
        this.initialized = true;
        this.keysLoaded = true;
      }
    })();

    return this.initPromise;
  }

  private static loadAllKeyIndices(db: IDBDatabase): Promise<void> {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_BLOBS, STORE_JSON], "readonly");
        const bStore = tx.objectStore(STORE_BLOBS);
        const jStore = tx.objectStore(STORE_JSON);

        const bReq = bStore.getAllKeys();
        bReq.onsuccess = () => {
          if (Array.isArray(bReq.result)) {
            for (const k of bReq.result) {
              if (typeof k === "string") this.knownBlobKeys.add(k);
            }
          }
        };

        const jReq = jStore.getAllKeys();
        jReq.onsuccess = () => {
          if (Array.isArray(jReq.result)) {
            for (const k of jReq.result) {
              if (typeof k === "string") this.knownJsonKeys.add(k);
            }
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private static getMeta(db: IDBDatabase, key: string): Promise<any> {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_META, "readonly");
        const store = tx.objectStore(STORE_META);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private static setMeta(db: IDBDatabase, key: string, value: any): Promise<void> {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_META, "readwrite");
        const store = tx.objectStore(STORE_META);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private static clearAllStores(db: IDBDatabase): Promise<void> {
    this.memBlobs.clear();
    this.memJson.clear();
    this.knownBlobKeys.clear();
    this.knownJsonKeys.clear();
    this.pendingBlobWrites.clear();
    this.pendingJsonWrites.clear();

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_BLOBS, STORE_JSON, STORE_META], "readwrite");
        tx.objectStore(STORE_BLOBS).clear();
        tx.objectStore(STORE_JSON).clear();
        tx.objectStore(STORE_META).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Fast synchronous check: returns true only if the asset is definitely cached.
   */
  static hasBlob(url: string): boolean {
    return this.memBlobs.has(url) || this.knownBlobKeys.has(url);
  }

  /**
   * Fast synchronous check: returns true only if the JSON data is definitely cached.
   */
  static hasJson(path: string): boolean {
    return this.memJson.has(path) || this.knownJsonKeys.has(path);
  }

  /**
   * Retrieves a Blob from the session cache.
   * If it is a known miss, returns null synchronously without opening an IndexedDB transaction.
   */
  static async getBlob(url: string): Promise<Blob | null> {
    // 1. Fast L1 Memory Check (0ms)
    const mem = this.memBlobs.get(url);
    if (mem) return mem;

    // 2. Synchronous Miss Guard: If key is not in index, it's a 100% miss — do not open transactions!
    if (this.keysLoaded && !this.knownBlobKeys.has(url)) {
      return null;
    }

    if (!this.initialized) await this.init();
    if (!this.knownBlobKeys.has(url)) return null;

    const db = await this.getDB();
    if (!db) return null;

    // 3. L2 IndexedDB Check
    return new Promise<Blob | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_BLOBS, "readonly");
        const store = tx.objectStore(STORE_BLOBS);
        const req = store.get(url);
        req.onsuccess = () => {
          const result = req.result;
          if (result instanceof Blob && result.size > 0) {
            this.setMemBlob(url, result);
            resolve(result);
          } else {
            this.knownBlobKeys.delete(url);
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private static setMemBlob(url: string, blob: Blob) {
    if (this.memBlobs.size >= MAX_MEM_BLOBS) {
      // FIFO eviction of oldest in-memory blob to keep RAM clean
      const firstKey = this.memBlobs.keys().next().value;
      if (firstKey) this.memBlobs.delete(firstKey);
    }
    this.memBlobs.set(url, blob);
  }

  /**
   * Stores a Blob into the session cache.
   * Updates memory immediately and batches disk writes into a single transaction.
   */
  static setBlob(url: string, blob: Blob): void {
    this.setMemBlob(url, blob);
    this.knownBlobKeys.add(url);
    this.pendingBlobWrites.set(url, blob);
    this.scheduleBatchWrite();
  }

  /**
   * Retrieves parsed JSON data from the session cache.
   */
  static async getJson<T = any>(path: string): Promise<T | null> {
    // 1. Fast L1 Memory Check (0ms)
    const mem = this.memJson.get(path);
    if (mem !== undefined) return mem as T;

    // 2. Synchronous Miss Guard
    if (this.keysLoaded && !this.knownJsonKeys.has(path)) {
      return null;
    }

    if (!this.initialized) await this.init();
    if (!this.knownJsonKeys.has(path)) return null;

    const db = await this.getDB();
    if (!db) return null;

    // 3. L2 IndexedDB Check
    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_JSON, "readonly");
        const store = tx.objectStore(STORE_JSON);
        const req = store.get(path);
        req.onsuccess = () => {
          const result = req.result;
          if (result !== undefined && result !== null) {
            this.memJson.set(path, result);
            resolve(result as T);
          } else {
            this.knownJsonKeys.delete(path);
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Stores parsed JSON data into the session cache.
   * Updates memory immediately and batches disk writes into a single transaction.
   */
  static setJson(path: string, data: any): void {
    this.memJson.set(path, data);
    this.knownJsonKeys.add(path);
    this.pendingJsonWrites.set(path, data);
    this.scheduleBatchWrite();
  }

  private static scheduleBatchWrite() {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.flushBatchWrites();
    }, 800);
  }

  private static async flushBatchWrites() {
    if (this.pendingBlobWrites.size === 0 && this.pendingJsonWrites.size === 0) return;
    const db = await this.getDB();
    if (!db) return;

    const blobs = new Map(this.pendingBlobWrites);
    this.pendingBlobWrites.clear();
    const jsons = new Map(this.pendingJsonWrites);
    this.pendingJsonWrites.clear();

    try {
      const stores: string[] = [];
      if (blobs.size > 0) stores.push(STORE_BLOBS);
      if (jsons.size > 0) stores.push(STORE_JSON);
      if (stores.length === 0) return;

      const tx = db.transaction(stores, "readwrite");
      if (blobs.size > 0) {
        const bStore = tx.objectStore(STORE_BLOBS);
        for (const [url, blob] of blobs) {
          bStore.put(blob, url);
        }
      }
      if (jsons.size > 0) {
        const jStore = tx.objectStore(STORE_JSON);
        for (const [path, data] of jsons) {
          jStore.put(data, path);
        }
      }
    } catch (e) {
      console.warn("[SessionAssetCache] Batch flush error:", e);
    }
  }

  /**
   * Removes an asset from the session cache.
   */
  static async delete(key: string): Promise<void> {
    this.memBlobs.delete(key);
    this.memJson.delete(key);
    this.knownBlobKeys.delete(key);
    this.knownJsonKeys.delete(key);
    this.pendingBlobWrites.delete(key);
    this.pendingJsonWrites.delete(key);

    const db = await this.getDB();
    if (!db) return;

    try {
      const tx = db.transaction([STORE_BLOBS, STORE_JSON], "readwrite");
      tx.objectStore(STORE_BLOBS).delete(key);
      tx.objectStore(STORE_JSON).delete(key);
    } catch {}
  }

  /**
   * Clears the entire session cache manually.
   */
  static async clear(): Promise<void> {
    const db = await this.getDB();
    if (db) {
      await this.clearAllStores(db);
    } else {
      this.memBlobs.clear();
      this.memJson.clear();
      this.knownBlobKeys.clear();
      this.knownJsonKeys.clear();
    }
  }
}
