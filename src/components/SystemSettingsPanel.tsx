import React, { useState, useEffect } from "react";
import { X, Sliders, Check, HelpCircle, Key, Server, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { REMOVE_BG_CONFIG, saveRemoveBgConfig, RemoveBgConfig } from "../services/removeBackgroundService";
import { FirebaseConfig, getStoredFirebaseConfig, saveFirebaseConfig, clearFirebaseConfig } from "../lib/firebase";

interface SystemSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemSettingsPanel: React.FC<SystemSettingsPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"matting" | "vision">("matting");
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // 1. Remove.bg Config States
  const [apiProvider, setApiProvider] = useState<RemoveBgConfig["api"]["provider"]>(REMOVE_BG_CONFIG.api.provider);
  const [apiEndpoint, setApiEndpoint] = useState<string>(REMOVE_BG_CONFIG.api.endpoint);
  const [apiKey, setApiKey] = useState<string>(REMOVE_BG_CONFIG.api.apiKey);
  const [apiHeaderKey, setApiHeaderKey] = useState<string>("X-Api-Key");
  const [apiHeaderValue, setApiHeaderValue] = useState<string>(REMOVE_BG_CONFIG.api.headers["X-Api-Key"] || "");

  // 2. Firebase Config States
  const [fbApiKey, setFbApiKey] = useState<string>("");
  const [fbAuthDomain, setFbAuthDomain] = useState<string>("");
  const [fbProjectId, setFbProjectId] = useState<string>("");
  const [fbStorageBucket, setFbStorageBucket] = useState<string>("");
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState<string>("");
  const [fbAppId, setFbAppId] = useState<string>("");
  const [fbMeasurementId, setFbMeasurementId] = useState<string>("");
  const [rawConfigJson, setRawConfigJson] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      // Load current configs
      const fbSaved = getStoredFirebaseConfig();
      if (fbSaved) {
        setFbApiKey(fbSaved.apiKey || "");
        setFbAuthDomain(fbSaved.authDomain || "");
        setFbProjectId(fbSaved.projectId || "");
        setFbStorageBucket(fbSaved.storageBucket || "");
        setFbMessagingSenderId(fbSaved.messagingSenderId || "");
        setFbAppId(fbSaved.appId || "");
        setFbMeasurementId(fbSaved.measurementId || "");
      }

      setApiProvider(REMOVE_BG_CONFIG.api.provider);
      setApiEndpoint(REMOVE_BG_CONFIG.api.endpoint);
      setApiKey(REMOVE_BG_CONFIG.api.apiKey);
      setApiHeaderValue(REMOVE_BG_CONFIG.api.headers["X-Api-Key"] || "");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Helper to parse pasted Firebase config blocks
  const parseAndApplyJson = (text: string) => {
    try {
      let jsonStr = text.trim();
      if (jsonStr.includes("firebaseConfig")) {
        const match = jsonStr.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\})/);
        if (match) {
          jsonStr = match[1];
        }
      }
      
      let parsed: any = null;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (_) {
        const formatted = jsonStr
          .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":')
          .replace(/'/g, '"')
          .replace(/,\s*([}\]])/g, '$1'); // remove trailing commas
        parsed = JSON.parse(formatted);
      }

      if (parsed && parsed.apiKey) {
        setFbApiKey(parsed.apiKey || "");
        setFbAuthDomain(parsed.authDomain || "");
        setFbProjectId(parsed.projectId || "");
        setFbStorageBucket(parsed.storageBucket || "");
        setFbMessagingSenderId(parsed.messagingSenderId || "");
        setFbAppId(parsed.appId || "");
        setFbMeasurementId(parsed.measurementId || "");
        setRawConfigJson("");
        return true;
      }
    } catch (e) {
      console.error("[Settings] Parse error", e);
    }
    return false;
  };

  const handleSaveMatting = () => {
    const updatedConfig: RemoveBgConfig = {
      mode: "api",
      local: { ...REMOVE_BG_CONFIG.local },
      api: {
        provider: apiProvider,
        endpoint: apiEndpoint,
        apiKey: apiKey,
        headers: {
          [apiHeaderKey]: apiHeaderValue,
        },
      },
    };

    saveRemoveBgConfig(updatedConfig);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 1200);
  };

  const handleSaveFirebase = () => {
    if (!fbApiKey || !fbProjectId || !fbAppId) {
      alert("请填写必填字段 (API Key, Project ID, App ID)");
      return;
    }
    const newConfig: FirebaseConfig = {
      apiKey: fbApiKey,
      authDomain: fbAuthDomain,
      projectId: fbProjectId,
      storageBucket: fbStorageBucket,
      messagingSenderId: fbMessagingSenderId,
      appId: fbAppId,
      measurementId: fbMeasurementId
    };
    saveFirebaseConfig(newConfig);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 1200);
  };

  const handleClearFirebase = () => {
    clearFirebaseConfig();
    setFbApiKey("");
    setFbAuthDomain("");
    setFbProjectId("");
    setFbStorageBucket("");
    setFbMessagingSenderId("");
    setFbAppId("");
    setFbMeasurementId("");
    alert("Firebase 配置已清除。");
  };

  return (
    <div className="absolute inset-0 z-[110] bg-black/80 backdrop-blur-md flex flex-col justify-end p-4 font-sans text-white select-none">
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="w-full bg-neutral-900/95 border border-white/10 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 max-h-[90%] overflow-y-auto no-scrollbar"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-neutral-400" />
            <div>
              <h3 className="text-sm font-bold tracking-tight">API 接口与密钥配置</h3>
              <p className="text-[10px] text-neutral-400">Configure online AI services for Noma</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all cursor-pointer active:scale-95"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Custom Tabs */}
        <div className="flex bg-neutral-950/60 p-1 rounded-xl border border-white/5 shrink-0">
          <button
            onClick={() => setActiveTab("matting")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "matting"
                ? "bg-white text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            抠图接口 (RemoveBg)
          </button>
          <button
            onClick={() => setActiveTab("vision")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "vision"
                ? "bg-white text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            识物接口 (Firebase AI)
          </button>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-1">
          {activeTab === "matting" ? (
            <div className="space-y-4">
              <div className="bg-neutral-950/40 border border-white/5 rounded-xl p-3 text-[11px] leading-relaxed text-neutral-400 flex gap-2">
                <HelpCircle className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-neutral-300">抠图 API 模式：</strong>
                  配置您的抠图服务商和 API 密钥。如果未配置或 API 开关已关闭，系统将自动使用高保真 Chroma Key 纯色抠图作为离线 Mock 方案。
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">API 供应商 (Provider)</label>
                  <select
                    value={apiProvider}
                    onChange={(e) => {
                      const prov = e.target.value as RemoveBgConfig["api"]["provider"];
                      setApiProvider(prov);
                      if (prov === "shiliu" || prov === "picwish") {
                        setApiEndpoint("https://image-fndeprfgmx.cn-hangzhou.fcapp.run");
                      } else if (prov === "removebg") {
                        setApiEndpoint("https://api.remove.bg/v1.0/removebg");
                      } else if (prov === "photoroom") {
                        setApiEndpoint("https://sdk.photoroom.com/v1/segment");
                      }
                    }}
                    className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-white/30 transition-all select-none"
                  >
                    <option value="picwish">新无阻抠图 (Aliyun FC)</option>
                    <option value="shiliu">石榴智能 (Shiliu AI)</option>
                    <option value="removebg">Remove.bg</option>
                    <option value="photoroom">Photoroom API</option>
                    <option value="custom">自定义 (Custom Endpoint)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">接口地址 (Endpoint URL)</label>
                  <input
                    type="text"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                    placeholder="https://image-fndeprfgmx.cn-hangzhou.fcapp.run"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">订阅授权密钥 (API Key)</label>
                  <div className="relative flex items-center">
                    <Key className="absolute left-3 w-3.5 h-3.5 text-neutral-500" />
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                      placeholder={apiKey ? "••••••••••••••••" : "输入订阅密钥"}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">自定义头键 (Header Key)</label>
                    <input
                      type="text"
                      value={apiHeaderKey}
                      onChange={(e) => setApiHeaderKey(e.target.value)}
                      className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                      placeholder="X-Api-Key"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">自定义头值 (Header Value)</label>
                    <input
                      type="text"
                      value={apiHeaderValue}
                      onChange={(e) => setApiHeaderValue(e.target.value)}
                      className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                      placeholder="可选项"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveMatting}
                className="w-full h-11 rounded-xl bg-white text-black hover:bg-neutral-100 font-sans font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 mt-4"
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                    <span>抠图配置保存成功</span>
                  </>
                ) : (
                  <span>保存抠图配置</span>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Quick Paste JSON */}
              <div className="bg-neutral-950/40 border border-white/5 rounded-xl p-3.5">
                <h4 className="text-[11px] font-sans font-bold text-neutral-300 mb-1 flex items-center gap-1.5">
                  <span>⚡ 快速导入 config 格式</span>
                </h4>
                <p className="text-[10px] text-neutral-400 mb-2">
                  粘贴 Firebase 控制台的 Web <code>firebaseConfig</code> 代码段，我们将自动解析：
                </p>
                <textarea
                  className="w-full h-20 bg-black/40 border border-white/10 rounded-xl p-2.5 font-mono text-[11px] text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-white/30"
                  placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  projectId: "...",\n  appId: "..."\n};`}
                  value={rawConfigJson}
                  onChange={(e) => {
                    setRawConfigJson(e.target.value);
                    parseAndApplyJson(e.target.value);
                  }}
                />
                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-[10px] text-neutral-500">将智能自动识别所有核心参数字段</span>
                  <button
                    onClick={() => {
                      const success = parseAndApplyJson(rawConfigJson);
                      if (success) {
                        alert("解析成功！已自动填入下方字段。");
                      } else {
                        alert("解析失败，请确保格式包含 apiKey 等信息。");
                      }
                    }}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-sans font-medium text-neutral-200 transition-all cursor-pointer"
                  >
                    手动解析
                  </button>
                </div>
              </div>

              {/* Manual Form fields */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">📝 详细参数 (Manual Configuration)</h4>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-sans text-neutral-400">API Key *</label>
                  <input
                    type="text"
                    className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                    value={fbApiKey}
                    onChange={(e) => setFbApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-sans text-neutral-400">Project ID *</label>
                    <input
                      type="text"
                      className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                      value={fbProjectId}
                      onChange={(e) => setFbProjectId(e.target.value)}
                      placeholder="my-firebase-project"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-sans text-neutral-400">App ID *</label>
                    <input
                      type="text"
                      className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                      value={fbAppId}
                      onChange={(e) => setFbAppId(e.target.value)}
                      placeholder="1:12345:web:abcd"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-sans text-neutral-400">Auth Domain</label>
                  <input
                    type="text"
                    className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                    value={fbAuthDomain}
                    onChange={(e) => setFbAuthDomain(e.target.value)}
                    placeholder="project-id.firebaseapp.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-sans text-neutral-400">Storage Bucket</label>
                    <input
                      type="text"
                      className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                      value={fbStorageBucket}
                      onChange={(e) => setFbStorageBucket(e.target.value)}
                      placeholder="project-id.appspot.com"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-sans text-neutral-400">Messaging Sender ID</label>
                    <input
                      type="text"
                      className="w-full bg-neutral-950 text-xs border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-white/30 transition-all font-mono"
                      value={fbMessagingSenderId}
                      onChange={(e) => setFbMessagingSenderId(e.target.value)}
                      placeholder="1234567890"
                    />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleClearFirebase}
                  className="flex-1 h-11 rounded-xl bg-red-950/40 hover:bg-red-900/30 border border-red-500/10 text-red-400 font-sans font-medium transition-all cursor-pointer text-xs"
                >
                  清除配置
                </button>
                <button
                  onClick={handleSaveFirebase}
                  className="flex-1 h-11 rounded-xl bg-white text-black hover:bg-neutral-100 font-sans font-semibold transition-all cursor-pointer text-xs flex items-center justify-center gap-1"
                >
                  {saveSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      <span>保存成功</span>
                    </>
                  ) : (
                    <span>保存并生效</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
