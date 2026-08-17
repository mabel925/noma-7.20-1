import React from "react";
import { PAGInit } from "libpag";

const PAG_FILE_URL = "/pag/noma.pag";
const PAG_WASM_URL = "/pag/libpag.wasm";

type PagFileHandle = {
  width: () => number;
  height: () => number;
  destroy: () => void;
};

type PagViewHandle = {
  setRepeatCount: (count: number) => void;
  play: () => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => void;
};

let pagRuntimePromise: ReturnType<typeof PAGInit> | null = null;
let pagAssetPromise: Promise<{ PAG: any; bytes: ArrayBuffer }> | null = null;

const getPagRuntime = () => {
  if (!pagRuntimePromise) {
    pagRuntimePromise = PAGInit({ locateFile: () => PAG_WASM_URL });
  }
  return pagRuntimePromise;
};

const getPagAsset = () => {
  if (!pagAssetPromise) {
    pagAssetPromise = Promise.all([
      getPagRuntime(),
      fetch(PAG_FILE_URL).then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load PAG asset: ${response.status}`);
        return response.arrayBuffer();
      }),
    ]).then(([PAG, bytes]) => ({ PAG, bytes }));
  }
  return pagAssetPromise;
};

export const preloadPagNoma = () => getPagAsset();

interface PagNomaSpriteProps {
  pose?: "reading" | "chatting";
  className?: string;
  onReady?: () => void;
}

export const PagNomaSprite: React.FC<PagNomaSpriteProps> = ({
  pose = "reading",
  className = "",
  onReady,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pagViewRef = React.useRef<PagViewHandle | null>(null);
  const pagFileRef = React.useRef<PagFileHandle | null>(null);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const loadAnimation = async () => {
      try {
        const { PAG, bytes } = await getPagAsset();
        const pagFile = await PAG.PAGFile.load(bytes.slice(0));
        pagFileRef.current = pagFile;

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = pagFile.width();
        canvas.height = pagFile.height();

        const pagView = await PAG.PAGView.init(pagFile, canvas, {
          firstFrame: true,
          useScale: false,
        });

        if (!pagView || cancelled) return;

        pagViewRef.current = pagView;
        pagView.setRepeatCount(0);
        setIsReady(true);
        onReady?.();
        await pagView.play();
      } catch (error) {
        if (!cancelled) {
          console.error("[PAG] Failed to load Noma animation:", error);
        }
      }
    };

    void loadAnimation();

    return () => {
      cancelled = true;
      setIsReady(false);

      const pagView = pagViewRef.current;
      pagViewRef.current = null;
      if (pagView) {
        void pagView.stop().catch(() => undefined);
        pagView.destroy();
      }

      const pagFile = pagFileRef.current;
      pagFileRef.current = null;
      pagFile?.destroy();
    };
  }, [onReady]);

  return (
    <div
      className={`relative select-none pointer-events-none w-full aspect-square overflow-hidden ${className}`}
      style={{ transformOrigin: "left bottom" }}
      data-pose={pose}
      aria-label="Noma Character"
    >
      <canvas
        ref={canvasRef}
        width={600}
        height={600}
        className={`relative z-10 block h-auto w-full transition-opacity duration-150 ${isReady ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      />
    </div>
  );
};
