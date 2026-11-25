type DesktopEntryEnvironment = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  mobile?: boolean;
  standalone: boolean;
  finePointer: boolean;
  developmentPreview: boolean;
  viewportWidth?: number;
};

/** Mobile devices always use the app; narrow desktop previews use its mobile layout too. */
export function shouldShowDesktopEntry(environment: DesktopEntryEnvironment): boolean {
  if (environment.developmentPreview || environment.standalone) return false;
  if (environment.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(environment.userAgent)) return false;
  if (environment.platform === "MacIntel" && environment.maxTouchPoints > 1) return false;
  if (environment.viewportWidth !== undefined && environment.viewportWidth < 768) return false;
  return /Windows|Macintosh|X11|Linux|CrOS/i.test(environment.userAgent) || environment.finePointer;
}
