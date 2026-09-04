import type { MemoryItem } from "../components/MemoryList";
import { displayMediaValue, mediaKeyFromValue, mediaStorage } from "./mediaStorage";
import { supabase } from "./supabaseClient";
import { readAiAccess } from "./aiAuth";

export type SyncStatus = "local" | "pending" | "synced" | "conflict";

export type StoredMemoryItem = MemoryItem & {
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;
  schemaVersion: 4;
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
};

type SpaceRow = {
  id: string;
  user_id: string;
  name: string;
  kind: "parent" | "sub";
  parent_id?: string | null;
  parent_name?: string | null;
  image_url?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

const nowIso = () => new Date().toISOString();

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
    sticker_url: item.stickerUrl || null,
    parent_location_name: parentLocationName,
    sub_location_name: subLocationName,
    parent_location_img: item.parentLocationImg || null,
    sub_location_img: item.subLocationImg || null,
    sub_location_highlight: item.subLocationHighlight || null,
    space_id: subLocationName ? subId : parentLocationName ? parentId : null,
    created_at: existing?.created_at || (item as Partial<StoredMemoryItem>).createdAt || nowIso(),
    updated_at: nowIso(),
  };
};

const prepareItemRow = async (
  ownerId: string,
  item: MemoryItem | StoredMemoryItem,
  existing?: ItemRow,
  cache?: Map<string, Promise<string | null>>,
): Promise<ItemRow> => {
  const row = toItemRow(ownerId, item, existing);
  const store = (value: string | null | undefined, profile: "sticker" | "location", itemId?: string) => {
    if (!value) return Promise.resolve(null);
    const cacheKey = `${profile}:${itemId || "shared"}:${value}`;
    const pending = cache?.get(cacheKey) || mediaStorage.storeImage(ownerId, value, profile, itemId);
    cache?.set(cacheKey, pending);
    return pending;
  };
  const [stickerUrl, parentLocationImg, subLocationImg] = await Promise.all([
    store(row.sticker_url, "sticker", row.id),
    store(row.parent_location_img, "location"),
    store(row.sub_location_img, "location"),
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
});

const toSpaceRows = (ownerId: string, items: ItemRow[]): SpaceRow[] => {
  const parents = new Map<string, SpaceRow>();
  const subs = new Map<string, SpaceRow>();
  const timestamp = nowIso();

  items.forEach((item) => {
    const parentKey = item.parent_location_name?.trim() || "";
    const subName = item.sub_location_name?.trim() || "";
    const { parentId, subId } = spaceIdsForLocation(ownerId, parentKey, subName);
    if (parentKey && !parents.has(parentKey)) {
      parents.set(parentKey, {
        id: parentId,
        user_id: ownerId,
        name: parentKey,
        kind: "parent",
        parent_id: null,
        image_url: item.parent_location_img || null,
        metadata: { item_count: 0 },
        updated_at: timestamp,
      });
    }

    if (parentKey) {
      const parent = parents.get(parentKey)!;
      parent.metadata = { ...(parent.metadata || {}), item_count: Number(parent.metadata?.item_count || 0) + 1 };
      if (!parent.image_url && item.parent_location_img) parent.image_url = item.parent_location_img;
    }

    const subKey = `${parentKey}::${subName}`;
    if (subName && !subs.has(subKey)) {
      subs.set(subKey, {
        id: subId,
        user_id: ownerId,
        name: subName,
        kind: "sub",
        parent_id: parentKey ? parentId : null,
        parent_name: parentKey || null,
        image_url: item.sub_location_img || null,
        metadata: { item_count: 0 },
        updated_at: timestamp,
      });
    }
    if (subName) {
      const sub = subs.get(subKey)!;
      sub.metadata = { ...(sub.metadata || {}), item_count: Number(sub.metadata?.item_count || 0) + 1 };
      if (!sub.image_url && item.sub_location_img) sub.image_url = item.sub_location_img;
    }
  });

  return [...parents.values(), ...subs.values()];
};

const throwStorageError = (operation: string, error: { code?: string; message?: string; details?: string; hint?: string } | null) => {
  if (!error) return;
  const limitMatch = error.message?.match(/NOMA_ITEM_LIMIT_REACHED:(\d+)/i);
  if (limitMatch) throw new MemoryItemLimitError(Number(limitMatch[1]));
  const code = error.code ? ` [${error.code}]` : "";
  const details = error.details || error.hint;
  throw new Error(`[Cloud memory ${operation}]${code} ${error.message || "Request failed"}${details ? `: ${details}` : ""}`);
};

const syncSpaces = async (ownerId: string, itemRows: ItemRow[]) => {
  const { data: existing, error: existingError } = await supabase
    .from("spaces")
    .select("id")
    .eq("user_id", ownerId);
  throwStorageError("load spaces before sync", existingError);

  const spaces = toSpaceRows(ownerId, itemRows);
  if (spaces.length) {
    const { error } = await supabase.from("spaces").upsert(spaces, { onConflict: "id" });
    throwStorageError("upsert spaces", error);
  }

  const retainedIds = new Set(spaces.map((space) => space.id));
  const staleIds = ((existing || []) as Array<{ id: string }>)
    .map((space) => space.id)
    .filter((id) => !retainedIds.has(id));
  if (staleIds.length) {
    const { error } = await supabase.from("spaces").delete().in("id", staleIds).eq("user_id", ownerId);
    throwStorageError("delete stale spaces", error);
  }
};

const cleanupReplacedMedia = async (existingRows: ItemRow[], nextRows: ItemRow[]) => {
  const existingMedia = existingRows.flatMap((row) => [row.sticker_url, row.parent_location_img, row.sub_location_img]);
  const nextMedia = nextRows.flatMap((row) => [row.sticker_url, row.parent_location_img, row.sub_location_img]);
  const retainedKeys = new Set(
    nextMedia.map(mediaKeyFromValue)
      .filter((key): key is string => Boolean(key)),
  );
  await mediaStorage.deleteKeys(existingMedia.filter((value) => {
    const key = mediaKeyFromValue(value);
    return Boolean(key && !retainedKeys.has(key));
  }));
  await mediaStorage.reconcileKeys(nextMedia);
  return retainedKeys;
};

const finalizeItemRows = async (ownerId: string, existingRows: ItemRow[], nextRows: ItemRow[]) => {
  let spaceSyncError: unknown;
  try {
    await syncSpaces(ownerId, nextRows);
  } catch (error) {
    spaceSyncError = error;
  }

  let retainedKeys: Set<string>;
  try {
    retainedKeys = await cleanupReplacedMedia(existingRows, nextRows);
  } catch (cleanupError) {
    if (spaceSyncError) {
      throw new AggregateError([spaceSyncError, cleanupError], "Space sync and R2 image cleanup both failed.");
    }
    throw cleanupError;
  }

  if (spaceSyncError) throw spaceSyncError;
  return retainedKeys;
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

  async listItems(ownerId: string): Promise<StoredMemoryItem[]> {
    requireOwner(ownerId);
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", ownerId)
      .order("updated_at", { ascending: false });
    throwStorageError("list items", error);
    const rows = (data || []) as ItemRow[];
    const hasPrivateImages = rows.some((row) =>
      [row.sticker_url, row.parent_location_img, row.sub_location_img].some((value) => Boolean(mediaKeyFromValue(value)))
    );
    if (hasPrivateImages) await mediaStorage.ensureReadSession();
    return rows.map(fromItemRow);
  },

  async saveItem(ownerId: string, item: MemoryItem | StoredMemoryItem): Promise<StoredMemoryItem> {
    requireOwner(ownerId);
    const { data: existing, error: existingError } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", ownerId);
    throwStorageError("load items before save", existingError);

    const existingRows = (existing || []) as ItemRow[];
    const existingRow = existingRows.find((row) => row.id === item.id);
    if (!existingRow) {
      const access = await readAiAccess();
      if (access.itemLimit !== null && access.itemCount >= access.itemLimit) {
        throw new MemoryItemLimitError(access.itemLimit);
      }
    }
    const row = await prepareItemRow(ownerId, item, existingRow);
    const { error } = await supabase.from("items").upsert(row, { onConflict: "id" });
    throwStorageError("save item", error);

    const nextRows = [row, ...existingRows.filter((existingItem) => existingItem.id !== row.id)];
    const retainedKeys = await finalizeItemRows(ownerId, existingRows, nextRows);
    if (retainedKeys.size) {
      await mediaStorage.ensureReadSession();
    }
    return fromItemRow(row);
  },

  async saveItems(ownerId: string, items: Array<MemoryItem | StoredMemoryItem>): Promise<StoredMemoryItem[]> {
    requireOwner(ownerId);

    const { data: existing, error: existingError } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", ownerId);
    throwStorageError("load items before save", existingError);

    const existingRows = (existing || []) as ItemRow[];
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const hasNewItems = items.some((item) => !existingById.has(item.id));
    if (hasNewItems) {
      const access = await readAiAccess();
      const nextCount = existingRows.length + items.filter((item) => !existingById.has(item.id)).length;
      if (access.itemLimit !== null && nextCount > access.itemLimit) {
        throw new MemoryItemLimitError(access.itemLimit);
      }
    }
    const uploadCache = new Map<string, Promise<string | null>>();
    const rows = await mapWithConcurrency(
      items,
      (item) => prepareItemRow(ownerId, item, existingById.get(item.id), uploadCache),
    );
    const itemIds = new Set(rows.map((row) => row.id));
    const staleIds = existingRows.filter((row) => !itemIds.has(row.id)).map((row) => row.id);

    if (rows.length) {
      const { error } = await supabase.from("items").upsert(rows, { onConflict: "id" });
      throwStorageError("upsert items", error);
    }
    if (staleIds.length) {
      const { error } = await supabase.from("items").delete().in("id", staleIds).eq("user_id", ownerId);
      throwStorageError("delete items", error);
    }

    // Items are the source of truth. Space refresh and old-image cleanup are
    // attempted independently so one failure cannot silently skip the other.
    const retainedKeys = await finalizeItemRows(ownerId, existingRows, rows);

    if (retainedKeys.size) await mediaStorage.ensureReadSession();

    return rows.map(fromItemRow);
  },
};
