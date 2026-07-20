import React, { useState } from "react";
import { X, Search, Sparkles, MapPin, Settings } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SystemSettingsPanel } from "./SystemSettingsPanel";

export interface MemoryItem {
  id: string;
  name: string;
  category: string;
  price: string;
  date: string;
  emoji: string;
  stickerUrl?: string;
  parentLocationName: string;
  subLocationName: string;
  parentLocationImg?: string;
  subLocationImg?: string;
}

interface MemoryListProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryItem[];
}

const normalizeCategory = (cat: string): string => {
  const clean = (cat || "").toLowerCase().trim();
  if (clean === "all" || clean === "全部") return "all";
  if (clean.includes("electron") || clean.includes("数码") || clean.includes("家电") || clean.includes("设备") || clean.includes("电子") || clean.includes("tech")) {
    return "electronics";
  }
  if (clean.includes("apparel") || clean.includes("衣物") || clean.includes("配饰") || clean.includes("clothing") || clean.includes("coat") || clean.includes("scarf")) {
    return "apparel";
  }
  if (clean.includes("doc") || clean.includes("书籍") || clean.includes("文档") || clean.includes("证件") || clean.includes("paper") || clean.includes("book") || clean.includes("passport")) {
    return "docs";
  }
  if (clean.includes("house") || clean.includes("百货") || clean.includes("日用") || clean.includes("necessities") || clean.includes("goods") || clean.includes("mug") || clean.includes("cup") || clean.includes("key") || clean.includes("glasses")) {
    return "housewares";
  }
  return "others";
};

