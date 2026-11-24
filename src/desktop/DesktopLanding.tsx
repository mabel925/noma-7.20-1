import React from "react";
import { useLanguage } from "../i18n/language";
import { startRecognitionWave } from "../animations/recognitionWave";
import { DEMO_DURATION_MS, getDemoStage } from "./demoTimeline";

export const MOBILE_APP_URL = "https://nomaspace.app/";
const copy = {
  en: {
    eyebrow: "LESS SEARCHING. MORE LIVING.", title: <>A little memory.<br />A lighter home.</>,
    description: "Snap your things. Let AI recognize them, remove the background, and remember where they belong.",
    scan: "Your space, in your pocket.", scanHint: "Scan with your phone camera to start organizing with noma.",
    mobile: "Made for iPhone & Android", install: "Open on your phone. Add to Home Screen for the full experience.",
    demo: "A little look inside", duration: "15-second product demo", pause: "Pause demo", play: "Play demo", replay: "Replay demo",
    snap: "Snap", save: "Save", find: "Find", copy: "Copy link", copied: "Link copied", copyFailed: "Select the link to copy it.",
    footer: "A place for everything. A little less on your mind.", qr: "QR code: open nomaspace.app on your phone",
    stages: { capture: "One photo is all it takes.", scan: "AI gets to know your things.", cutout: "A clean little cutout. Just like that.", save: "Give it a home. We'll remember.", find: "Ask noma. There it is." },
    guide: "Show me what you want to remember.", recognizing: "Recognizing your item…", cup: "Coffee cup", category: "Housewares",
    saved: "Saved to your memory", kitchen: "Kitchen", shelf: "Coffee shelf", question: "Where's my coffee cup?", answer: "Find it!!", location: "Kitchen · Coffee shelf",
    features: ["AI recognition", "Background removal", "Remember every spot"],
  },
  zh: {
    eyebrow: "少一点翻找，多一点生活", title: <>收好每一件。<br />想找，就找到。</>,
    description: "拍下物品，AI 自动识别、抠图，记住它的位置。让收纳简单一点，让生活轻松一点。",
    scan: "手机扫码，立即开启\nAI 极简收纳", scanHint: "用手机相机扫描二维码，和 noma 一起记住每一件物品。",
    mobile: "支持 iPhone 与 Android", install: "在手机打开后，添加到主屏幕，体验更顺畅。",
    demo: "看看 noma 怎么用", duration: "15 秒产品演示", pause: "暂停演示", play: "播放演示", replay: "重新播放",
    snap: "拍下来", save: "收起来", find: "找得到", copy: "复制链接", copied: "已复制链接", copyFailed: "可以选中网址，手动复制。",
    footer: "物品各有所归，心里少点牵挂。", qr: "二维码：在手机打开 nomaspace.app",
    stages: { capture: "拍一张，就这么简单。", scan: "让 AI 认识你的物品。", cutout: "自动抠图，清清爽爽。", save: "给它一个家，noma 帮你记住。", find: "问问 noma，找到了。" },
    guide: "让我看看你想记住的物品。", recognizing: "正在识别物品…", cup: "咖啡杯", category: "家居日用",
    saved: "已存入你的记忆库", kitchen: "厨房", shelf: "咖啡架", question: "我的咖啡杯在哪？", answer: "找到了！", location: "厨房 · 咖啡架",
    features: ["AI 识物", "自动抠图", "记住收纳位置"],
  },
};

