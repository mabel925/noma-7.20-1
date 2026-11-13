export type CameraLease = { stream: MediaStream; release: () => void };

let activeStream: MediaStream | null = null;
let pendingRequest: Promise<MediaStream> | null = null;
const owners = new Set<symbol>();
const abortError = () => new DOMException("Camera request cancelled.", "AbortError");

const stopUnusedStream = () => {
  if (owners.size || !activeStream) return;
  activeStream.getTracks().forEach((track) => track.stop());
  activeStream = null;
};

/** Share an in-flight permission request; release the hardware when the last view leaves. */
export const acquireCamera = async (signal: AbortSignal): Promise<CameraLease> => {
  if (signal.aborted) throw abortError();
  const owner = Symbol("camera-view");
  owners.add(owner);
  const release = () => {
    owners.delete(owner);
    signal.removeEventListener("abort", release);
    // React's effect replay or a view handoff can claim the same stream before
    // this microtask. Never leave the camera running after the last view closes.
    queueMicrotask(stopUnusedStream);
  };
  signal.addEventListener("abort", release, { once: true });

  try {
    if (!activeStream?.getVideoTracks().some((track) => track.readyState === "live")) {
      if (!pendingRequest) {
        const request = (async () => {
          // Let a cancelled mount finish before opening a system permission prompt.
          await Promise.resolve();
          if (!owners.size) throw abortError();
          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
              audio: false,
            });
          } catch (error) {
            if ((error as DOMException)?.name !== "OverconstrainedError" || !owners.size) throw error;
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
          activeStream?.getTracks().forEach((track) => track.stop());
          activeStream = stream;
          stopUnusedStream();
          return stream;
        })();
        pendingRequest = request;
        void request.finally(() => { if (pendingRequest === request) pendingRequest = null; }).catch(() => undefined);
      }
      await pendingRequest;
    }
    if (signal.aborted || !activeStream) throw abortError();
    return { stream: activeStream, release };
  } catch (error) {
    release();
    throw error;
  }
};

/** Keep the first intrinsic-size frame hidden until the full-bleed preview has painted. */
export const playCameraPreview = async (video: HTMLVideoElement, stream: MediaStream, signal: AbortSignal) => {
  if (signal.aborted) throw abortError();
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await new Promise<void>((resolve, reject) => {
    let frame: number | undefined;
    let scheduled = false;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", fail);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
    const cancel = () => { settled = true; cleanup(); reject(abortError()); };
    const fail = () => { settled = true; cleanup(); reject(new Error("Camera preview could not start.")); };
    const ready = () => {
      if (settled || scheduled || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      scheduled = true;
      video.removeEventListener("loadeddata", ready);
      // Two paint frames allow WebKit to apply object-fit after metadata arrives.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { settled = true; cleanup(); resolve(); });
      });
    };
    const timer = setTimeout(fail, 8000);
    signal.addEventListener("abort", cancel, { once: true });
    video.addEventListener("loadeddata", ready);
    video.addEventListener("error", fail, { once: true });
    void video.play().then(ready, fail);
  });
  if (signal.aborted) throw abortError();
};
