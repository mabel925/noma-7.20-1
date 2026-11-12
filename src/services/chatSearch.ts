import type { MemoryItem } from "../components/MemoryList";
import type { ChatSpaceResult } from "../types/chat";
import { memoryStorage } from "./memoryStorage";

export type ChatSearchResult =
  | { kind: "items"; items: MemoryItem[] }
  | { kind: "spaces"; spaces: ChatSpaceResult[] }
  | { kind: "empty" }
  | { kind: "unsupported" };

const unsupportedPatterns = [
  /\b(weather|forecast|temperature|news|stock|recipe|translate|translation)\b/i,
  /\b(write|draft|compose)\b.*\b(email|letter|essay|code|poem)\b/i,
  /\b(?:sort|rank|move|delete|edit)\b.*\b(?:all|everything|every item|inventory)\b/i,
  /天气|气温|新闻|股票|菜谱|翻译|写.*(?:邮件|请假条|作文|代码|诗)/,
  /(?:批量|全部|所有).*(?:排序|移动|删除|修改|盘点)|(?:排序|移动|删除|修改|盘点).*(?:批量|全部|所有)/,
];

const spaceIntentPatterns = [
  /\b(?:in|inside|room|space|drawer|wardrobe|closet|cabinet|shelf|box|nightstand|bedroom|kitchen|bathroom|office|garage)\b/i,
  /(?:房间|空间|抽屉|衣柜|柜子|架子|盒子|床头柜|卧室|厨房|浴室|书房|车库).*(?:有什么|里面|内)|(?:有什么|里面|内).*(?:房间|空间|抽屉|衣柜|柜子|架子|盒子|床头柜|卧室|厨房|浴室|书房|车库)/,
];