const Arrow = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Tick = () => <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function DesktopLanding() {
  const { language, setLanguage } = useLanguage();
  const text = copy[language];
  const [elapsed, setElapsed] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [visible, setVisible] = React.useState(true);
  const [inView, setInView] = React.useState(true);
  const [copied, setCopied] = React.useState<"" | "copied" | "failed">("");
  const demoRef = React.useRef<HTMLDivElement>(null);
  const sceneRef = React.useRef<HTMLImageElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stage = getDemoStage(elapsed);
  const running = playing && visible && inView;

  React.useEffect(() => {
    try {
      if (!localStorage.getItem("noma-language") && navigator.language.toLowerCase().startsWith("zh")) setLanguage("zh");
    } catch { /* A blocked preference store does not block the landing page. */ }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduceMotion = () => { if (media.matches) { setPlaying(false); setElapsed(8000); } };
    reduceMotion();
    const visibility = () => setVisible(document.visibilityState !== "hidden");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", reduceMotion);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? true));
    if (demoRef.current) observer?.observe(demoRef.current);
    return () => { document.removeEventListener("visibilitychange", visibility); media.removeEventListener("change", reduceMotion); observer?.disconnect(); };
  }, [setLanguage]);
  React.useEffect(() => {
    if (!running) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(), delta = Math.min(now - previous, 250);
      previous = now;
      setElapsed(value => (value + delta) % DEMO_DURATION_MS);
    }, 100);
    return () => window.clearInterval(timer);
  }, [running]);
  React.useEffect(() => {
    const canvas = canvasRef.current, image = sceneRef.current;
    if (stage !== "scan" || !running || !canvas || !image) return;
    let controller: ReturnType<typeof startRecognitionWave> = null, cancelled = false;
    const start = () => { if (!cancelled) controller = startRecognitionWave(canvas, image); };
    if (image.complete && image.naturalWidth) start(); else image.addEventListener("load", start, { once: true });
    return () => { cancelled = true; image.removeEventListener("load", start); controller?.destroy(); };
  }, [stage, running]);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(""), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(MOBILE_APP_URL); setCopied("copied"); }
    catch { setCopied("failed"); }
  };
  const step = stage === "capture" || stage === "scan" ? 0 : stage === "find" ? 2 : 1;

  return <div className="desktop-landing" lang={language === "zh" ? "zh-CN" : "en"}>
    <header className="desktop-header">
      <a href={MOBILE_APP_URL} className="desktop-wordmark" aria-label="noma"><img className="desktop-wordmark-icon" src="/icons/noma-browser-rounded-192.png" width="38" height="38" alt="" /><img className="desktop-wordmark-text" src="/desktop/noma-wordmark.svg" width="81" height="18" alt="noma" /></a>
      <div className="desktop-language" role="group" aria-label={language === "zh" ? "语言" : "Language"}>
        <button type="button" onClick={() => setLanguage("en")} aria-pressed={language === "en"}>EN</button><span aria-hidden="true">/</span><button type="button" onClick={() => setLanguage("zh")} aria-pressed={language === "zh"}>中文</button>
      </div>
    </header>
    <main className="desktop-hero">
      <section className="desktop-showcase" aria-label={text.demo}>
        <div className="desktop-demo" ref={demoRef} data-stage={stage} data-running={running}>
          <div className="desktop-demo-halo" aria-hidden="true" />
          <div className="desktop-demo-label"><span />{text.duration}</div>
          <div className="desktop-phone" aria-label={text.demo}>
            <div className="desktop-phone-screen" aria-hidden="true">
              <div className="desktop-demo-room" />
              <img ref={sceneRef} className="desktop-demo-photo" src="/desktop/coffee-scene.webp" alt="" width="600" height="1200" fetchPriority="high" />
              {stage === "scan" && <canvas ref={canvasRef} className="desktop-demo-wave" />}
              {stage === "cutout" && <div className="desktop-demo-particles">{Array.from({ length: 80 }, (_, i) => <i key={i} style={{
                "--tile-x": `${(i % 8) / 7 * 100}%`, "--tile-y": `${Math.floor(i / 8) / 9 * 100}%`,
                "--tile-dx": `${(i % 8 - 3.5) * 14}px`, "--tile-dy": `${(Math.floor(i / 8) - 4.5) * 12}px`, "--tile-delay": `${(i * 37 % 240)}ms`,
              } as React.CSSProperties} />)}</div>}
              <div className="desktop-phone-status"><b>9:41</b><span className="desktop-phone-island" /><svg width="42" height="12" viewBox="0 0 42 12"><path d="M1 11V8h2v3m2 0V6h2v5m2 0V4h2v7m2 0V1h2v10" stroke="currentColor" strokeWidth="1.6" /><rect x="25" y="2" width="14" height="8" rx="2" stroke="currentColor" /><path d="M40 5v2" stroke="currentColor" /><rect x="27" y="4" width="10" height="4" rx="1" fill="currentColor" /></svg></div>
              <div className="desktop-demo-camera-guide">{text.guide}</div>
              <div className="desktop-demo-focus"><i /><i /><i /><i /></div>
              <div className="desktop-demo-shutter"><span /></div>
              <div className="desktop-demo-scanning"><span />{text.recognizing}</div>
              <div className="desktop-demo-sticker"><img src="/emoji/coffee.png" width="250" height="250" alt="" /><strong className={language === "zh" ? "font-zihun-biantao" : "font-alkatra"}>{text.cup}</strong><span className="desktop-demo-category">{text.category}</span></div>
              <div className="desktop-demo-saved"><div className="desktop-demo-check"><Tick /></div><strong>{text.saved}</strong><div className="desktop-demo-location"><span>⌂</span><div><b>{text.kitchen}</b><span>{text.shelf}</span></div><Tick /></div></div>
              <div className="desktop-demo-chat"><div>{text.question}</div><div>{text.answer}<small>📍 {text.location}</small></div></div>
              <div className="desktop-phone-home" />
            </div>
          </div>
          <div className="desktop-demo-caption"><span>{text.stages[stage]}</span></div>
          <div className="desktop-demo-controls"><button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? text.pause : text.play}>{playing ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 3v8m6-8v8" stroke="currentColor" strokeWidth="2" /></svg> : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="m4 2 8 5-8 5Z" fill="currentColor" /></svg>}</button><div className="desktop-demo-progress" role="progressbar" aria-label={text.duration} aria-valuemin={0} aria-valuemax={15} aria-valuenow={Math.floor(elapsed / 1000)}><span style={{ width: `${elapsed / DEMO_DURATION_MS * 100}%` }} /></div><button type="button" onClick={() => { setElapsed(0); setPlaying(true); }} aria-label={text.replay}>↻</button></div>
          <ol className="desktop-demo-steps">{[text.snap, text.save, text.find].map((label, i) => <li key={i} data-active={i === step}><span>0{i + 1}</span>{label}</li>)}</ol>
        </div>
      </section>
      <section className="desktop-introduction">
        <p className="desktop-eyebrow">{text.eyebrow}</p>
        <h1>{text.title}</h1>
        <p className="desktop-description">{text.description}</p>
        <ul className="desktop-features">{text.features.map(feature => <li key={feature}><Tick />{feature}</li>)}</ul>
        <div className="desktop-portal" id="open-on-mobile">
          <div className="desktop-qr"><img src="/desktop/noma-qr.svg" width="144" height="144" alt={text.qr} /></div>
          <div className="desktop-portal-copy"><h2>{text.scan}</h2><p>{text.scanHint}</p><span className="desktop-mobile-support"><svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true"><rect x="2" y="1" width="8" height="14" rx="2" stroke="currentColor" /><path d="M5 12h2" stroke="currentColor" strokeLinecap="round" /></svg>{text.mobile}</span></div>
        </div>
        <div className="desktop-link-row"><a href={MOBILE_APP_URL}>nomaspace.app<Arrow /></a><button type="button" onClick={() => void copyLink()}>{copied === "copied" ? text.copied : text.copy}</button></div>
        {copied === "failed" && <p className="desktop-copy-error" role="status">{text.copyFailed}</p>}
        <p className="desktop-install-hint">{text.install}</p>
      </section>
    </main>
    <footer className="desktop-footer"><span>© {new Date().getFullYear()} noma</span><span>{text.footer}</span><a href="#open-on-mobile">{language === "zh" ? "在手机上体验" : "Take it to your phone"}<Arrow /></a></footer>
  </div>;
}
