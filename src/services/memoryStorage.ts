import type { MemoryItem } from "../components/MemoryList";
import { displayMediaValue, mediaKeyFromValue, mediaStorage, storedMediaValue } from "./mediaStorage";
import { supabase } from "./supabaseClient";

export type SyncStatus = "local" | "pending" | "synced" | "conflict";

export type StoredMemoryItem = MemoryItem & {
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;
  schemaVersion: 4;
  version: number;
};

export type MemoryPageCursor = {
  updatedAt: string;
  id: string;
};

export type MemoryItemPage = {
  items: StoredMemoryItem[];
  nextCursor: MemoryPageCursor | null;
  hasMore: boolean;
};

type ItemRow = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  price: string;
  date: string;
  emoji: string;
  sticker_url?: string | null;
  // The deployed v2 schema keeps these columns non-null. An empty string is
  // the persisted representation of an absent level; the UI treats it as
  // missing and never invents a location name.
  parent_location_name: string;
  sub_location_name: string;
  parent_location_img?: string | null;
  sub_location_img?: string | null;
  sub_location_highlight?: { x: number; y: number } | null;
  space_id?: string | null;
  created_at: string;
  updated_at: string;
  version?: number;
  deleted_at?: string | null;
};

const nowIso = () => new Date().toISOString();
const persistenceMediaValue = (value?: string | null) => {
  const key = mediaKeyFromValue(value);
  return key ? storedMediaValue(key) : value || null;
};

const sameHighlight = (
  left?: { x: number; y: number } | null,
  right?: { x: number; y: number } | null,
) => (left?.x ?? null) === (right?.x ?? null) && (left?.y ?? null) === (right?.y ?? null);

const sameItemData = (left: MemoryItem, right: MemoryItem) => (
  left.name === right.name
  && left.category === right.category
  && left.price === right.price
  && left.date === right.date
  && left.emoji === right.emoji
  && (left.stickerUrl || "") === (right.stickerUrl || "")
  && left.parentLocationName === right.parentLocationName
  && left.subLocationName === right.subLocationName
  && (left.parentLocationImg || "") === (right.parentLocationImg || "")
  && (left.subLocationImg || "") === (right.subLocationImg || "")
  && sameHighlight(left.subLocationHighlight, right.subLocationHighlight)
);

const createId = () => {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return `item-${randomId}`;
};

const spaceIdsForLocation = (ownerId: string, parentName: string, subName: string) => ({
  parentId: `parent:${ownerId}:${parentName}`,
  subId: `sub:${ownerId}:${parentName}::${subName}`,
});

const requireOwner = (ownerId: string) => {
  if (!ownerId) throw new Error("A signed-in user is required for cloud memory storage.");
};

export class MemoryItemLimitError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`Noma item limit reached (${limit})`);
    this.name = "MemoryItemLimitError";
    this.limit = limit;
  }
}

const toItemRow = (ownerId: string, item: MemoryItem | StoredMemoryItem, existing?: ItemRow): ItemRow => {
  const id = item.id || createId();
  const parentLocationName = item.parentLocationName?.trim() || "";
  const subLocationName = item.subLocationName?.trim() || "";
  const { parentId, subId } = spaceIdsForLocation(ownerId, parentLocationName, subLocationName);
  return {
    id,
    user_id: ownerId,
    name: item.name,
    category: item.category,
    price: item.price,
    date: item.date,
    emoji: item.emoji,
    sticker_url: persistenceMediaValue(item.stickerUrl),
    parent_location_name: parentLocationName,
    sub_location_name: subLocationName,
    parent_location_img: persistenceMediaValue(item.parentLocationImg),
    sub_location_img: persistenceMediaValue(item.subLocationImg),
    sub_location_highlight: item.subLocationHighlight || null,
    space_id: subLocationName ? subId : parentLocationName ? parentId : null,
    created_at: existing?.created_at || (item as Partial<StoredMemoryItem>).createdAt || nowIso(),
    updated_at: nowIso(),
    version: existing?.version || (item.version ?? 0),
    deleted_at: null,
  };
};