const normalize = (value: string) => value
  .normalize("NFKC")
  .toLocaleLowerCase()
  .replace(/[?!.,，。！？:：;；"'“”‘’()[\]{}]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const searchTermFromChatQuery = (query: string) => {
  let value = normalize(query);
  const replacements: RegExp[] = [
    /^(?:please\s+)?(?:can you\s+)?(?:help me\s+)?(?:find|locate|show me)\s+(?:my\s+|the\s+)?/i,
    /^(?:where (?:is|are)\s+)(?:my\s+|the\s+)?/i,
    /^(?:what(?:'s| is)?|which items? are)\s+(?:in|inside)\s+(?:my\s+|the\s+)?/i,
    /^(?:what do i have)\s+(?:in|inside)\s+(?:my\s+|the\s+)?/i,
    /^(?:list|open|check)\s+(?:items?\s+)?(?:in|inside)?\s*(?:my\s+|the\s+)?/i,
    /(?:\s+)?(?:where is it|where are they)$/i,
    /^(?:请|麻烦)?(?:帮我)?(?:找一下|找找|查找|看看)\s*(?:我的|这个|那个)?/,
    /^(?:我的)?(.+?)(?:在哪里|在哪儿|在哪|放哪了|放在哪里)$/,
    /^(?:我的)?(.+?)(?:里|里面|内)(?:放了)?(?:什么|有哪些东西|有什么)$/,
  ];

  for (const pattern of replacements) {
    const match = value.match(pattern);
    if (match?.[1]) value = match[1];
    else value = value.replace(pattern, "");
    value = value.trim();
  }

  return value.replace(/^(?:my|the|a|an|我的)\s+/i, "").trim() || normalize(query);
};

const includesTerm = (value: string | undefined, term: string) =>
  Boolean(value && normalize(value).includes(term));

const itemSearchValues = (item: MemoryItem) => [
  item.name,
  ...(item.aliases || []),
  ...(item.attributes?.colors || []),
  ...(item.attributes?.materials || []),
  ...(item.attributes?.features || []),
  item.attributes?.brand,
].filter((value): value is string => Boolean(value));

const itemMatchesTerm = (item: MemoryItem, term: string) => {
  const searchableText = normalize(itemSearchValues(item).join(" "));
  const tokens = normalize(term).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => searchableText.includes(token));
};

const exactTerm = (value: string | undefined, term: string) =>
  Boolean(value && normalize(value) === term);

const sortItems = (items: MemoryItem[], term: string) => [...items].sort((left, right) => {
  const score = (item: MemoryItem) => {
    if (exactTerm(item.name, term)) return 0;
    if (normalize(item.name).startsWith(term)) return 1;
    if (item.aliases?.some((alias) => exactTerm(alias, term))) return 2;
    if (item.aliases?.some((alias) => normalize(alias).startsWith(term))) return 3;
    return 4;
  };
  return score(left) - score(right) || left.name.localeCompare(right.name);
});

const childSpace = (parentName: string, childName: string, items: MemoryItem[]): ChatSpaceResult => ({
  id: `child:${parentName}::${childName}`,
  kind: "child",
  name: childName,
  parentName,
  imageUrl: items.find((item) => item.subLocationImg)?.subLocationImg || "",
  itemCount: items.length,
  items,
  subSpaces: [],
});

const buildSpaceResults = (items: MemoryItem[], term: string): ChatSpaceResult[] => {
  const parentGroups = new Map<string, MemoryItem[]>();
  const childGroups = new Map<string, MemoryItem[]>();

  items.forEach((item) => {
    const parentName = item.parentLocationName?.trim();
    const childName = item.subLocationName?.trim();
    if (parentName) parentGroups.set(parentName, [...(parentGroups.get(parentName) || []), item]);
    if (childName) {
      const key = `${parentName || ""}::${childName}`;
      childGroups.set(key, [...(childGroups.get(key) || []), item]);
    }
  });

  const matchingParents = [...parentGroups.entries()]
    .filter(([name]) => includesTerm(name, term))
    .sort(([left], [right]) => Number(!exactTerm(left, term)) - Number(!exactTerm(right, term)) || left.localeCompare(right));

  if (matchingParents.length > 0) {
    return matchingParents.flatMap(([parentName, parentItems]) => {
      const children = [...childGroups.entries()]
        .filter(([key]) => key.startsWith(`${parentName}::`))
        .map(([key, childItems]) => childSpace(parentName, key.slice(parentName.length + 2), childItems));
      const parent: ChatSpaceResult = {
        id: `parent:${parentName}`,
        kind: "parent",
        name: parentName,
        parentName,
        imageUrl: parentItems.find((item) => item.parentLocationImg)?.parentLocationImg || "",
        itemCount: parentItems.length,
        items: parentItems,
        subSpaces: children.map((child) => ({ name: child.name, itemCount: child.itemCount })),
      };
      return [parent, ...children];
    });
  }

  return [...childGroups.entries()]
    .filter(([key]) => includesTerm(key.split("::").at(-1), term))
    .map(([key, childItems]) => {
      const [parentName, childName] = key.split("::");
      return childSpace(parentName, childName, childItems);
    })
    .sort((left, right) => Number(!exactTerm(left.name, term)) - Number(!exactTerm(right.name, term)) || left.name.localeCompare(right.name));
};

export async function searchChatMemory(options: {
  ownerId: string;
  isMock: boolean;
  query: string;
  loadedItems: MemoryItem[];
}): Promise<ChatSearchResult> {
  const { ownerId, isMock, query, loadedItems } = options;
  if (unsupportedPatterns.some((pattern) => pattern.test(query))) return { kind: "unsupported" };

  const term = searchTermFromChatQuery(query);
  const candidates = isMock
    ? loadedItems.filter((item) =>
        itemMatchesTerm(item, term)
        || includesTerm(item.parentLocationName, term)
        || includesTerm(item.subLocationName, term))
    : await memoryStorage.searchItems(ownerId, term);

  const itemMatches = sortItems(candidates.filter((item) => itemMatchesTerm(item, term)), term);
  const spaceMatches = buildSpaceResults(candidates, term);
  const wantsSpace = spaceIntentPatterns.some((pattern) => pattern.test(query));

  if (spaceMatches.length > 0 && (wantsSpace || itemMatches.length === 0)) {
    return { kind: "spaces", spaces: spaceMatches };
  }
  if (itemMatches.length > 0) return { kind: "items", items: itemMatches };
  if (spaceMatches.length > 0) return { kind: "spaces", spaces: spaceMatches };
  return { kind: "empty" };
}
