import React from "react";
import Keyboard, { type KeyboardReactInterface } from "react-simple-keyboard";
import chineseLayout from "simple-keyboard-layouts/build/layouts/chinese";
import englishLayout from "simple-keyboard-layouts/build/layouts/english";
import "react-simple-keyboard/build/css/index.css";

type KeyboardLayoutName = "default" | "shift";
type KeyboardLanguage = "en" | "zh";
type KeyboardMode = "alpha" | "numeric";
type KeyboardLayoutPack = {
  layout: Record<string, string[]>;
  layoutCandidates?: Record<string, string>;
};

interface VirtualKeyboardProps {
  mode?: KeyboardMode;
  value?: string;
  onChange?: (value: string) => void;
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
  onSend: () => void;
  onDismiss?: () => void;
  onLanguageToggle?: () => void;
  sendLabel?: string;
  className?: string;
}

const ACTION_ROW = "{numbers} {lang} {space} {hide} {send}";
const NUMERIC_LAYOUT: Record<KeyboardLayoutName, string[]> = {
  default: [
    "1 2 3",
    "4 5 6",
    "7 8 9",
    ". 0 {bksp}",
  ],
  shift: [
    "1 2 3",
    "4 5 6",
    "7 8 9",
    ". 0 {bksp}",
  ],
};
const alphaKeyPattern = /^[a-z]$/i;
const englishLayoutPack = englishLayout as KeyboardLayoutPack;
const chineseLayoutPack = chineseLayout as KeyboardLayoutPack;

