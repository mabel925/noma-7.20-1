import type { MemoryItem } from "../components/MemoryList";
import { supabase } from "./supabaseClient";

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
  parent_location_name: string;
  sub_location_name: string;
  parent_location_img?: string | null;
  sub_location_img?: string | null;
  sub_location_highlight?: { x: number; y: number } | null;
  created_at: string;
  updated_at: string;
};

type SpaceRow = {
  id: string;
  user_id: string;
  name: string;
  kind: "parent" | "sub";
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

const requireOwner = (ownerId: string) => {
  if (!ownerId) throw new Error("A signed-in user is required for cloud memory storage.");
};

const toItemRow = (ownerId: string, item: MemoryItem | StoredMemoryItem, existing?: ItemRow): ItemRow => {
  const id = item.id || createId();
  return {
    id,
    user_id: ownerId,
    name: item.name,
    category: item.category,
    price: item.price,
    date: item.date,
    emoji: item.emoji,
    sticker_url: item.stickerUrl || null,
    parent_location_name: item.parentLocationName || "Bedroom",
    sub_location_name: item.subLocationName || "Drawer",
    parent_location_img: item.parentLocationImg || null,
    sub_location_img: item.subLocationImg || null,
    sub_location_highlight: item.subLocationHighlight || null,
    created_at: existing?.created_at || (item as Partial<StoredMemoryItem>).createdAt || nowIso(),
    updated_at: nowIso(),
  };
};

const fromItemRow = (row: ItemRow): StoredMemoryItem => ({
  id: row.id,
  name: row.name,
  category: row.category,
  price: row.price,
  date: row.date,
  emoji: row.emoji,
  stickerUrl: row.sticker_url || undefined,
  parentLocationName: row.parent_location_name,
  subLocationName: row.sub_location_name,
  parentLocationImg: row.parent_location_img || undefined,
  subLocationImg: row.sub_location_img || undefined,
  subLocationHighlight: row.sub_location_highlight || undefined,
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
    const parentKey = item.parent_location_name || "Bedroom";
    if (!parents.has(parentKey)) {
      parents.set(parentKey, {
        id: `parent:${ownerId}:${parentKey}`,
        user_id: ownerId,
        name: parentKey,
        kind: "parent",
        image_url: item.parent_location_img || null,
        metadata: { item_count: 0 },
        created_at: timestamp,
        updated_at: timestamp,
      });
    }

    const parent = parents.get(parentKey)!;
    parent.metadata = { ...(parent.metadata || {}), item_count: Number(parent.metadata?.item_count || 0) + 1 };
    if (!parent.image_url && item.parent_location_img) parent.image_url = item.parent_location_img;

    const subKey = `${parentKey}::${item.sub_location_name || "Drawer"}`;
    if (!subs.has(subKey)) {
      subs.set(subKey, {
        id: `sub:${ownerId}:${subKey}`,
        user_id: ownerId,
        name: item.sub_location_name || "Drawer",
        kind: "sub",
        parent_name: parentKey,
        image_url: item.sub_location_img || null,
        metadata: { item_count: 0 },
        created_at: timestamp,
        updated_at: timestamp,
      });
    }
    const sub = subs.get(subKey)!;
    sub.metadata = { ...(sub.metadata || {}), item_count: Number(sub.metadata?.item_count || 0) + 1 };
    if (!sub.image_url && item.sub_location_img) sub.image_url = item.sub_location_img;
  });

  return [...parents.values(), ...subs.values()];
};

const throwStorageError = (operation: string, error: { message?: string; details?: string; hint?: string } | null) => {
  if (!error) return;
  throw new Error(`[Cloud memory ${operation}] ${error.message || "Request failed"}${error.details ? `: ${error.details}` : ""}`);
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
    return ((data || []) as ItemRow[]).map(fromItemRow);
  },

  async saveItem(ownerId: string, item: MemoryItem | StoredMemoryItem): Promise<StoredMemoryItem> {
    requireOwner(ownerId);
    const row = toItemRow(ownerId, item);
    const { error } = await supabase.from("items").upsert(row, { onConflict: "id" });
    throwStorageError("save item", error);
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
    const rows = items.map((item) => toItemRow(ownerId, item, existingById.get(item.id)));
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

    const { error: spaceDeleteError } = await supabase.from("spaces").delete().eq("user_id", ownerId);
    throwStorageError("replace spaces", spaceDeleteError);
    const spaces = toSpaceRows(ownerId, rows);
    if (spaces.length) {
      const { error } = await supabase.from("spaces").upsert(spaces, { onConflict: "id" });
      throwStorageError("upsert spaces", error);
    }

    return rows.map(fromItemRow);
  },
};
