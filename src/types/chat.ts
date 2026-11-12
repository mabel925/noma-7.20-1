import type { MemoryItem } from "../components/MemoryList";

export type ChatSpaceResult = {
  id: string;
  kind: "parent" | "child";
  name: string;
  parentName: string;
  imageUrl: string;
  itemCount: number;
  items: MemoryItem[];
  subSpaces: Array<{
    name: string;
    itemCount: number;
  }>;
};

export type ChatMessage = {
  id: string;
  sender: "noma" | "user";
  text: string;
  items?: MemoryItem[];
  spaces?: ChatSpaceResult[];
};

export type MemoryOpenTarget =
  | { requestId: number; kind: "item"; item: MemoryItem }
  | { requestId: number; kind: "space"; space: ChatSpaceResult };
