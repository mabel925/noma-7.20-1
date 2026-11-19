import type { MemoryItem } from "../components/MemoryList";
import { classifyEmojiLocally, emojiAsset, refreshEmojiAssetUrl } from "../data/emojiCatalog";
import { getCachedImageResource, getImageResource } from "./imageResources";

export const memoryImageSources = (items: MemoryItem[]) => [...new Set(items.flatMap((item) => [
  item.stickerUrl || (item.emoji && /^[a-z0-9-]+$/i.test(item.emoji) ? emojiAsset(item.emoji) : ""),
  refreshEmojiAssetUrl(item.parentLocationImg) || (item.parentLocationName ? emojiAsset(classifyEmojiLocally(item.parentLocationName, "parent-space").icon_key) : ""),
  refreshEmojiAssetUrl(item.subLocationImg) || (item.subLocationName ? emojiAsset(classifyEmojiLocally(item.subLocationName, "sub-space").icon_key) : ""),
]).filter((src): src is string => Boolean(src)))];

// Two low-priority reads at a time. Pausing stops new requests; existing reads
// still finish and enter the same cache used by visible screens.
export const createMemoryImageWarmup = (canRun: () => boolean) => {
  const seen = new Set<string>();
  const queue: string[] = [];
  let stopped = false;
  let running = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const resume = () => {
    if (stopped || timer !== undefined || !queue.length || !canRun()) return;
    timer = setTimeout(() => { timer = undefined; pump(); }, 50);
  };
  const pump = () => {
    while (!stopped && canRun() && running < 2 && queue.length) {
      const src = queue.shift()!;
      if (getCachedImageResource(src)) continue;
      running += 1;
      void getImageResource(src, "low").catch(() => { seen.delete(src); }).finally(() => {
        running -= 1;
        resume();
      });
    }
  };
  return {
    add(sources: string[]) {
      for (const src of sources) {
        if (!src || seen.has(src)) continue;
        seen.add(src);
        queue.push(src);
      }
      resume();
    },
    resume,
    stop() { stopped = true; queue.length = 0; clearTimeout(timer); },
  };
};
