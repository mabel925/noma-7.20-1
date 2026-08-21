export type EmojiKind = "item" | "sub-space" | "parent-space";

export type EmojiCatalogEntry = {
  key: string;
  category: string;
  kind: EmojiKind;
  keywords: string[];
};

const item = (key: string, category: string, keywords: string[]): EmojiCatalogEntry => ({ key, category, kind: "item", keywords });
const sub = (key: string, keywords: string[]): EmojiCatalogEntry => ({ key, category: "子级空间", kind: "sub-space", keywords });
const parent = (key: string, keywords: string[]): EmojiCatalogEntry => ({ key, category: "父级空间", kind: "parent-space", keywords });

export const EMOJI_CATALOG: EmojiCatalogEntry[] = [
  item("laptop", "数码用品", ["laptop", "computer", "notebook computer", "电脑", "笔记本"]),
  item("phone", "数码用品", ["phone", "mobile", "tablet", "ipad", "手机", "平板"]),
  item("charger", "数码用品", ["charger", "cable", "adapter", "plug", "充电", "线材", "插头"]),
  item("earphones", "数码用品", ["earphone", "headphone", "airpods", "耳机", "音响"]),
  item("camera", "数码用品", ["camera", "lens", "相机", "镜头"]),
  item("battery", "数码用品", ["battery", "power bank", "电池", "充电宝"]),
  item("gamepad", "数码用品", ["gamepad", "controller", "console", "手柄", "游戏机"]),
  item("tshirt", "衣物鞋包", ["shirt", "tshirt", "top", "衣服", "上衣", "衬衫"]),
  item("pants", "衣物鞋包", ["pants", "trousers", "skirt", "裤", "裙"]),
  item("shoes", "衣物鞋包", ["shoe", "sneaker", "sock", "鞋", "袜"]),
  item("hat", "衣物鞋包", ["hat", "cap", "帽", "配饰"]),
  item("bag", "衣物鞋包", ["bag", "backpack", "handbag", "包", "背包", "箱包"]),
  item("ring", "衣物鞋包", ["ring", "jewelry", "necklace", "戒指", "首饰", "项链"]),
  item("pill", "药品健康", ["pill", "medicine", "capsule", "药", "胶囊"]),
  item("bandage", "药品健康", ["bandage", "medical kit", "first aid", "创可贴", "医疗包"]),
  item("thermometer", "药品健康", ["thermometer", "health device", "体温计", "健康仪器"]),
  item("glasses", "药品健康", ["glasses", "contact lens", "眼镜", "隐形眼镜"]),
  item("book", "文具办公", ["book", "notebook", "journal", "书", "笔记本"]),
  item("pen", "文具办公", ["pen", "pencil", "marker", "笔", "文具"]),
  item("scissors", "文具办公", ["scissors", "剪刀"]),
  item("folder", "文具办公", ["folder", "document", "certificate", "file", "文件", "证件", "护照"]),
  item("key", "家居日用", ["key", "access card", "钥匙", "门禁"]),
  item("umbrella", "家居日用", ["umbrella", "雨伞"]),
  item("tissues", "家居日用", ["tissue", "toilet paper", "纸巾", "卷纸"]),
  item("cosmetics", "家居日用", ["cosmetics", "makeup", "lipstick", "化妆", "口红", "护肤"]),
  item("perfume", "家居日用", ["perfume", "shampoo", "bottle", "香水", "洗护", "分装瓶"]),
  item("clock", "家居日用", ["clock", "alarm", "watch", "钟", "闹钟", "手表"]),
  item("coffee", "食品厨房", ["coffee", "tea", "咖啡", "茶叶"]),
  item("cup", "食品厨房", ["cup", "mug", "bottle", "杯", "水杯"]),
  item("utensils", "食品厨房", ["utensil", "fork", "spoon", "chopstick", "餐具", "厨具", "筷子"]),
  item("apple", "食品厨房", ["apple", "food", "snack", "fruit", "食品", "零食", "水果"]),
  item("wrench", "工具杂物", ["wrench", "repair tool", "扳手", "维修工具"]),
  item("hammer", "工具杂物", ["hammer", "hardware", "锤", "五金"]),
  item("flashlight", "工具杂物", ["flashlight", "torch", "手电筒", "照明"]),
  item("lock", "工具杂物", ["lock", "padlock", "锁"]),
  item("basketball", "爱好运动", ["basketball", "ball", "sport", "篮球", "球类", "运动"]),
  item("guitar", "爱好运动", ["guitar", "instrument", "吉他", "乐器"]),
  item("puzzle", "爱好运动", ["puzzle", "toy", "board game", "拼图", "玩具", "桌游"]),
  item("tent", "爱好运动", ["tent", "camping", "outdoor", "帐篷", "露营", "户外"]),
  sub("box", ["box", "storage box", "carton", "盒", "箱", "收纳箱", "纸箱"]),
  sub("drawer", ["drawer", "cabinet", "nightstand", "bedside table", "抽屉", "柜子", "床头柜"]),
  sub("wardrobe", ["wardrobe", "closet", "衣柜"]),
  sub("shelf", ["shelf", "rack", "置物架", "层架", "书架"]),
  sub("suitcase", ["suitcase", "luggage", "行李箱"]),
  sub("safe", ["safe", "strongbox", "保险箱", "贵重物品"]),
  sub("trash", ["trash", "waste", "miscellaneous", "垃圾", "杂物", "废弃"]),
  parent("home", ["home", "house", "家", "住宅"]),
  parent("living-room", ["living room", "lounge", "客厅", "公共区域"]),
  parent("bedroom", ["bedroom", "bed room", "卧室", "主卧", "次卧"]),
  parent("kitchen", ["kitchen", "厨房"]),
  parent("bathroom", ["bathroom", "washroom", "toilet", "卫生间", "浴室", "洗手间"]),
  parent("balcony-garden", ["balcony", "garden", "terrace", "阳台", "花园"]),
  parent("office", ["office", "company", "办公室", "公司"]),
  parent("library-study", ["library", "study", "书房", "图书馆"]),
  parent("car", ["car", "vehicle", "trunk", "汽车", "车内", "后备箱"]),
  parent("garage-workshop", ["garage", "workshop", "车库", "工作坊"]),
];

export const EMOJI_KEYS = EMOJI_CATALOG.map((entry) => entry.key);
export const EMOJI_KEY_SET = new Set(EMOJI_KEYS);
export const emojiAsset = (key: string) => `/emoji/${EMOJI_KEY_SET.has(key) ? key : "box"}.png`;

const defaultKey: Record<EmojiKind, string> = {
  item: "box",
  "sub-space": "box",
  "parent-space": "home",
};

export function classifyEmojiLocally(title: string, kind: EmojiKind) {
  const normalized = title.trim().toLocaleLowerCase();
  const candidates = EMOJI_CATALOG.filter((entry) => entry.kind === kind);
  let best = candidates[0];
  let bestScore = 0;

  candidates.forEach((entry) => {
    const score = entry.keywords.reduce((total, keyword) => {
      const normalizedKeyword = keyword.toLocaleLowerCase();
      if (normalized === normalizedKeyword) return total + 10;
      if (normalized.includes(normalizedKeyword) || normalizedKeyword.includes(normalized)) return total + normalizedKeyword.length;
      return total;
    }, 0);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  });

  const fallback = candidates.find((entry) => entry.key === defaultKey[kind]) || candidates[0];
  const resolved = bestScore > 0 ? best : fallback;
  return { title: title.trim(), category: resolved.category, icon_key: resolved.key };
}
