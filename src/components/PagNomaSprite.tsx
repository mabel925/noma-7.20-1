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

const getPagRuntime = () => {
  if (!pagRuntimePromise) {
    pagRuntimePromise = PAGInit({ locateFile: () => PAG_WASM_URL });
  }
  return pagRuntimePromise;
};

interface PagNomaSpriteProps {
  pose?: "reading" | "chatting";
  className?: string;
}

export const PagNomaSprite: React.FC<PagNomaSpriteProps> = ({
  pose = "reading",
  className = "",
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pagViewRef = React.useRef<PagViewHandle | null>(null);
  const pagFileRef = React.useRef<PagFileHandle | null>(null);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const loadAnimation = async () => {
      try {
        const [PAG, response] = await Promise.all([
          getPagRuntime(),
          fetch(PAG_FILE_URL),
        ]);

        if (!response.ok) {
          throw new Error(`Unable to load PAG asset: ${response.status}`);
        }

        const pagFile = await PAG.PAGFile.load(await response.arrayBuffer());
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
  }, []);

  return (
    <div
      className={`relative select-none pointer-events-none w-full ${className}`}
      style={{ transformOrigin: "left bottom" }}
      data-pose={pose}
      aria-label="Noma Character"
    >
      <canvas
        ref={canvasRef}
        width={1}
        height={1}
        className={`relative z-10 block h-auto w-full transition-opacity duration-150 ${isReady ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      />
    </div>
  );
};
