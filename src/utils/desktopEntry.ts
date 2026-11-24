type DesktopEntryEnvironment = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  mobile?: boolean;
  standalone: boolean;
  finePointer: boolean;
  developmentPreview: boolean;
};

/** Device capability, not viewport width: landscape phones and iPads stay in the app. */
export function shouldShowDesktopEntry(environment: DesktopEntryEnvironment): boolean {
  if (environment.developmentPreview || environment.standalone) return false;
  if (environment.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(environment.userAgent)) return false;
  if (environment.platform === "MacIntel" && environment.maxTouchPoints > 1) return false;
  return /Windows|Macintosh|X11|Linux|CrOS/i.test(environment.userAgent) || environment.finePointer;
}