const prepareChangedItemRow = async (
  ownerId: string,
  item: MemoryItem | StoredMemoryItem,
  previous: MemoryItem | StoredMemoryItem | undefined,
  existing: ItemRow | undefined,
  cache: Map<string, Promise<string | null>>,
): Promise<ItemRow> => {
  const row = toItemRow(ownerId, item, existing);
  const storeChanged = (
    value: string | null | undefined,
    previousValue: string | null | undefined,
    existingValue: string | null | undefined,
    profile: "sticker" | "location",
    itemId?: string,
  ) => {
    if (existing && previous && (value || "") === (previousValue || "")) {
      return Promise.resolve(existingValue || null);
    }
    if (!value) return Promise.resolve(null);
    const cacheKey = `${profile}:${itemId || "shared"}:${value}`;
    const pending = cache.get(cacheKey) || mediaStorage.storeImage(ownerId, value, profile, itemId);
    cache.set(cacheKey, pending);
    return pending;
  };

  const [stickerUrl, parentLocationImg, subLocationImg] = await Promise.all([
    storeChanged(item.stickerUrl, previous?.stickerUrl, existing?.sticker_url, "sticker", row.id),
    storeChanged(item.parentLocationImg, previous?.parentLocationImg, existing?.parent_location_img, "location"),
    storeChanged(item.subLocationImg, previous?.subLocationImg, existing?.sub_location_img, "location"),
  ]);

  return {
    ...row,
    sticker_url: stickerUrl,
    parent_location_img: parentLocationImg,
    sub_location_img: subLocationImg,
  };
};

const mapWithConcurrency = async <T, R>(
  values: T[], worker: (value: T) => Promise<R>, concurrency = 3,
): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
};

const fromItemRow = (row: ItemRow): StoredMemoryItem => ({
  id: row.id,
  name: row.name,
  category: row.category,
  price: row.price,
  date: row.date,
  emoji: row.emoji,
  stickerUrl: displayMediaValue(row.sticker_url, row.updated_at),
  parentLocationName: row.parent_location_name || "",
  subLocationName: row.sub_location_name || "",
  // Location files use content-hashed R2 keys, so the path itself is the cache version.
  parentLocationImg: displayMediaValue(row.parent_location_img),
  subLocationImg: displayMediaValue(row.sub_location_img),
  subLocationHighlight: row.sub_location_highlight || undefined,
  // Keep the legacy names during the compatibility period; relation IDs are
  // now also written for reporting and future relational reads.
  ownerId: row.user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: null,
  syncStatus: "synced",
  schemaVersion: 4,
  version: Number(row.version || 1),
});

const throwStorageError = (operation: string, error: { code?: string; message?: string; details?: string; hint?: string } | null) => {
  if (!error) return;
  const limitMatch = error.message?.match(/NOMA_ITEM_LIMIT_REACHED:(\d+)/i);
  if (limitMatch) throw new MemoryItemLimitError(Number(limitMatch[1]));
  const code = error.code ? ` [${error.code}]` : "";
  const details = error.details || error.hint;
  throw new Error(`[Cloud memory ${operation}]${code} ${error.message || "Request failed"}${details ? `: ${details}` : ""}`);
};