const extractAlphaRow = (row = "") =>
  row
    .split(" ")
    .filter((key) => alphaKeyPattern.test(key))
    .join(" ");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildAppLayout = (pack: KeyboardLayoutPack): Record<KeyboardLayoutName, string[]> => {
  const makeRows = (layoutName: KeyboardLayoutName) => {
    const rows = pack.layout[layoutName] ?? pack.layout.default;
    const bottomLetters = extractAlphaRow(rows[3]);

    return [
      extractAlphaRow(rows[1]) || "q w e r t y u i o p",
      extractAlphaRow(rows[2]) || "a s d f g h j k l",
      `{shift} ${bottomLetters || "z x c v b n m"} {bksp}`,
      ACTION_ROW,
    ];
  };

  return {
    default: makeRows("default"),
    shift: makeRows("shift"),
  };
};

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  mode = "alpha",
  value,
  onChange,
  onKeyPress,
  onBackspace,
  onSpace,
  onSend,
  onDismiss = () => {},
  onLanguageToggle = () => {},
  sendLabel,
  className = "",
}) => {
  const [language, setLanguage] = React.useState<KeyboardLanguage>("en");
  const [layoutName, setLayoutName] = React.useState<KeyboardLayoutName>("default");
  const [pinyinBuffer, setPinyinBuffer] = React.useState("");
  const keyboardRef = React.useRef<KeyboardReactInterface | null>(null);
  const actionsRef = React.useRef({
    onChange,
    onKeyPress,
    onBackspace,
    onSpace,
    onSend,
    onDismiss,
    onLanguageToggle,
  });

  React.useEffect(() => {
    actionsRef.current = {
      onChange,
      onKeyPress,
      onBackspace,
      onSpace,
      onSend,
      onDismiss,
      onLanguageToggle,
    };
  }, [onChange, onKeyPress, onBackspace, onSpace, onSend, onDismiss, onLanguageToggle]);

  React.useEffect(() => {
    if (typeof value !== "string" || !keyboardRef.current) return;
    if (keyboardRef.current.getInput() !== value) {
      keyboardRef.current.setInput(value);
    }
    if (!value) {
      setPinyinBuffer("");
    }
  }, [value]);

  const playClickSound = React.useCallback(() => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(320, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.05);

      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.06);
    } catch {
      // Browser may block audio before the first user gesture.
    }
  }, []);

  const handleKeyPress = React.useCallback(
    (button: string) => {
      playClickSound();

      if (button === "{shift}") {
        if (mode === "numeric") return;
        setLayoutName((prev) => (prev === "default" ? "shift" : "default"));
        return;
      }

      if (button === "{bksp}") {
        if (language === "zh") {
          setPinyinBuffer((prev) => prev.slice(0, -1));
        }
        if (!actionsRef.current.onChange) {
          actionsRef.current.onBackspace();
        }
        return;
      }

      if (button === "{space}") {
        if (mode === "numeric") return;
        if (language === "zh") {
          setPinyinBuffer("");
        }
        if (!actionsRef.current.onChange) {
          actionsRef.current.onSpace();
        }
        return;
      }

      if (button === "{send}") {
        setPinyinBuffer("");
        actionsRef.current.onSend();
        return;
      }

      if (button === "{hide}") {
        setPinyinBuffer("");
        actionsRef.current.onDismiss();
        return;
      }

      if (button === "{lang}") {
        if (mode === "numeric") return;
        setLanguage((prev) => {
          const nextLanguage = prev === "en" ? "zh" : "en";
          setLayoutName("default");
          setPinyinBuffer("");
          return nextLanguage;
        });
        actionsRef.current.onLanguageToggle();
        return;
      }

      if (button === "{numbers}") return;

      if (mode !== "numeric" && language === "zh" && alphaKeyPattern.test(button)) {
        setPinyinBuffer((prev) => `${prev}${button.toLowerCase()}`);
      }

      if (!actionsRef.current.onChange) {
        actionsRef.current.onKeyPress(button);
      }
      if (mode !== "numeric" && language === "en" && layoutName === "shift") {
        setLayoutName("default");
      }
    },
    [language, layoutName, mode, playClickSound]
  );

  const handleKeyboardChange = React.useCallback((nextValue: string) => {
    actionsRef.current.onChange?.(nextValue);
  }, []);

  const activeLayoutPack = language === "zh" ? chineseLayoutPack : englishLayoutPack;
  const activeLayout = React.useMemo(
    () => (mode === "numeric" ? NUMERIC_LAYOUT : buildAppLayout(activeLayoutPack)),
    [activeLayoutPack, mode]
  );
  const candidateWords = React.useMemo(() => {
    if (mode === "numeric" || language !== "zh" || !pinyinBuffer) return [];
    const candidates = chineseLayoutPack.layoutCandidates?.[pinyinBuffer];
    return candidates ? candidates.split(" ").slice(0, 8) : [];
  }, [language, mode, pinyinBuffer]);

  const handleCandidateSelect = React.useCallback(
    (candidate: string) => {
      const currentValue =
        typeof value === "string" ? value : keyboardRef.current?.getInput() ?? "";
      const nextValue = pinyinBuffer
        ? currentValue.replace(new RegExp(`${escapeRegExp(pinyinBuffer)}$`, "i"), candidate)
        : `${currentValue}${candidate}`;

      keyboardRef.current?.setInput(nextValue);
      actionsRef.current.onChange?.(nextValue);
      setPinyinBuffer("");
    },
    [pinyinBuffer, value]
  );

  const display = React.useMemo(
    () => ({
      "{shift}": "⇧",
      "{bksp}": "⌫",
      "{numbers}": "123",
      "{lang}": language === "en" ? "中" : "EN",
      "{space}": language === "en" ? "space" : "空格",
      "{hide}": "⌄",
      "{send}": sendLabel ?? (mode === "numeric" ? "Done" : "send"),
    }),
    [language, mode, sendLabel]
  );

  return (
    <div
      className={`noma-simple-keyboard ${
        mode === "numeric" ? "noma-simple-keyboard-numeric" : ""
      } bg-[#E9E6E1] border-t border-black/5 px-1.5 pt-3 pb-2.5 transition-colors duration-200 relative select-none ${className}`}
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {candidateWords.length > 0 && (
        <div className="noma-keyboard-candidate-bar">
          {candidateWords.map((candidate) => (
            <button
              key={`${pinyinBuffer}-${candidate}`}
              type="button"
              className="noma-keyboard-candidate"
              onClick={(event) => {
                event.stopPropagation();
                handleCandidateSelect(candidate);
              }}
            >
              {candidate}
            </button>
          ))}
        </div>
      )}
      <Keyboard
        keyboardRef={(keyboard) => {
          keyboardRef.current = keyboard;
        }}
        layoutName={layoutName}
        onKeyPress={handleKeyPress}
        onChange={onChange ? handleKeyboardChange : undefined}
        disableButtonHold
        mergeDisplay
        layout={activeLayout}
        enableLayoutCandidates={false}
        inputPattern={mode === "numeric" ? /^(?=.{0,8}$)\d*(\.\d{0,2})?$/ : undefined}
        display={display}
        buttonTheme={[
          {
            class: "noma-simple-keyboard-action",
            buttons: "{shift} {bksp} {numbers} {lang} {hide}",
          },
          {
            class: "noma-simple-keyboard-space",
            buttons: "{space}",
          },
          {
            class: "noma-simple-keyboard-send",
            buttons: "{send}",
          },
        ]}
      />
    </div>
  );
};