export const MemoryList: React.FC<MemoryListProps> = ({
  isOpen,
  onClose,
  memories,
}) => {
  const [activeTab, setActiveTab] = useState<"spaces" | "items">("spaces");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  if (!isOpen) return null;

  // Grouping by Spaces (Parent Locations)
  const spacesMap: { [key: string]: MemoryItem[] } = {};
  memories.forEach((item) => {
    const parent = item.parentLocationName || "Bedroom";
    if (!spacesMap[parent]) {
      spacesMap[parent] = [];
    }
    spacesMap[parent].push(item);
  });

  const spacesList = Object.keys(spacesMap).map((parentName) => {
    const spaceItems = spacesMap[parentName];
    // Find the first available parent image or fallback
    const parentImg =
      spaceItems.find((itm) => itm.parentLocationImg)?.parentLocationImg ||
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&auto=format&fit=crop&q=80";

    // Sub-locations list
    const subLocations = Array.from(
      new Set(spaceItems.map((itm) => itm.subLocationName).filter(Boolean))
    );

    return {
      name: parentName,
      imgUrl: parentImg,
      itemCount: spaceItems.length,
      subLocations,
    };
  });

  // Filtered Items for Items tab
  const itemsCategories = ["All", "Electronics", "Apparel", "Docs", "Housewares", "Others"];
  
  const filteredItems = memories.filter((item) => {
    // Category match
    const itemNorm = normalizeCategory(item.category);
    const activeNorm = normalizeCategory(activeCategory);
    const categoryMatch = activeNorm === "all" || itemNorm === activeNorm;
    
    // Search match
    const searchMatch =
      !searchQuery.trim() ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.parentLocationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subLocationName.toLowerCase().includes(searchQuery.toLowerCase());

    return categoryMatch && searchMatch;
  });

  // Helper to split Space Cards into 2 Columns for Waterfall View
  const col1: typeof spacesList = [];
  const col2: typeof spacesList = [];
  spacesList.forEach((space, idx) => {
    if (idx % 2 === 0) col1.push(space);
    else col2.push(space);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{
        type: "tween",
        duration: 0.45,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="absolute inset-0 bg-[#E9E6E1] z-50 flex flex-col overflow-hidden select-none"
    >
      {/* 56px Secondary Top Navigation Bar (with 44px safe-area top status bar offset) */}
      <div className="memory-header-nav w-full h-[100px] pt-[44px] pb-1 px-[20px] flex items-center justify-between bg-[#E9E6E1] shrink-0 z-50 select-none">
        <div className="flex items-center gap-2">
          {/* Back/Return Icon */}
          <button
            onClick={onClose}
            className="w-[24px] h-[24px] active:scale-95 flex items-center justify-center transition-all cursor-pointer border-0 outline-none bg-transparent hover:opacity-70"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.74009 17.5658L1.55258 11.4079L7.74009 5.25M1.55258 11.4079H16.4064C19.9661 11.4079 22.5175 14.8418 21.4901 18.25" stroke="black" strokeWidth="2.14584" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {/* Memory Title next to Return Icon */}
          <span className="text-[24px] text-[#232121] tracking-tight leading-none font-sans font-bold" style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
            Memory
          </span>
        </div>

        {/* Custom Search Icon Toggle on the Right */}
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {isSearchOpen && (
              <motion.input
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 140, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/50 border border-black/5 rounded-full px-3 py-1.5 text-xs font-sans text-neutral-800 placeholder-neutral-500 font-semibold outline-none focus:bg-white transition-all"
                autoFocus
              />
            )}
          </AnimatePresence>
          <button
            onClick={() => setIsSearchOpen((prev) => !prev)}
            className="w-[22px] h-[22px] active:scale-95 flex items-center justify-center transition-all cursor-pointer border-0 outline-none bg-transparent hover:opacity-70"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g clipPath="url(#clip0_176_2470)">
                <path d="M16.1901 16.5905C17.9855 14.9705 19.114 12.6253 19.114 10.0166C19.114 5.12803 15.1511 1.16504 10.2625 1.16504C5.37388 1.16504 1.41089 5.12803 1.41089 10.0166C1.41089 14.9052 5.37388 18.8682 10.2625 18.8682C10.9228 18.8682 11.5662 18.7959 12.1853 18.6588" stroke="black" strokeWidth="1.96702" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16.3304 16.5767L20.5891 20.8353" stroke="black" strokeWidth="1.96702" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
              <defs>
                <clipPath id="clip0_176_2470">
                  <rect width="22" height="22" fill="white"/>
                </clipPath>
              </defs>
            </svg>
          </button>
          
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-[22px] h-[22px] active:scale-95 flex items-center justify-center transition-all cursor-pointer border-0 outline-none bg-transparent hover:opacity-70 text-black ml-2"
            title="API Settings"
          >
            <Settings className="w-[20px] h-[20px] stroke-[2.2]" />
          </button>
        </div>
      </div>

      {/* Scrollable container inside device bounds (starts under fixed header) */}
      <div className="flex-1 overflow-y-auto px-[20px] pt-4 pb-[calc(20px+var(--safe-area-inset-bottom,0px))] no-scrollbar">
        
        {/* Spaces vs Items Primary Toggle Tab Panel */}
        <div className="flex gap-8 items-center mb-6 select-none pl-1">
          {/* Spaces Tab */}
          <div className="relative cursor-pointer" onClick={() => setActiveTab("spaces")}>
            <span
              className={`relative z-10 text-[18px] font-sans font-bold transition-all ${
                activeTab === "spaces" ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              Spaces
            </span>
            {activeTab === "spaces" && (
              <motion.img
                layoutId="tabSelectedUnderline"
                src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/selected-line.png"
                alt="Selected"
                className="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-[62px] h-[17px] object-contain pointer-events-none select-none z-0"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                referrerPolicy="no-referrer"
              />
            )}
          </div>

          {/* Items Tab */}
          <div className="relative cursor-pointer" onClick={() => setActiveTab("items")}>
            <span
              className={`relative z-10 text-[18px] font-sans font-bold transition-all ${
                activeTab === "items" ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              Items
            </span>
            {activeTab === "items" && (
              <motion.img
                layoutId="tabSelectedUnderline"
                src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/selected-line.png"
                alt="Selected"
                className="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-[62px] h-[17px] object-contain pointer-events-none select-none z-0"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </div>

        {/* Render Tab Contents */}
        {activeTab === "spaces" ? (
          /* Spaces: Column-based Waterfall Flow Layout */
          <div className="flex gap-[8px] items-start select-none">
            {/* Column 1 */}
            <div className="flex-1 flex flex-col gap-[8px]">
              {col1.map((space) => (
                <div
                  key={space.name}
                  className="bg-white rounded-[12px] p-[8px] pb-3 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col overflow-hidden select-none"
                >
                  {/* Space Parent Image with exact 4:5 aspect */}
                  <div className="rounded-[8px] overflow-hidden aspect-[4/5] w-full bg-neutral-100 flex-shrink-0">
                    <img
                      src={space.imgUrl}
                      alt={space.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Title & Info */}
                  <div className="mt-2.5 px-1 flex flex-col">
                    <div className="flex items-start text-[#232121]">
                      <span className="text-[14px] mt-[1.5px] mr-1 select-none shrink-0">📍</span>
                      <div className="flex flex-col">
                        <span className="font-sans font-bold text-[14px] tracking-tight leading-snug">
                          {space.name}
                        </span>
                        <span className="text-[11px] font-sans font-semibold text-neutral-400/80 mt-0.5 tracking-tight">
                          {space.itemCount} items
                        </span>
                      </div>
                    </div>

                    {/* Sub-location Tags (truncated intelligently, max 2 rows) */}
                    {space.subLocations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3 pl-0">
                        {space.subLocations.slice(0, 3).map((sub, sidx) => (
                          <div
                            key={`${sub}-${sidx}`}
                            className="bg-[#F3F1EC] text-neutral-500 font-sans text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap"
                          >
                            {sub}
                          </div>
                        ))}
                        {space.subLocations.length > 3 && (
                          <div className="bg-[#F3F1EC] text-neutral-500 font-sans text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap">
                            +{space.subLocations.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Column 2 */}
            <div className="flex-1 flex flex-col gap-[8px]">
              {col2.map((space) => (
                <div
                  key={space.name}
                  className="bg-white rounded-[12px] p-[8px] pb-3 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col overflow-hidden select-none"
                >
                  {/* Space Parent Image with exact 4:5 aspect */}
                  <div className="rounded-[8px] overflow-hidden aspect-[4/5] w-full bg-neutral-100 flex-shrink-0">
                    <img
                      src={space.imgUrl}
                      alt={space.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Title & Info */}
                  <div className="mt-2.5 px-1 flex flex-col">
                    <div className="flex items-start text-[#232121]">
                      <span className="text-[14px] mt-[1.5px] mr-1 select-none shrink-0">📍</span>
                      <div className="flex flex-col">
                        <span className="font-sans font-bold text-[14px] tracking-tight leading-snug">
                          {space.name}
                        </span>
                        <span className="text-[11px] font-sans font-semibold text-neutral-400/80 mt-0.5 tracking-tight">
                          {space.itemCount} items
                        </span>
                      </div>
                    </div>

                    {/* Sub-location Tags (truncated intelligently, max 2 rows) */}
                    {space.subLocations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3 pl-0">
                        {space.subLocations.slice(0, 3).map((sub, sidx) => (
                          <div
                            key={`${sub}-${sidx}`}
                            className="bg-[#F3F1EC] text-neutral-500 font-sans text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap"
                          >
                            {sub}
                          </div>
                        ))}
                        {space.subLocations.length > 3 && (
                          <div className="bg-[#F3F1EC] text-neutral-500 font-sans text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap">
                            +{space.subLocations.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Items: Category tabs and 2x2 grid */
          <div className="flex flex-col select-none">
            
            {/* Secondary category horizontal slider */}
            <div className="flex gap-2 items-center overflow-x-auto no-scrollbar pb-4 select-none">
              {itemsCategories.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 text-[12px] font-sans font-bold rounded-full transition-all shrink-0 cursor-pointer border-0 outline-none ${
                      isActive
                        ? "bg-white text-black"
                        : "bg-white/40 text-neutral-500"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* 2x2 Grid of Items */}
            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-neutral-400 font-sans font-medium text-xs">
                No items found in this category.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 mt-4 select-none">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="relative flex flex-col items-center justify-center overflow-visible select-none h-[160px] cursor-pointer hover:scale-105 active:scale-95 transition-all"
                  >
                    {/* Sticker Display Area - transparent background, centered */}
                    <div className="relative w-full h-full flex items-center justify-center select-none overflow-visible">
                      {/* Decorative Soft Yellow Gaussian Glow underlay (delicate, matching the design) */}
                      <div className="absolute w-[80px] h-[80px] rounded-full bg-[#FFB300] blur-[24px] opacity-25 pointer-events-none z-0" />

                      {/* Cutout sticker element wrapper */}
                      <div className="relative rotate-[-1.5deg] flex flex-col items-center justify-center w-[120px] h-[120px] overflow-visible">
                        {item.stickerUrl ? (
                          <img
                            src={item.stickerUrl}
                            alt={item.name}
                            className="w-full h-full object-contain block select-none filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-[120px] h-[120px] flex items-center justify-center overflow-visible text-[64px] filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.15)] select-none">
                            {item.emoji || "📦"}
                          </div>
                        )}

                        {/* Hand-drawn Alkatra font styled title label overlapping slightly at bottom */}
                        <div
                          className="absolute bottom-[-10px] left-[-30px] right-[-30px] text-center font-alkatra z-20 pointer-events-none select-none"
                          style={{
                            fontSize: "24px",
                            fontWeight: "700",
                            color: "#000000",
                            WebkitTextStroke: "3.5px #ffffff",
                            paintOrder: "stroke fill",
                            lineHeight: "1.1",
                          }}
                        >
                          {item.name}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 综合设置面板 */}
      <AnimatePresence>
        {isSettingsOpen && (
          <SystemSettingsPanel
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
