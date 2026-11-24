export const DEMO_DURATION_MS = 15_000;
export const DEMO_STAGES = ["capture", "scan", "cutout", "save", "find"] as const;
export function getDemoStage(elapsed: number): typeof DEMO_STAGES[number] {
  const time = ((elapsed % DEMO_DURATION_MS) + DEMO_DURATION_MS) % DEMO_DURATION_MS;
  if (time < 2400) return "capture";
  if (time < 5600) return "scan";
  if (time < 7800) return "cutout";
  if (time < 10_800) return "save";
  return "find";
}
