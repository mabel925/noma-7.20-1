import React from "react";
import { Image as ImageIcon } from "lucide-react";
import { getCachedImageResource, getImageResource, invalidateImageResource, retainImageResource, subscribeImageResource } from "../services/imageResources";

type PersistentImageProps = React.ImgHTMLAttributes<HTMLImageElement> & { showSkeleton?: boolean };

export const PersistentImage: React.FC<PersistentImageProps> = ({
  src, alt = "", className = "", loading = "eager", showSkeleton = false, onError, ...props
}) => {
  const imageSrc = typeof src === "string" ? src : "";
  const sentinel = React.useRef<HTMLSpanElement>(null);
  const [visibleSource, setVisibleSource] = React.useState("");
  const [retry, setRetry] = React.useState({ source: imageSrc, count: 0 });
  const [failedSource, setFailedSource] = React.useState("");
  const retryCount = retry.source === imageSrc ? retry.count : 0;
  const resource = React.useSyncExternalStore(
    React.useCallback((notify) => subscribeImageResource(imageSrc, notify), [imageSrc]),
    React.useCallback(() => getCachedImageResource(imageSrc), [imageSrc]),
    () => undefined,
  );
  const shouldLoad = loading !== "lazy" || visibleSource === imageSrc || Boolean(resource);

  React.useEffect(() => {
    if (!imageSrc || shouldLoad) return;
    if (!sentinel.current || !("IntersectionObserver" in window)) { setVisibleSource(imageSrc); return; }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisibleSource(imageSrc);
      observer.disconnect();
    }, { rootMargin: "300px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [imageSrc, shouldLoad]);

  React.useEffect(() => imageSrc ? retainImageResource(imageSrc) : undefined, [imageSrc]);

  React.useEffect(() => {
    if (!imageSrc || !shouldLoad || resource || failedSource === imageSrc) return;
    let cancelled = false;
    void getImageResource(imageSrc).catch(() => { if (!cancelled) setFailedSource(imageSrc); });
    return () => { cancelled = true; };
  }, [imageSrc, shouldLoad, resource, retryCount, failedSource]);

  React.useEffect(() => {
    if (!imageSrc || failedSource !== imageSrc || !shouldLoad || resource) return;
    const retryLoad = () => {
      setFailedSource("");
      setRetry((current) => ({ source: imageSrc, count: current.source === imageSrc ? current.count + 1 : 1 }));
    };
    const retryVisible = () => { if (document.visibilityState === "visible") retryLoad(); };
    const timer = retryCount === 0 ? window.setTimeout(retryLoad, 1000) : undefined;
    window.addEventListener("online", retryLoad);
    document.addEventListener("visibilitychange", retryVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", retryLoad);
      document.removeEventListener("visibilitychange", retryVisible);
    };
  }, [imageSrc, failedSource, shouldLoad, resource, retryCount]);

  return <>
    {loading === "lazy" && <span ref={sentinel} className="pointer-events-none absolute inset-0" aria-hidden="true" />}
    {showSkeleton && !resource && (failedSource === imageSrc
      ? <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#DDDAD5] text-[#232121]/25" aria-hidden="true"><ImageIcon className="h-5 w-5" strokeWidth={1.6} /></div>
      : <div className="noma-image-skeleton absolute inset-0 z-0" aria-hidden="true" />)}
    {resource && <img {...props} src={resource.displaySrc} alt={alt} className={className} loading={loading} decoding="sync" onError={(event) => {
      invalidateImageResource(imageSrc, resource);
      setFailedSource(imageSrc);
      onError?.(event);
    }} />}
  </>;
};

export const SkeletonImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({ className = "", loading = "lazy", ...props }) => (
  <PersistentImage {...props} loading={loading} className={`${className} relative z-[1]`} showSkeleton />
);
