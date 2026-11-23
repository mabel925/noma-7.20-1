import { useSyncExternalStore } from "react";

export type Language = "en" | "zh";
export const LANGUAGE_STORAGE_KEY = "noma-language";
const readSavedLanguage = (): Language => {
  try { return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "zh" ? "zh" : "en"; }
  catch { return "en"; }
};
let language = readSavedLanguage();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setLanguage(next: Language) {
  if (next !== "en" && next !== "zh") return;
  language = next;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* Keep the session usable when storage is blocked. */ }
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  listeners.forEach((listener) => listener());
}
export const getLanguage = () => language;
export function useLanguage() {
  const language = useSyncExternalStore(subscribe, getLanguage, () => "en" as Language);
  return { language, setLanguage, t };
}
if (typeof window !== "undefined") {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  window.addEventListener("storage", (event) => {
    if (event.key !== LANGUAGE_STORAGE_KEY && event.key !== null) return;
    language = readSavedLanguage();
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    listeners.forEach((listener) => listener());
  });
}

const zh: Record<string, string> = {
  "Profile": "个人资料", "Language": "语言", "Back": "返回", "Back to home": "返回首页",
  "Username": "用户名", "Edit username": "编辑用户名", "Save": "保存", "Saving...": "保存中…",
  "Cancel": "取消", "Plan": "套餐", "Preview": "内测版", "Free": "免费版", "Unlimited": "不限量",
  "AI scans remaining": "AI 识别剩余次数", "Items": "物品", "Sign out": "退出登录", "Signing out...": "退出中…",
  "Your memory data is stored in your private cloud account.": "你的记忆数据保存在专属的云端账户中。",
  "Unable to update your name.": "用户名保存失败，请重试。", "Unable to sign out. Please try again.": "退出失败，请重试。",
  "Name cannot be empty.": "用户名不能为空。", "This name is already in use.": "这个用户名已被使用。",
  "Please sign in before editing your name.": "请先登录，再修改用户名。", "Loading...": "加载中…", "Unavailable": "暂不可用",
  "Login": "登录", "Log in": "登录", "Open account": "打开个人资料", "Noma account": "noma 账户",
  "Enter your email and we will send a secure verification code.": "输入邮箱，获取登录验证码。",
  "enter your email": "输入你的邮箱", "Verify email": "验证邮箱", "please enter email verification code": "请输入邮箱验证码",
  "Use a different email": "使用其他邮箱", "Sending...": "发送中…", "Send code": "发送验证码",
  "Resend code": "重新发送", "Resend in {count}s": "{count} 秒后重新发送", "Signing in...": "登录中…", "Continue": "继续",
  "Enter a valid email address.": "请输入有效的邮箱地址。", "Unable to send the verification code.": "验证码发送失败，请重试。",
  "Unable to resend the verification code.": "验证码重新发送失败，请重试。", "The verification code is invalid.": "验证码无效，请重试。",
  "Use 000000 for local testing.": "本地测试请输入验证码 000000。",
  "Memory": "记忆库", "Spaces": "地点", "Space": "地点", "Sub-Spaces": "子地点", "Sub-Space": "子地点",
  "Existing Space": "已有地点", "No saved spaces yet": "还没有保存地点", "No sub-locations yet": "还没有子地点",
  "No sub-spaces": "还没有子地点", "Select All": "全选", "Deselect All": "取消全选", "Delete": "删除",
  "Try again": "重试", "Delete selected items?": "删除选中的物品？", "No items found in this category.": "该分类下还没有物品。",
  "Finish syncing Memory before saving or deleting this location.": "记忆库同步完成后，即可保存或删除此地点。",
  "items": "件物品", "item": "件物品", "items inside": "件物品", "items)": "件物品）", "in": "位于", "Built": "创建于",
  "Switch parent location": "切换上级地点", "Switch sub-location": "切换子地点", "Upload photo instead": "上传照片",
  "Delete selected items": "删除选中物品", "Cancel editing": "取消编辑", "Delete sub-location": "删除子地点",
  "Edit item title": "编辑物品名称", "Reset item image": "重置物品图片", "Delete item": "删除物品", "Edit parent location": "编辑上级地点",
  "Emoji Mode": "表情模式", "Camera": "拍摄", "New Item": "新物品", "New Space": "新地点", "New Sub-Space": "新子地点",
  "eg. Nightstand": "如：床头柜", "Retry camera": "重试相机", "Skip": "跳过", "Build 3 days ago": "创建于 3 天前",
  "Electronics": "电子产品", "Apparel": "衣物", "Docs": "证件", "Housewares": "家居日用", "Others": "其他",
  "Done": "完成", "Switch": "切换", "Switch currency": "切换货币", "Show me what you want to remember.": "让我看看你想记住的物品。",
  "Please Hold Steady": "请保持稳定", "Confirm Save": "确认保存", "Reset / Retake": "重置 / 重拍",
  "Not what you expected？ Tap to adjust": "不太准确？点击调整", "Tap text to adjust": "点击文字调整", "Upload file instead": "上传图片",
  "Capture Little Home": "拍下收纳位置", "Cancel Storage Flow": "取消收纳", "Retry Little Home Capture": "重新拍摄收纳位置",
  "View/Edit Sub-location": "查看 / 编辑子地点", "Capture Parent Scene": "拍摄上级地点", "Save Memory & Storage Spot": "保存物品与收纳位置",
  "Retry Scene Capture": "重新拍摄地点", "Recognizing...": "识别中…", "Discard this capture?": "放弃本次拍摄？",
  "This will cancel the object and location results from this capture flow.": "本次拍摄的物品与地点结果将被取消。",
  "Keep Editing": "继续编辑", "Discard": "放弃", "Mock uploaded photo scanning": "从相册选择", "Processing image...": "正在处理图片…",
  "Recognizing item...": "正在识别物品…", "noma couldn't recognize it. Please enter a name.": "noma 没有认出来，手动输一下吧。",
  "Talk to Noma": "和 noma 说说", "Add item": "添加物品", "Looking through your memory…": "正在翻找你的记忆…",
  "Find it!!": "找到了！", "You have {count} of them. Take a look below.": "找到 {count} 件，看看下面这些。",
  "I found that space. Take a look below.": "找到这个地点了，看看下面。",
  "I found {count} spaces matching that. Which one do you want to check?": "找到 {count} 个相关地点，你想看看哪一个？",
  "Hi, I'm noma. Snap a photo of the items scattered around your space, and I'll help you find the perfect home for them.": "嗨，我是 noma。拍下散落在身边的物品，我来帮你记住它们的家。",
  "Noma only keeps an eye on your things and spaces. Ask me what you own or where something is, and I'll look through your memory.": "noma 只关心你的物品和地点。告诉我想找什么，我来翻翻你的记忆。",
  "I don't remember seeing “{query}” yet. Tap + to introduce it to me, and I won't forget it next time.": "我好像还没见过“{query}”。点击 + 让我认识它，下次就记住啦。",
  "{count} items inside": "内有 {count} 件物品", "{count} items": "{count} 件物品",
  "Toggle Chat View": "打开聊天", "Camera Scanner Action": "添加物品", "Add to Home Screen": "添加到主屏幕",
  "Add to Home screen": "添加到主屏幕", "Organize and find, anywhere.": "随时收纳，随处寻物。", "Add": "添加",
  "Give noma a home.": "把 noma 放到主屏幕。", "A full-screen space, one tap away.": "轻轻一点，开启全屏体验。",
  "Tap Share": "点击分享", "Find it in Safari’s toolbar or page menu.": "在 Safari 工具栏或页面菜单中找到分享按钮。",
  "Scroll down the share menu to find it.": "在分享菜单中向下滑动找到它。", "Tap Add": "点击添加",
  "If shown, keep “Open as Web App” on. Then open noma from your Home Screen.": "如有“作为网页 App 打开”选项，请保持开启。然后从主屏幕打开 noma。",
  "Open the browser menu": "打开浏览器菜单", "Tap the menu beside the address bar.": "点击地址栏旁的菜单。",
  "Choose “Install app” or “Add to Home screen”, then confirm.": "选择“安装应用”或“添加到主屏幕”，然后确认。",
  "Open noma": "打开 noma", "Find noma on your Home Screen and tap to open.": "在主屏幕找到 noma，点击打开。",
  "Use your browser’s menu to add noma instead.": "请通过浏览器菜单添加 noma。", "Install noma": "安装 noma", "Maybe later": "稍后再说",
  "Opening…": "打开中…", "Got it": "知道了", "All": "全部", "+ Value": "+ 价值", "Select": "选择",
  "Loading your memories…": "正在加载记忆…", "Loading…": "加载中…", "Load more memories": "加载更多记忆",
  "Untitled Space": "未命名地点", "AI Loading...": "AI 处理中…",
  "Now, show me its little home.": "现在，拍下它的收纳位置。", "Great! Now, show me the exact spot.": "很好！点一下它的具体位置。",
  "A bit further... I want to see the whole scene.": "退后一点，让我看看完整的地点。", "Does this scene capture it well?": "这个地点拍清楚了吗？",
  "Flip card to see the location": "翻转卡片查看位置", "Flip card to see all items": "翻转卡片查看全部物品",
  "Select all": "全选", "Deselect all": "取消全选", "Retake photo": "重新拍摄", "Retake location photo": "重新拍摄地点",
  "Location name": "地点名称", "Other": "其他", "Today": "今天", "Yesterday": "昨天", "Send": "发送", "Space key": "空格",
  "Search": "搜索", "Search your memory": "搜索你的记忆", "Search memories": "搜索记忆", "Search items": "搜索物品",
  "Saving": "保存中…", "OK": "确定", "Parent location": "上级地点", "Sub-location": "子地点",
  "Delete {name}?": "删除“{name}”？",
  "This will permanently remove the selected items from this sub-location.": "将永久删除此子地点中选中的物品。",
  "This will delete the sub-location and all items inside it.": "将删除此子地点及其中所有物品。",
  "This will delete this location, all sub-locations, and every item inside it.": "将删除此地点、所有子地点及其中全部物品。",
  "This will delete this location and all items inside it.": "将删除此地点及其中全部物品。",
  "This will permanently remove the selected items from this location.": "将永久删除此地点中选中的物品。",
  "This will permanently remove this item from memory.": "将从记忆库中永久删除此物品。",
  "This will delete the parent location, all sub-locations, and every item inside it.": "将删除上级地点、所有子地点及其中全部物品。",
  "This will permanently remove the selected items from Memory.": "将从记忆库中永久删除选中的物品。",
  "Open this page in {browser} first using this browser’s menu, then follow the steps below.": "请通过浏览器菜单在 {browser} 中打开本页，再按以下步骤操作。",
};

export function t(text: string, values: Record<string, string | number> = {}): string {
  const result = language === "zh" ? zh[text] || text : text;
  return result.replace(/\{([^{}]+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder);
}

/** Translate only known application messages; never translate user-entered titles. */
export function translateNomaMessage(text: string): string {
  if (language === "en") return text;
  if (zh[text]) return zh[text];
  const patterns: Array<[RegExp, string, string]> = [
    [/^You have (\d+) of them\. Take a look below\.$/, "You have {count} of them. Take a look below.", "count"],
    [/^I found (\d+) spaces matching that\. Which one do you want to check\?$/, "I found {count} spaces matching that. Which one do you want to check?", "count"],
    [/^I don't remember seeing “(.+)” yet\. Tap \+ to introduce it to me, and I won't forget it next time\.$/, "I don't remember seeing “{query}” yet. Tap + to introduce it to me, and I won't forget it next time.", "query"],
  ];
  for (const [pattern, key, slot] of patterns) {
    const match = text.match(pattern);
    if (match) return t(key, { [slot]: match[1] });
  }
  return text;
}
