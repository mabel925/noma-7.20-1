import React from "react";
import { Check, Cloud, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { CloseIcon } from "./CloseIcon";

interface SystemSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemSettingsPanel: React.FC<SystemSettingsPanelProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[110] bg-black/80 backdrop-blur-md flex flex-col justify-end p-4 font-sans text-white select-none">
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="w-full bg-neutral-900/95 border border-white/10 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 max-h-[90%] overflow-y-auto no-scrollbar"
      >
        <div className="flex justify-between items-center border-b border-white/5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-neutral-300" />
            <div>
              <h3 className="text-sm font-bold tracking-tight">Cloud Worker Services</h3>
              <p className="text-[10px] text-neutral-400">Noma AI routes are managed server-side</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all cursor-pointer active:scale-95"
          >
            <CloseIcon className="w-4 h-4 text-white/70" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="bg-neutral-950/50 border border-white/5 rounded-xl p-3.5 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-semibold text-neutral-100">密钥已托管到 Cloudflare Workers</h4>
              <p className="text-[11px] text-neutral-400 leading-relaxed mt-1">
                识物、标题生成和抠图请求都会直接发送到统一 Worker，前端不再保存、输入或校验 Gemini 相关密钥。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {["Vision recognition", "Storage title generation", "Background matting"].map((label) => (
              <div
                key={label}
                className="h-10 rounded-xl bg-white/[0.03] border border-white/5 px-3 flex items-center justify-between"
              >
                <span className="text-[11px] text-neutral-300 font-medium">{label}</span>
                <span className="text-[10px] text-emerald-300 font-mono flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Worker
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
