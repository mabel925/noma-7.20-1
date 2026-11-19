import type { MemoryItem } from "../components/MemoryList";

export type LocationSnapshot = {
  name: string;
  parentName: string;
  sourceField: "parent" | "sub";
  imgUrl: string;
  itemCount: number;
  items: MemoryItem[];
  directItems: MemoryItem[];
  subLocations: Array<{
    name: string;
    parentName: string;
    imgUrl: string;
    parentImgUrl: string;
    itemCount: number;
    items: MemoryItem[];
  }>;
};

export const itemBelongsToLocation = (item: MemoryItem, location: Pick<LocationSnapshot, "sourceField" | "name" | "parentName">) =>
  location.sourceField === "parent"
    ? item.parentLocationName.trim() === location.name
    : item.parentLocationName.trim() === location.parentName && item.subLocationName.trim() === location.name;

export const updateLocationItem = (
  item: MemoryItem,
  location: LocationSnapshot,
  updates: { name: string; imgUrl?: string },
): MemoryItem => {
  if (!itemBelongsToLocation(item, location)) return item;
  return location.sourceField === "parent"
    ? { ...item, parentLocationName: updates.name, parentLocationImg: updates.imgUrl || item.parentLocationImg }
    : { ...item, subLocationName: updates.name, subLocationImg: updates.imgUrl || item.subLocationImg };
};

/** Rename the open detail and its back stack before reconciling changed items. */
export const updateLocationSnapshot = <T extends LocationSnapshot>(
  snapshot: T | null,
  location: LocationSnapshot,
  updates: { name: string; imgUrl?: string },
): T | null => {
  if (!snapshot) return snapshot;
  const isTarget = snapshot.sourceField === location.sourceField && snapshot.name === location.name
    && (location.sourceField === "parent" || snapshot.parentName === location.parentName);
  const isChild = location.sourceField === "parent" && snapshot.parentName === location.name;
  const updateItem = (item: MemoryItem) => updateLocationItem(item, location, updates);
  return {
    ...snapshot,
    name: isTarget ? updates.name : snapshot.name,
    parentName: isChild ? updates.name : snapshot.parentName,
    imgUrl: isTarget ? updates.imgUrl || snapshot.imgUrl : snapshot.imgUrl,
    items: snapshot.items.map(updateItem),
    directItems: snapshot.directItems.map(updateItem),
    subLocations: snapshot.subLocations.map((sub) => {
      const isRenamedChild = location.sourceField === "sub" && sub.name === location.name && sub.parentName === location.parentName;
      const isRenamedParent = location.sourceField === "parent" && sub.parentName === location.name;
      return {
        ...sub,
        name: isRenamedChild ? updates.name : sub.name,
        parentName: isRenamedParent ? updates.name : sub.parentName,
        imgUrl: isRenamedChild ? updates.imgUrl || sub.imgUrl : sub.imgUrl,
        parentImgUrl: isRenamedParent ? updates.imgUrl || sub.parentImgUrl : sub.parentImgUrl,
        items: sub.items.map(updateItem),
      };
    }),
  };
};

/** Rebase open/back-stack details without treating unloaded search results as deleted. */
export const reconcileLocationSnapshot = <T extends LocationSnapshot>(
  location: T | null,
  previousItems: MemoryItem[],
  currentItems: MemoryItem[],
): T | null => {
  if (!location) return location;
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const removedIds = new Set(previousItems.filter((item) => !currentById.has(item.id)).map((item) => item.id));
  const belongs = (item: MemoryItem) => itemBelongsToLocation(item, location);
  const itemsById = new Map<string, MemoryItem>();
  for (const savedItem of location.items) {
    if (removedIds.has(savedItem.id)) continue;
    const item = currentById.get(savedItem.id) || savedItem;
    if (belongs(item)) itemsById.set(item.id, item);
  }
  currentItems.filter(belongs).forEach((item) => itemsById.set(item.id, item));
  const items = [...itemsById.values()];
  const imgUrl = (location.sourceField === "parent"
    ? items.find((item) => item.parentLocationImg)?.parentLocationImg
    : items.find((item) => item.subLocationImg)?.subLocationImg) || location.imgUrl;

  return {
    ...location,
    imgUrl,
    items,
    directItems: items.filter((item) => location.sourceField === "sub" || !item.subLocationName.trim()),
    itemCount: Math.max(items.length, location.itemCount + items.length - location.items.length),
    subLocations: location.subLocations.map((sub) => {
      const subItems = items.filter((item) => item.parentLocationName.trim() === sub.parentName && item.subLocationName.trim() === sub.name);
      return {
        ...sub,
        items: subItems,
        itemCount: Math.max(subItems.length, sub.itemCount + subItems.length - sub.items.length),
        imgUrl: subItems.find((item) => item.subLocationImg)?.subLocationImg || sub.imgUrl,
        parentImgUrl: imgUrl,
      };
    }),
  };
};
