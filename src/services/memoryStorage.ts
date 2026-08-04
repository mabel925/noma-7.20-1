import type { MemoryItem } from "../components/MemoryList";

const DB_NAME = "noma-memory-db";
const DB_VERSION = 2;
const ITEMS_STORE = "items";
const SPACES_STORE = "spaces";
const ASSETS_STORE = "assets";
const META_STORE = "meta";
const SYNC_QUEUE_STORE = "syncQueue";
const LEGACY_MEMORIES_KEY = "noma_custom_memories";
const LEGACY_MIGRATION_META_KEY = "legacyLocalStorageMigratedAt";

export type SyncStatus = "local" | "pending" | "synced" | "conflict";

export type StoredMemoryItem = MemoryItem & {
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;
  schemaVersion: 1;
};

export type StorageSnapshot = {
  schemaVersion: 1;
  exportedAt: string;
  items: StoredMemoryItem[];
  spaces: unknown[];
  assets: unknown[];
};

export type SyncOperation = {
  id: string;
  entity: "item";
  entityId: string;
  operation: "upsert" | "delete";
  payload: StoredMemoryItem;
  createdAt: string;
};

export type CloudSyncPayload = {
  schemaVersion: 1;
  exportedAt: string;
  snapshot: StorageSnapshot;
  operations: SyncOperation[];
};

type CloudSyncOptions = {
  endpoint: string;
  token?: string;
};

const MEMORY_FIELDS: Array<keyof MemoryItem> = [
  "id",
  "name",
  "category",
  "price",
  "date",
  "emoji",
  "stickerUrl",
  "parentLocationName",
  "subLocationName",
  "parentLocationImg",
  "subLocationImg",
];

const canUseIndexedDB = () => typeof window !== "undefined" && "indexedDB" in window;

const createId = (prefix: string) => {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return `${prefix}-${randomId}`;
};

const nowIso = () => new Date().toISOString();

const normalizeItem = (item: MemoryItem | StoredMemoryItem): StoredMemoryItem => {
  const timestamp = nowIso();
  const candidate = item as Partial<StoredMemoryItem>;

  return {
    ...item,
    id: item.id || createId("item"),
    createdAt: candidate.createdAt || timestamp,
    updatedAt: candidate.updatedAt || timestamp,
    deletedAt: candidate.deletedAt ?? null,
    syncStatus: candidate.syncStatus || "pending",
    schemaVersion: 1,
  };
};

const hasItemContentChanged = (a: StoredMemoryItem, b: StoredMemoryItem) =>
  MEMORY_FIELDS.some((field) => a[field] !== b[field]);

const createSyncOperationId = (itemId: string) => `item:${itemId}`;

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = () => {
  if (!canUseIndexedDB()) {
    return Promise.reject(new Error("IndexedDB is unavailable in this environment."));
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(ITEMS_STORE)) {
          const items = db.createObjectStore(ITEMS_STORE, { keyPath: "id" });
          items.createIndex("updatedAt", "updatedAt");
          items.createIndex("syncStatus", "syncStatus");
        }

        if (!db.objectStoreNames.contains(SPACES_STORE)) {
          const spaces = db.createObjectStore(SPACES_STORE, { keyPath: "id" });
          spaces.createIndex("parentId", "parentId");
          spaces.createIndex("updatedAt", "updatedAt");
        }

        if (!db.objectStoreNames.contains(ASSETS_STORE)) {
          const assets = db.createObjectStore(ASSETS_STORE, { keyPath: "id" });
          assets.createIndex("kind", "kind");
          assets.createIndex("updatedAt", "updatedAt");
        }

        if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
          const syncQueue = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: "id" });
          syncQueue.createIndex("createdAt", "createdAt");
          syncQueue.createIndex("entityId", "entityId");
        } else {
          const syncQueue = request.transaction?.objectStore(SYNC_QUEUE_STORE);
          if (syncQueue && !syncQueue.indexNames.contains("createdAt")) {
            syncQueue.createIndex("createdAt", "createdAt");
          }
          if (syncQueue && !syncQueue.indexNames.contains("entityId")) {
            syncQueue.createIndex("entityId", "entityId");
          }
        }

        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
};

const readLegacyLocalStorageItems = (): StoredMemoryItem[] => {
  try {
    const raw = localStorage.getItem(LEGACY_MEMORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeItem(item));
  } catch (error) {
    console.warn("[MemoryStorage] Failed to read legacy localStorage memories:", error);
    return [];
  }
};

