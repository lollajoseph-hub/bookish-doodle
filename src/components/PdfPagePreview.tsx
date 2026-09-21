import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface LinkRect {
  href: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function PdfPagePreview({ url, className }: { url: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [links, setLinks] = useState<LinkRect[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const doc = await pdfjsLib.getDocument({ url }).promise;
        const page = await doc.getPage(1);
        const containerWidth = containerRef.current?.clientWidth || 800;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;

        const annotations = await page.getAnnotations();
        const linkRects: LinkRect[] = annotations
          .filter((a: any) => a.subtype === "Link" && (a.url || a.unsafeUrl))
          .map((a: any) => {
            const [x1, y1, x2, y2] = a.rect;
            const [px1, py1] = viewport.convertToViewportPoint(x1, y1);
            const [px2, py2] = viewport.convertToViewportPoint(x2, y2);
            return {
              href: a.url || a.unsafeUrl,
              left: Math.min(px1, px2),
              top: Math.min(py1, py2),
              width: Math.abs(px2 - px1),
              height: Math.abs(py2 - py1),
            };
          });
        if (!cancelled) setLinks(linkRects);
      } catch (e) {
        console.error("[PdfPagePreview] failed to render", e);
        if (!cancelled) setError(true);
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className={className}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 text-sm text-muted-foreground underline"
        >
          Open file
        </a>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block" }} />
      {links.map((l, i) => (
        <a
          key={i}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ position: "absolute", left: l.left, top: l.top, width: l.width, height: l.height }}
          aria-label="Open link"
        />
      ))}
    </div>
  );
}
