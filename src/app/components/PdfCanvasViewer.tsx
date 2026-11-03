import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfCanvasViewer({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (container) container.replaceChildren();

    async function render() {
      try {
        const data = new Uint8Array(await blob.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data, standardFontDataUrl: "/pdfjs/standard_fonts/" }).promise;
        for (let number = 1; number <= pdf.numPages; number += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.25)";
          canvas.style.background = "#fff";
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (cancelled) return;
          container?.appendChild(canvas);
          setLoading(false);
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("No se pudo mostrar el PDF. Puedes descargar el archivo.");
          setLoading(false);
        }
      }
    }

    void render();
    return () => { cancelled = true; };
  }, [blob]);

  return (
    <div className="mx-auto max-w-3xl">
      {loading && <p className="text-[12px]" style={{ color: "#8a8886" }}>Cargando páginas…</p>}
      {error && <p className="text-[13px]" style={{ color: "#a4262c" }}>{error}</p>}
      <div ref={containerRef} className="flex flex-col gap-3" />
    </div>
  );
}
