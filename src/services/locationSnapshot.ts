import type { MemoryItem } from "../components/MemoryList";

type LocationSnapshot = {
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

/** Rebase open/back-stack details without treating unloaded search results as deleted. */
export const reconcileLocationSnapshot = <T extends LocationSnapshot>(
  location: T | null,
  previousItems: MemoryItem[],
  currentItems: MemoryItem[],
): T | null => {
  if (!location) return location;
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const removedIds = new Set(previousItems.filter((item) => !currentById.has(item.id)).map((item) => item.id));
  const belongs = (item: MemoryItem) => location.sourceField === "parent"
    ? item.parentLocationName.trim() === location.name
    : item.parentLocationName.trim() === location.parentName && item.subLocationName.trim() === location.name;
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