const saveLegacyFallback = (items: StoredMemoryItem[]) => {
  try {
    localStorage.setItem(LEGACY_MEMORIES_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn("[MemoryStorage] Failed to write localStorage fallback:", error);
  }
};

const migrateLegacyLocalStorage = async (db: IDBDatabase) => {
  const metaTransaction = db.transaction(META_STORE, "readonly");
  const metaStore = metaTransaction.objectStore(META_STORE);
  const migrationMeta = await requestToPromise<{ key: string; value: string } | undefined>(
    metaStore.get(LEGACY_MIGRATION_META_KEY)
  );
  await transactionDone(metaTransaction);

  if (migrationMeta) return;

  const legacyItems = readLegacyLocalStorageItems();
  const transaction = db.transaction([ITEMS_STORE, META_STORE, SYNC_QUEUE_STORE], "readwrite");
  const itemsStore = transaction.objectStore(ITEMS_STORE);
  const metaWriteStore = transaction.objectStore(META_STORE);
  const syncQueueStore = transaction.objectStore(SYNC_QUEUE_STORE);

  legacyItems.forEach((item) => {
    itemsStore.put(item);
    syncQueueStore.put({
      id: createSyncOperationId(item.id),
      entity: "item",
      entityId: item.id,
      operation: "upsert",
      payload: item,
      createdAt: nowIso(),
    } satisfies SyncOperation);
  });
  metaWriteStore.put({ key: LEGACY_MIGRATION_META_KEY, value: nowIso() });
  await transactionDone(transaction);
};

const getAllFromStore = async <T>(db: IDBDatabase, storeName: string): Promise<T[]> => {
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const result = await requestToPromise<T[]>(store.getAll());
  await transactionDone(transaction);
  return result;
};

const queueItemSync = (
  store: IDBObjectStore,
  item: StoredMemoryItem,
  operation: SyncOperation["operation"]
) => {
  store.put({
    id: createSyncOperationId(item.id),
    entity: "item",
    entityId: item.id,
    operation,
    payload: item,
    createdAt: nowIso(),
  } satisfies SyncOperation);
};

export const memoryStorage = {
  createItem(input: Omit<MemoryItem, "id"> | MemoryItem): StoredMemoryItem {
    return normalizeItem({
      ...input,
      id: "id" in input && input.id ? input.id : createId("item"),
    } as MemoryItem);
  },

  async listItems(): Promise<StoredMemoryItem[]> {
    if (!canUseIndexedDB()) {
      return readLegacyLocalStorageItems();
    }

    const db = await openDb();
    await migrateLegacyLocalStorage(db);
    const items = await getAllFromStore<StoredMemoryItem>(db, ITEMS_STORE);

    return items
      .filter((item) => !item.deletedAt)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },

  async saveItems(items: Array<MemoryItem | StoredMemoryItem>): Promise<StoredMemoryItem[]> {
    const normalizedItems = items.map((item) => normalizeItem(item));

    if (!canUseIndexedDB()) {
      saveLegacyFallback(normalizedItems);
      return normalizedItems;
    }

    const db = await openDb();
    const existingItems = await getAllFromStore<StoredMemoryItem>(db, ITEMS_STORE);
    const existingById = new Map(existingItems.map((item) => [item.id, item]));
    const itemsToStore: StoredMemoryItem[] = [];
    const deletedItems: StoredMemoryItem[] = [];

    normalizedItems.forEach((candidate) => {
      const existing = existingById.get(candidate.id);

      if (!existing) {
        itemsToStore.push(candidate);
        return;
      }

      if (hasItemContentChanged(existing, candidate) || existing.deletedAt) {
        itemsToStore.push({
          ...existing,
          ...candidate,
          deletedAt: null,
          updatedAt: nowIso(),
          syncStatus: "pending",
          schemaVersion: 1,
        });
        return;
      }

      itemsToStore.push(existing);
    });

    const incomingIds = new Set(itemsToStore.map((item) => item.id));
    existingItems
      .filter((item) => !item.deletedAt && !incomingIds.has(item.id))
      .forEach((item) => {
        deletedItems.push({
          ...item,
          deletedAt: nowIso(),
          updatedAt: nowIso(),
          syncStatus: "pending",
          schemaVersion: 1,
        });
      });

    const transaction = db.transaction([ITEMS_STORE, SYNC_QUEUE_STORE], "readwrite");
    const itemsStore = transaction.objectStore(ITEMS_STORE);
    const syncQueueStore = transaction.objectStore(SYNC_QUEUE_STORE);

    itemsToStore.forEach((item) => {
      itemsStore.put(item);
      if (!item.deletedAt && item.syncStatus === "pending") {
        queueItemSync(syncQueueStore, item, "upsert");
      }
    });

    deletedItems.forEach((item) => {
      itemsStore.put(item);
      queueItemSync(syncQueueStore, item, "delete");
    });

    await transactionDone(transaction);

    return itemsToStore.filter((item) => !item.deletedAt);
  },

  async exportLocalSnapshot(): Promise<StorageSnapshot> {
    if (!canUseIndexedDB()) {
      return {
        schemaVersion: 1,
        exportedAt: nowIso(),
        items: readLegacyLocalStorageItems(),
        spaces: [],
        assets: [],
      };
    }

    const db = await openDb();
    await migrateLegacyLocalStorage(db);

    return {
      schemaVersion: 1,
      exportedAt: nowIso(),
      items: await getAllFromStore<StoredMemoryItem>(db, ITEMS_STORE),
      spaces: await getAllFromStore<unknown>(db, SPACES_STORE),
      assets: await getAllFromStore<unknown>(db, ASSETS_STORE),
    };
  },

  async importLocalSnapshot(snapshot: StorageSnapshot): Promise<void> {
    if (!canUseIndexedDB()) {
      saveLegacyFallback(snapshot.items.map((item) => normalizeItem(item)));
      return;
    }

    const db = await openDb();
    const transaction = db.transaction([ITEMS_STORE, SPACES_STORE, ASSETS_STORE], "readwrite");
    const itemsStore = transaction.objectStore(ITEMS_STORE);
    const spacesStore = transaction.objectStore(SPACES_STORE);
    const assetsStore = transaction.objectStore(ASSETS_STORE);

    itemsStore.clear();
    spacesStore.clear();
    assetsStore.clear();

    snapshot.items.forEach((item) => itemsStore.put(normalizeItem(item)));
    snapshot.spaces.forEach((space) => spacesStore.put(space));
    snapshot.assets.forEach((asset) => assetsStore.put(asset));

    await transactionDone(transaction);
  },

  async getPendingCloudChanges(): Promise<SyncOperation[]> {
    if (!canUseIndexedDB()) return [];
    const db = await openDb();
    return getAllFromStore<SyncOperation>(db, SYNC_QUEUE_STORE);
  },

  async buildCloudSyncPayload(): Promise<CloudSyncPayload> {
    return {
      schemaVersion: 1,
      exportedAt: nowIso(),
      snapshot: await this.exportLocalSnapshot(),
      operations: await this.getPendingCloudChanges(),
    };
  },

  async syncToCloud(options: CloudSyncOptions): Promise<{ response: Response; syncedOperationCount: number }> {
    const payload = await this.buildCloudSyncPayload();
    const response = await fetch(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Cloud sync failed with status ${response.status}: ${detail.slice(0, 500)}`);
    }

    if (!canUseIndexedDB() || payload.operations.length === 0) {
      return { response, syncedOperationCount: 0 };
    }

    const db = await openDb();
    const currentItems = await getAllFromStore<StoredMemoryItem>(db, ITEMS_STORE);
    const currentById = new Map(currentItems.map((item) => [item.id, item]));
    const transaction = db.transaction([ITEMS_STORE, SYNC_QUEUE_STORE], "readwrite");
    const itemsStore = transaction.objectStore(ITEMS_STORE);
    const syncQueueStore = transaction.objectStore(SYNC_QUEUE_STORE);
    let syncedOperationCount = 0;

    payload.operations.forEach((operation) => {
      const currentItem = currentById.get(operation.entityId);
      const operationIsStillCurrent =
        operation.operation === "delete"
          ? !currentItem || currentItem.deletedAt === operation.payload.deletedAt
          : currentItem?.updatedAt === operation.payload.updatedAt;

      if (!operationIsStillCurrent) return;

      if (operation.operation === "delete") {
        if (currentItem) itemsStore.delete(operation.entityId);
      } else if (currentItem) {
        itemsStore.put({
          ...currentItem,
          syncStatus: "synced",
          schemaVersion: 1,
        });
      }

      syncQueueStore.delete(operation.id);
      syncedOperationCount += 1;
    });

    await transactionDone(transaction);
    return { response, syncedOperationCount };
  },
};
