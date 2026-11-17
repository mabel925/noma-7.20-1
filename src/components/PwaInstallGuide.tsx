import React from "react";
import { createPortal } from "react-dom";
import { ArrowDownToLine, Ellipsis, Share, SquarePlus } from "lucide-react";
import { CloseIcon } from "./CloseIcon";
import { GradientPillButton } from "./GradientPillButton";
import { isStandalonePwa } from "../utils/appViewport";
import {
  getInstallPlatform, getInstallSnapshot, INSTALL_NUDGE_KEY, INSTALL_NUDGE_SNOOZE_MS,
  isEmbeddedBrowser, readInstallSnooze, requestPwaInstall, subscribeInstall,
  type InstallPlatform,
} from "../services/pwaInstall";

type InstallContextValue = {
  available: boolean;
  snoozed: boolean;
  open: boolean;
  openGuide(): void;
  snooze(): void;
};

const InstallContext = React.createContext<InstallContextValue | null>(null);
export const usePwaInstall = () => {
  const context = React.useContext(InstallContext);
  if (!context) throw new Error("usePwaInstall requires PwaInstallProvider.");
  return context;
};

export const PwaInstallProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const install = React.useSyncExternalStore(subscribeInstall, getInstallSnapshot);
  const [standalone, setStandalone] = React.useState(() => isStandalonePwa() || document.body.classList.contains("pwa-standalone"));
  const [snoozed, setSnoozed] = React.useState(() => {
    try { return readInstallSnooze(window.localStorage); } catch { return false; }
  });
  const [open, setOpen] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);
  const [installError, setInstallError] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);

  const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("installGuide") : null;
  const platform: InstallPlatform | null = preview === "ios" || preview === "android" ? preview : getInstallPlatform(navigator);
  const embedded = isEmbeddedBrowser(navigator.userAgent);
  const available = Boolean(platform) && !standalone && !install.installed;
  const showGuide = available && open;

  React.useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const sync = () => setStandalone(isStandalonePwa() || document.body.classList.contains("pwa-standalone"));
    media.addEventListener("change", sync);
    window.addEventListener("pageshow", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("pageshow", sync); };
  }, []);

  const snooze = React.useCallback(() => {
    setSnoozed(true);
    try { localStorage.setItem(INSTALL_NUDGE_KEY, String(Date.now() + INSTALL_NUDGE_SNOOZE_MS)); } catch { /* Still dismiss for this visit. */ }
  }, []);

  const closeGuide = React.useCallback(() => {
    setOpen(false);
    snooze();
  }, [snooze]);

  const openGuide = React.useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInstallError(false);
    setOpen(true);
  }, []);

  React.useEffect(() => {
    if (!showGuide) return;
    const background = Array.from(document.body.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && !node.contains(dialogRef.current))
      .map((node) => ({ node, inert: node.inert }));
    background.forEach(({ node }) => { node.inert = true; });
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeGuide(); }
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled), a[href]');
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      background.forEach(({ node, inert }) => { node.inert = inert; });
      if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
    };
  }, [showGuide, closeGuide]);

  const installNoma = async () => {
    if (installing) return;
    setInstalling(true);
    setInstallError(false);
    const result = await requestPwaInstall();
    setInstalling(false);
    if (result === "unavailable") setInstallError(true);
    else closeGuide();
  };

  const iosSteps = [
    { icon: <Share />, title: "Tap Share", text: "Find it in Safari’s toolbar or page menu." },
    { icon: <SquarePlus />, title: "Add to Home Screen", text: "Scroll down the share menu to find it." },
    { icon: <ArrowDownToLine />, title: "Tap Add", text: "If shown, keep “Open as Web App” on. Then open noma from your Home Screen." },
  ];
  const androidSteps = [
    { icon: <Ellipsis />, title: "Open the browser menu", text: "Tap the menu beside the address bar." },
    { icon: <SquarePlus />, title: "Add to Home screen", text: "Choose “Install app” or “Add to Home screen”, then confirm." },
    { icon: <ArrowDownToLine />, title: "Open noma", text: "Find noma on your Home Screen and tap to open." },
  ];

  return (
    <InstallContext.Provider value={{ available, snoozed, open: showGuide, openGuide, snooze }}>
      {children}
      {showGuide && createPortal(
        <div className="noma-install-overlay" onClick={(event) => { if (event.target === event.currentTarget) closeGuide(); }}>
          <div ref={dialogRef} className="noma-install-sheet" role="dialog" aria-modal="true" aria-labelledby="noma-install-title" aria-describedby="noma-install-description" aria-busy={installing}>
            <button ref={closeRef} className="noma-install-close" type="button" onClick={closeGuide} aria-label="Close installation guide"><CloseIcon /></button>
            <img className="noma-install-app-icon" src="/icons/noma-app-icon-180.png" alt="" />
            <h2 id="noma-install-title">Give noma a home.</h2>
            <p id="noma-install-description">A full-screen space, one tap away.</p>
            {embedded && <p className="noma-install-note">Open this page in {platform === "ios" ? "Safari" : "Chrome"} first using this browser’s menu, then follow the steps below.</p>}
            <ol className="noma-install-steps">
              {(platform === "ios" ? iosSteps : androidSteps).map((step, index) => (
                <li key={step.title}>
                  <span className="noma-install-step-icon" aria-hidden="true">{step.icon}</span>
                  <div><h3>{index + 1}. {step.title}</h3><p>{step.text}</p></div>
                </li>
              ))}
            </ol>
            {installError && <p className="noma-install-note" role="status">Use your browser’s menu to add noma instead.</p>}
            {install.prompt && !embedded ? (
              <button className="noma-install-primary" type="button" onClick={() => void installNoma()} disabled={installing}>{installing ? "Opening…" : "Install noma"}</button>
            ) : (
              <button className="noma-install-primary" type="button" onClick={closeGuide} disabled={installing}>{installing ? "Opening…" : "Got it"}</button>
            )}
          </div>
        </div>, document.body,
      )}
    </InstallContext.Provider>
  );
};

export const PwaInstallNudge: React.FC<{ active: boolean }> = ({ active }) => {
  const { available, snoozed, open, openGuide, snooze } = usePwaInstall();
  if (!active || !available || snoozed || open) return null;
  return createPortal(
    <aside className="noma-install-nudge" aria-label="Add noma to your Home Screen">
      <img src="/icons/noma-app-icon-180.png" alt="" />
      <div className="noma-install-nudge-copy"><p>Add to Home Screen</p><p>Organize and find, anywhere.</p></div>
      <GradientPillButton onClick={openGuide} aria-label="Add noma to Home Screen">Add</GradientPillButton>
      <button className="noma-install-dismiss" type="button" onClick={snooze} aria-label="Dismiss installation reminder"><span><CloseIcon /></span></button>
    </aside>, document.body,
  );
};
