import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronRight } from "lucide-react";
import { useAuth, DEFAULT_AVATAR_URL } from "../auth/AuthContext";
import { useLanguage, type Language } from "../i18n/language";
import { PageNavigation } from "./PageNavigation";
import { EditPencilIcon } from "./EditPencilIcon";
import { SafeIcon } from "./SafeIcon";

export const ProfilePage: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user, aiAccess, aiAccessLoading, updateDisplayName, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const [view, setView] = React.useState<"profile" | "language">("profile");
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(user?.displayName || "");
  const [saving, setSaving] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const headingRef = React.useRef<HTMLDivElement>(null);
  const pageRef = React.useRef<HTMLElement>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const savingRef = React.useRef(false);
  const keyboardBaselineRef = React.useRef(0);
  const cancelNameEdit = React.useCallback(() => {
    // Enter blurs the keyboard while the confirmed value is being saved.
    if (savingRef.current) return;
    setName(user?.displayName || "");
    setEditing(false);
    setError("");
  }, [user?.displayName]);
  React.useLayoutEffect(() => {
    const root = document.getElementById("root");
    const wasInert = root?.inert || false;
    if (root) root.inert = true;
    return () => { if (root) root.inert = wasInert; };
  }, []);
  React.useEffect(() => {
    if (!editing) setName(user?.displayName || "");
  }, [user?.displayName, editing]);
  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!editing || !viewport) return;
    let keyboardWasOpen = false;
    const onResize = () => {
      const coveredHeight = keyboardBaselineRef.current - viewport.height;
      if (coveredHeight > 120) keyboardWasOpen = true;
      // Some mobile keyboards hide without removing input focus.
      else if (keyboardWasOpen && coveredHeight < 60 && !savingRef.current) {
        nameInputRef.current?.blur();
        cancelNameEdit();
      }
    };
    onResize();
    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, [editing, cancelNameEdit]);
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    headingRef.current?.focus({ preventScroll: true });
    return () => { previous?.focus({ preventScroll: true }); };
  }, []);
  React.useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const focusable = pageRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
        const first = focusable?.[0], last = focusable?.[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
      if (event.key !== "Escape" || saving || leaving) return;
      if (editing) cancelNameEdit();
      else if (view === "language") setView("profile");
      else onClose();
    };
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("keydown", close); };
  }, [view, editing, saving, leaving, onClose, cancelNameEdit]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const confirmedName = name.trim();
    if (!confirmedName) { setError("Name cannot be empty."); return; }
    savingRef.current = true;
    setSaving(true); setError("");
    nameInputRef.current?.blur();
    try {
      if (confirmedName !== user?.displayName) await updateDisplayName(confirmedName);
      setEditing(false);
    }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to update your name."); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const leave = async () => {
    if (leaving) return;
    setLeaving(true); setError("");
    try { await signOut(); onClose(); }
    catch { setError("Unable to sign out. Please try again."); }
    finally { setLeaving(false); }
  };
  const accountValue = (value: React.ReactNode) => aiAccess ? value : aiAccessLoading ? t("Loading...") : t("Unavailable");
  if (!user) return null;

  return (
    <motion.div className="noma-profile-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.22 }}>
      <section ref={pageRef} className="noma-profile-page" role="dialog" aria-modal="true" aria-label={t(view === "profile" ? "Profile" : "Language")} onPointerDownCapture={(event) => {
        if (editing && event.target !== nameInputRef.current && !savingRef.current) {
          nameInputRef.current?.blur();
          cancelNameEdit();
        }
      }}>
        <div ref={headingRef} tabIndex={-1} className="noma-profile-navigation">
          <PageNavigation onBack={view === "language" ? () => setView("profile") : onClose} title={t(view === "profile" ? "Profile" : "Language")} backLabel={t("Back")} />
        </div>
        <div className="noma-profile-scroll">
          {view === "language" ? (
            <div className="noma-profile-language-options" role="group" aria-label={t("Language")}>
              {([{ code: "en", label: "English" }, { code: "zh", label: "中文" }] as Array<{ code: Language; label: string }>).map((option) => (
                <button type="button" key={option.code} aria-pressed={language === option.code} onClick={() => { setLanguage(option.code); setView("profile"); }}>
                  <span lang={option.code === "zh" ? "zh-CN" : "en"}>{option.label}</span>
                  {language === option.code && <Check aria-hidden="true" />}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="noma-profile-identity">
                <img className="noma-profile-avatar" src={user.avatarUrl} alt="" onError={(event) => { if (!event.currentTarget.src.endsWith(DEFAULT_AVATAR_URL)) event.currentTarget.src = DEFAULT_AVATAR_URL; }} />
                {editing ? (
                  <form className="noma-profile-name-form" onSubmit={save}>
                    <span className="noma-profile-name-measure" aria-hidden="true">{name || "\u00a0"}</span>
                    <input ref={nameInputRef} size={1} autoFocus aria-label={t("Username")} aria-busy={saving} value={name} onChange={(event) => setName(event.target.value)} onBlur={cancelNameEdit} onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
                    }} maxLength={80} readOnly={saving} autoComplete="nickname" enterKeyHint="done" />
                  </form>
                ) : (
                  <div className="noma-profile-name">
                    <h2 title={user.displayName}>{user.displayName}</h2>
                    <button type="button" aria-label={t("Edit username")} onClick={() => { keyboardBaselineRef.current = window.visualViewport?.height || window.innerHeight; setName(user.displayName); setError(""); setEditing(true); }}><EditPencilIcon /></button>
                  </div>
                )}
                <p className="noma-profile-email" title={user.email}>{user.email}</p>
              </div>
              {error && <p className="noma-profile-error" role="alert">{t(error)}</p>}
              <dl className="noma-profile-plan" aria-busy={aiAccessLoading}>
                <div><dt>{t("Plan")}</dt><dd>{accountValue(t(aiAccess?.planName || aiAccess?.planCode || ""))}</dd></div>
                <div><dt>{t("AI scans remaining")}</dt><dd>{accountValue(aiAccess?.aiScansRemaining === null ? t("Unlimited") : aiAccess?.aiScansRemaining)}</dd></div>
                <div><dt>{t("Items")}</dt><dd>{accountValue(aiAccess ? `${aiAccess.itemCount}${aiAccess.itemLimit === null ? "" : ` / ${aiAccess.itemLimit}`}` : "")}</dd></div>
              </dl>
              <button type="button" className="noma-profile-language" onClick={() => { setError(""); setView("language"); }}>
                <span>{t("Language")}</span><span>{language === "en" ? "English" : "中文"}<ChevronRight aria-hidden="true" /></span>
              </button>
              <div className="noma-profile-bottom">
                <button type="button" className="noma-profile-signout" disabled={leaving || saving} onClick={() => void leave()}>{t(leaving ? "Signing out..." : "Sign out")}</button>
                <p className="noma-profile-privacy"><SafeIcon /><span>{t("Your memory data is stored in your private cloud account.")}</span></p>
              </div>
            </>
          )}
        </div>
      </section>
    </motion.div>
  );
};
