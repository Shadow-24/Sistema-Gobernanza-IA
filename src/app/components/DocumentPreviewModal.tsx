import { useEffect, useState } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { PdfCanvasViewer } from "./PdfCanvasViewer";

type PreviewContent = {
  url?: string;
  text?: string;
  sheets?: { name: string; rows: unknown[][] }[];
  files?: string[];
  message?: string;
};

export function DocumentPreviewModal({
  fileName,
  mediaType,
  blob,
  onClose,
}: {
  fileName: string;
  mediaType: string;
  blob: Blob;
  onClose: () => void;
}) {
  const [content, setContent] = useState<PreviewContent | null>(null);
  const extension = fileName.split(".").pop()?.toLowerCase();

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;

    async function loadPreview() {
      try {
        let preview: PreviewContent;
        if (["pdf", "png", "jpg", "jpeg"].includes(extension ?? "")) {
          objectUrl = URL.createObjectURL(blob);
          preview = { url: objectUrl };
        } else if (["txt", "csv"].includes(extension ?? "")) {
          preview = { text: await blob.text() };
        } else if (["xls", "xlsx"].includes(extension ?? "")) {
          const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array" });
          preview = {
            sheets: workbook.SheetNames.map((name) => {
              const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
                header: 1,
                defval: "",
                blankrows: false,
              });
              return { name, rows: rows.slice(0, 100).map((row) => row.slice(0, 20)) };
            }),
          };
        } else if (extension === "docx") {
          const archive = await JSZip.loadAsync(blob);
          const documentXml = await archive.file("word/document.xml")?.async("text");
          if (!documentXml) throw new Error("No se pudo leer el contenido del documento Word.");
          const xml = new DOMParser().parseFromString(documentXml, "application/xml");
          const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p"))
            .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS("*", "t"))
              .map((text) => text.textContent ?? "").join(""))
            .filter(Boolean);
          preview = { text: paragraphs.join("\n\n") || "El documento no contiene texto legible para mostrar." };
        } else if (extension === "zip") {
          const archive = await JSZip.loadAsync(blob);
          preview = { files: Object.keys(archive.files).filter((path) => !archive.files[path].dir) };
        } else {
          preview = { message: "La vista previa no está disponible para este formato. Puedes descargar el archivo." };
        }
        if (active) setContent(preview);
      } catch {
        if (active) setContent({ message: "No se pudo interpretar el contenido para mostrar la vista previa." });
      }
    }

    void loadPreview();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blob, extension]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${fileName}`}>
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#edebe9" }}>
          <h3 className="truncate text-[14px] font-semibold" style={{ color: "#201f1e" }}>{fileName}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar vista previa" className="rounded px-2 py-1 text-[12px]" style={{ color: "#605e5c" }}>Cerrar</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {!content ? (
            <p className="text-[12px]" style={{ color: "#8a8886" }}>Cargando vista previa…</p>
          ) : content.message ? (
            <p className="text-[13px]" style={{ color: "#605e5c" }}>{content.message}</p>
          ) : content.url && mediaType.startsWith("image/") ? (
            <img src={content.url} alt={fileName} className="mx-auto max-h-[75vh] max-w-full object-contain" />
          ) : extension === "pdf" ? (
            <PdfCanvasViewer blob={blob} />
          ) : content.url ? (
            <iframe title={`Vista previa de ${fileName}`} src={content.url} className="h-[75vh] w-full border-0" />
          ) : content.sheets ? (
            <div className="space-y-5">
              {content.sheets.map((sheet) => (
                <section key={sheet.name}>
                  <h4 className="mb-2 text-[12px] font-semibold">{sheet.name}</h4>
                  <div className="overflow-auto">
                    <table className="min-w-full border-collapse text-[11px]">
                      <tbody>{sheet.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>{row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="border px-2 py-1" style={{ borderColor: "#edebe9" }}>{String(cell)}</td>
                        ))}</tr>
                      ))}</tbody>
                    </table>
                  </div>
                  {sheet.rows.length === 100 && <p className="mt-1 text-[10px]" style={{ color: "#8a8886" }}>Vista previa limitada a las primeras 100 filas.</p>}
                </section>
              ))}
            </div>
          ) : content.files ? (
            content.files.length ? (
              <ul className="space-y-1 text-[12px]">{content.files.map((path) => <li key={path}>{path}</li>)}</ul>
            ) : <p className="text-[12px]" style={{ color: "#8a8886" }}>El archivo ZIP no contiene archivos.</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-[12px]" style={{ color: "#201f1e" }}>{content.text}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
