import type { MemoryItem } from "../components/MemoryList";

// Capture the user's intent before queued saves or background pages change the
// baseline. A newly downloaded page must never become an implicit deletion.
export const memoryChanges = (before: MemoryItem[], after: MemoryItem[]) => {
  const previous = new Map(before.map((item) => [item.id, item]));
  const remaining = new Set(after.map((item) => item.id));
  return {
    removed: new Set(before.filter((item) => !remaining.has(item.id)).map((item) => item.id)),
    changed: after.filter((item) => previous.get(item.id) !== item),
  };
};

export const applyMemoryChanges = (items: MemoryItem[], changes: ReturnType<typeof memoryChanges>) => {
  const replacements = new Map(changes.changed.map((item) => [item.id, item]));
  const result = items.filter((item) => !changes.removed.has(item.id)).map((item) => {
    const replacement = replacements.get(item.id);
    replacements.delete(item.id);
    return replacement || item;
  });
  return [...result, ...replacements.values()];
};

// Apply saved URLs/versions only to the exact local revision that was sent.
// Preserve newer edits, deletions and pages that arrived during the save.
export const reconcileSavedMemories = (current: MemoryItem[], submitted: MemoryItem[], saved: MemoryItem[]) => {
  const sent = new Map(submitted.map((item) => [item.id, item]));
  const persisted = new Map(saved.map((item) => [item.id, item]));
  const reconciled = current.map((item) => sent.get(item.id) === item ? persisted.get(item.id) || item : item);
  return reconciled.every((item, index) => item === current[index]) ? current : reconciled;
};