const syncItemChanges = async (
  ownerId: string,
  previousItems: Array<MemoryItem | StoredMemoryItem>,
  nextItems: Array<MemoryItem | StoredMemoryItem>,
): Promise<MemoryItem[]> => {
  requireOwner(ownerId);

  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const nextById = new Map(nextItems.map((item) => [item.id, item]));
  const changedItems = nextItems.filter((item) => {
    const previous = previousById.get(item.id);
    return !previous || !sameItemData(previous, item);
  });
  const deletedIds = previousItems
    .filter((item) => !nextById.has(item.id))
    .map((item) => item.id);

  if (!changedItems.length && !deletedIds.length) return nextItems;

  // A missing record only means delete when it was present in this client's
  // loaded baseline. Unloaded pages never enter previousItems, so pagination
  // cannot accidentally delete them.
  for (const itemId of deletedIds) {
    const previous = previousById.get(itemId) as StoredMemoryItem | undefined;
    const { error } = await supabase.rpc("delete_my_item", {
      p_item_id: itemId,
      p_expected_version: Math.max(1, Number(previous?.version || 1)),
    });
    throwStorageError("soft delete item", error);
  }

  const uploadCache = new Map<string, Promise<string | null>>();
  const persistedById = new Map<string, StoredMemoryItem>();
  const changedRows = await mapWithConcurrency(changedItems, async (item) => {
    const previous = previousById.get(item.id) as StoredMemoryItem | undefined;
    const existingRow = previous ? toItemRow(ownerId, previous) : undefined;
    const row = await prepareChangedItemRow(ownerId, item, previous, existingRow, uploadCache);

    if (!previous || Number(previous.version || 0) <= 0) {
      const { data, error } = await supabase.rpc("create_my_item", { p_item: row });
      throwStorageError("create item", error);
      return fromItemRow(data as ItemRow);
    }

    const { data, error } = await supabase.rpc("update_my_item", {
      p_item_id: item.id,
      p_expected_version: Math.max(1, Number(previous.version || 1)),
      p_patch: row,
    });
    throwStorageError("update item", error);
    return fromItemRow(data as ItemRow);
  });
  changedRows.forEach((item) => persistedById.set(item.id, item));

  if (changedRows.some((item) => Boolean(mediaKeyFromValue(item.stickerUrl) || mediaKeyFromValue(item.parentLocationImg) || mediaKeyFromValue(item.subLocationImg)))) {
    await mediaStorage.ensureReadSession();
  }

  return nextItems.map((item) => persistedById.get(item.id) || item);
};

export const memoryStorage = {
  createItem(ownerId: string, input: Omit<MemoryItem, "id"> | MemoryItem): StoredMemoryItem {
    requireOwner(ownerId);
    const row = toItemRow(ownerId, {
      ...input,
      id: "id" in input && input.id ? input.id : createId(),
    } as MemoryItem);
    return fromItemRow(row);
  },

  async listItemsPage(
    ownerId: string,
    cursor: MemoryPageCursor | null = null,
    limit = 30,
  ): Promise<MemoryItemPage> {
    requireOwner(ownerId);
    const pageSize = Math.min(100, Math.max(1, limit));
    const { data, error } = await supabase.rpc("list_my_items", {
      p_cursor_updated_at: cursor?.updatedAt || null,
      p_cursor_id: cursor?.id || null,
      p_limit: pageSize,
      p_query: null,
      p_category: null,
      p_space_id: null,
    });
    throwStorageError("list paginated items", error);
    const fetchedRows = (data || []) as ItemRow[];
    const hasMore = fetchedRows.length > pageSize;
    const rows = fetchedRows.slice(0, pageSize);
    const hasPrivateImages = rows.some((row) =>
      [row.sticker_url, row.parent_location_img, row.sub_location_img].some((value) => Boolean(mediaKeyFromValue(value)))
    );
    if (hasPrivateImages) await mediaStorage.ensureReadSession();
    const lastRow = rows.at(-1);
    return {
      items: rows.map(fromItemRow),
      hasMore,
      nextCursor: hasMore && lastRow ? { updatedAt: lastRow.updated_at, id: lastRow.id } : null,
    };
  },

  async listItems(ownerId: string): Promise<StoredMemoryItem[]> {
    const items: StoredMemoryItem[] = [];
    let cursor: MemoryPageCursor | null = null;
    do {
      const page = await this.listItemsPage(ownerId, cursor, 100);
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  },

  async syncItems(
    ownerId: string,
    previousItems: Array<MemoryItem | StoredMemoryItem>,
    nextItems: Array<MemoryItem | StoredMemoryItem>,
  ): Promise<MemoryItem[]> {
    return syncItemChanges(ownerId, previousItems, nextItems);
  },

};
