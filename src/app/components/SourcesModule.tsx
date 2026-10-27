import { useEffect, useMemo, useState } from "react";
import { Building2, CloudRain, Database, Download, FileSearch, Fuel, LoaderCircle, Search, Truck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ApiError, apiFetch, apiRequest } from "../apiClient";

type SourceFile = {
  fileName: string;
  fileType: string;
  sizeBytes: number;
  updatedAt: string;
};

type SummaryItem = { name: string; records: number };
type ImportedData = {
  registries: {
    records: number;
    sourceCount: number;
    byDepartment: SummaryItem[];
    byCategory: SummaryItem[];
    description: string;
  } | null;
  environmental: {
    records: number;
    sourceCount: number;
    byComponent: SummaryItem[];
    byParameter: { name: string; unit: string; records: number }[];
    byYear: { year: number; records: number }[];
    dateRange: { from: string | null; to: string | null };
    thresholdsConfigured: boolean;
    description: string;
  } | null;
  prices: {
    available: boolean;
    records: number;
    sourceFile: string;
    dateRange?: { from: string | null; to: string | null };
    latestPrices?: { product: string; period: string; observations: number; average: number; minimum: number; maximum: number }[];
    minoristRegistry?: {
      records: number;
      dateRange: { from: string | null; to: string | null };
      byProduct: { product: string; records: number; averageBandMidpoint: number; minimum: number; maximum: number; unit: string }[];
    };
    description?: string;
  } | null;
};

type SourcePreview = {
  fileName: string;
  fileType: string;
  previewAvailable: boolean;
  sheets: string[];
  selectedSheet?: string;
  columns?: (string | number | null)[];
  rows: (string | number | boolean | null)[][];
  totalRows: number;
};

const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;
const numberFormat = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });
const SOURCE_TYPES = ["Todos", "csv", "xlsx", "xls", "pdf", "docx"];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${numberFormat.format(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${numberFormat.format(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function MetricCard({ title, value, detail, icon: Icon, color }: {
  title: string; value: string; detail: string; icon: LucideIcon; color: string;
}) {
  return (
    <div className="bg-white rounded p-4 flex gap-3 items-start" style={{ border: "1px solid #e1dfdd" }}>
      <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <div className="text-[20px] font-semibold" style={{ color: "#201f1e" }}>{value}</div>
        <div className="text-[11px] font-medium" style={{ color: "#323130" }}>{title}</div>
        <div className="text-[10px] mt-1" style={{ color: "#797775" }}>{detail}</div>
      </div>
    </div>
  );
}

function SummaryList({ title, items, unit }: { title: string; items: SummaryItem[]; unit?: string }) {
  const maximum = Math.max(1, ...items.map((item) => item.records));
  return (
    <section className="bg-white rounded p-4" style={{ border: "1px solid #e1dfdd" }}>
      <h2 className="text-[12px] font-semibold mb-3" style={{ color: "#201f1e" }}>{title}</h2>
      {items.length === 0 ? (
        <p className="text-[10px]" style={{ color: "#797775" }}>No hay registros para mostrar.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item.name}>
              <div className="flex justify-between gap-3 text-[10px] mb-1">
                <span className="truncate" style={{ color: "#323130" }}>{item.name}</span>
                <span className="flex-shrink-0 font-medium" style={{ color: "#605e5c" }}>{numberFormat.format(item.records)}{unit ? ` ${unit}` : ""}</span>
              </div>
              <div className="h-1.5 rounded" style={{ background: "#f3f2f1" }}>
                <div className="h-full rounded" style={{ width: `${Math.max(3, (item.records / maximum) * 100)}%`, background: "#0f6cbd" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function SourcesModule() {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [imported, setImported] = useState<ImportedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [selectedFile, setSelectedFile] = useState<SourceFile | null>(null);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<SourceFile[]>("/api/source-files"),
      apiRequest<ImportedData>("/api/datasets/imported"),
    ])
      .then(([sourceFiles, importedData]) => {
        if (!active) return;
        setFiles(sourceFiles);
        setImported(importedData);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las fuentes.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filteredFiles = useMemo(() => files.filter((file) => (
    (typeFilter === "Todos" || file.fileType === typeFilter)
    && file.fileName.toLocaleLowerCase("es-PE").includes(search.trim().toLocaleLowerCase("es-PE"))
  )), [files, search, typeFilter]);

  async function openPreview(file: SourceFile, sheet?: string) {
    setSelectedFile(file);
    setPreview(null);
    setPreviewError(null);
    if (!["csv", "xlsx"].includes(file.fileType)) {
      setPreviewError("La vista previa no está disponible para este formato; puedes descargar el archivo.");
      return;
    }
    if (file.sizeBytes > MAX_PREVIEW_BYTES) {
      setPreviewError("El archivo supera 20 MB. Para proteger el rendimiento, descarga el archivo para consultarlo.");
      return;
    }
    setPreviewLoading(true);
    try {
      const sheetQuery = sheet ? `?sheet=${encodeURIComponent(sheet)}` : "";
      const result = await apiRequest<SourcePreview>(`/api/source-files/${encodeURIComponent(file.fileName)}/preview${sheetQuery}`);
      setPreview(result);
    } catch (loadError) {
      setPreviewError(loadError instanceof Error ? loadError.message : "No se pudo cargar la vista previa.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function downloadFile(file: SourceFile) {
    try {
      const response = await apiFetch(`/api/source-files/${encodeURIComponent(file.fileName)}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.fileName;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof ApiError ? downloadError.message : "No se pudo descargar el archivo.");
    }
  }

  const closePreview = () => {
    setSelectedFile(null);
    setPreview(null);
    setPreviewError(null);
  };
  const previewColumns = preview?.columns ?? preview?.rows[0] ?? [];
  const previewRows = preview?.columns ? preview.rows : preview?.rows.slice(1) ?? [];

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-4 h-4" style={{ color: "#0f6cbd" }} />
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#0f6cbd" }}>Datos sectoriales importados</span>
        </div>
        <h1 className="text-[17px] font-semibold" style={{ color: "#201f1e" }}>Fuentes de datos</h1>
        <p className="text-[11px] mt-1" style={{ color: "#605e5c" }}>Catálogo de archivos disponibles y resúmenes derivados de los nuevos registros de transporte, ambiente y precios.</p>
      </header>

      {error && <div role="alert" className="rounded px-3 py-2 text-[11px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{error}</div>}
      {loading ? (
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "#605e5c" }}><LoaderCircle className="w-4 h-4 animate-spin" />Cargando fuentes desde PostgreSQL…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard title="Archivos en el catálogo" value={numberFormat.format(files.length)} detail="Documentos importados y protegidos por autenticación" icon={Database} color="#0f6cbd" />
            <MetricCard title="Registros de autorizaciones" value={numberFormat.format(imported?.registries?.records ?? 0)} detail={`${imported?.registries?.sourceCount ?? 0} registros administrativos y de instalaciones`} icon={Truck} color="#8764b8" />
            <MetricCard title="Muestreos ambientales" value={numberFormat.format(imported?.environmental?.records ?? 0)} detail={`${imported?.environmental?.dateRange?.from ?? "—"} a ${imported?.environmental?.dateRange?.to ?? "—"}`} icon={CloudRain} color="#107c10" />
            <MetricCard title="Observaciones de precios" value={numberFormat.format(imported?.prices?.records ?? 0)} detail={`${imported?.prices?.dateRange?.from ?? "—"} a ${imported?.prices?.dateRange?.to ?? "—"}`} icon={Fuel} color="#ca5010" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <SummaryList title="Registros por tipo" items={imported?.registries?.byCategory.slice(0, 10) ?? []} />
            <SummaryList title="Instalaciones y registros por departamento" items={imported?.registries?.byDepartment.slice(0, 10) ?? []} />
            <SummaryList title="Muestreos por componente ambiental" items={imported?.environmental?.byComponent ?? []} />
            <SummaryList
              title="Parámetros ambientales más frecuentes"
              items={(imported?.environmental?.byParameter ?? []).slice(0, 10).map((item) => ({
                name: item.unit ? `${item.name} (${item.unit})` : item.name,
                records: item.records,
              }))}
            />
          </div>

          <section className="bg-white rounded p-4" style={{ border: "1px solid #e1dfdd" }}>
            <h2 className="text-[12px] font-semibold mb-2" style={{ color: "#201f1e" }}>Cobertura ambiental por año</h2>
            <div className="flex flex-wrap gap-2">
              {(imported?.environmental?.byYear ?? []).map(({ year, records }) => (
                <span key={year} className="px-2.5 py-1 rounded text-[10px]" style={{ background: "#f3f2f1", color: "#323130" }}>
                  {year}: {numberFormat.format(records)} muestras
                </span>
              ))}
              {(!imported?.environmental?.byYear.length) && <span className="text-[10px]" style={{ color: "#797775" }}>No hay fechas válidas en los archivos.</span>}
            </div>
            <p className="text-[10px] mt-3" style={{ color: "#605e5c" }}>{imported?.environmental?.description}</p>
          </section>

          <section className="bg-white rounded p-4" style={{ border: "1px solid #e1dfdd" }}>
            <h2 className="text-[12px] font-semibold mb-3" style={{ color: "#201f1e" }}>Precios anonimizados del periodo más reciente por producto</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {(imported?.prices?.latestPrices ?? []).map((price) => (
                <div key={price.product} className="rounded p-3" style={{ background: "#faf9f8" }}>
                  <div className="text-[10px]" style={{ color: "#605e5c" }}>{price.product} · {price.period}</div>
                  <div className="text-[16px] font-semibold mt-1" style={{ color: "#201f1e" }}>{numberFormat.format(price.average)}</div>
                  <div className="text-[9px] mt-1" style={{ color: "#797775" }}>
                    Rango {numberFormat.format(price.minimum)}–{numberFormat.format(price.maximum)} · {numberFormat.format(price.observations)} observaciones
                  </div>
                </div>
              ))}
              {(!imported?.prices?.latestPrices?.length) && <span className="text-[10px]" style={{ color: "#797775" }}>No hay precios disponibles.</span>}
            </div>
            <p className="text-[10px] mt-3" style={{ color: "#605e5c" }}>{imported?.prices?.description}</p>
          </section>

          <section className="bg-white rounded p-4" style={{ border: "1px solid #e1dfdd" }}>
            <h2 className="text-[12px] font-semibold mb-1" style={{ color: "#201f1e" }}>Registro de precios de distribuidores minoristas</h2>
            <p className="text-[10px] mb-3" style={{ color: "#797775" }}>
              {numberFormat.format(imported?.prices?.minoristRegistry?.records ?? 0)} registros · intervalo de fechas {imported?.prices?.minoristRegistry?.dateRange.from ?? "—"} a {imported?.prices?.minoristRegistry?.dateRange.to ?? "—"}. El promedio muestra el punto medio entre los precios mínimo y máximo registrados.
            </p>
            <div className="overflow-auto">
              <table className="w-full text-left text-[10px]">
                <thead><tr style={{ color: "#605e5c" }}><th className="py-2 pr-3 font-medium">Producto</th><th className="py-2 pr-3 font-medium">Registros</th><th className="py-2 pr-3 font-medium">Punto medio promedio</th><th className="py-2 pr-3 font-medium">Mínimo fuente</th><th className="py-2 font-medium">Máximo fuente</th></tr></thead>
                <tbody>{(imported?.prices?.minoristRegistry?.byProduct ?? []).map((product) => (
                  <tr key={product.product} className="border-t" style={{ borderColor: "#edebe9" }}>
                    <td className="py-2 pr-3" style={{ color: "#323130" }}>{product.product}</td>
                    <td className="py-2 pr-3" style={{ color: "#605e5c" }}>{numberFormat.format(product.records)}</td>
                    <td className="py-2 pr-3" style={{ color: "#605e5c" }}>{numberFormat.format(product.averageBandMidpoint)}</td>
                    <td className="py-2 pr-3" style={{ color: "#605e5c" }}>{numberFormat.format(product.minimum)}</td>
                    <td className="py-2" style={{ color: "#605e5c" }}>{numberFormat.format(product.maximum)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded overflow-hidden" style={{ border: "1px solid #e1dfdd" }}>
            <div className="p-4 border-b flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3" style={{ borderColor: "#edebe9" }}>
              <div>
                <h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Catálogo de archivos</h2>
                <p className="text-[10px] mt-1" style={{ color: "#797775" }}>Consulta previa de CSV y Excel disponible para archivos de hasta 20 MB; los demás se pueden descargar.</p>
              </div>
              <div className="flex gap-2">
                <label className="relative flex-1 lg:w-64">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#797775" }} />
                  <input aria-label="Buscar archivos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre…" className="w-full pl-7 pr-2 py-2 rounded text-[10px]" style={{ border: "1px solid #c8c6c4" }} />
                </label>
                <select aria-label="Filtrar tipo de archivo" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="px-2 rounded text-[10px]" style={{ border: "1px solid #c8c6c4" }}>
                  {SOURCE_TYPES.map((type) => <option key={type} value={type}>{type === "Todos" ? type : type.toUpperCase()}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-auto max-h-[560px]">
              <table className="w-full text-left text-[10px]">
                <thead className="sticky top-0" style={{ background: "#faf9f8", color: "#605e5c" }}>
                  <tr><th className="p-2.5 font-medium">Archivo</th><th className="p-2.5 font-medium">Formato</th><th className="p-2.5 font-medium">Tamaño</th><th className="p-2.5 font-medium">Importado</th><th className="p-2.5 font-medium text-right">Acciones</th></tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr key={file.fileName} className="border-t" style={{ borderColor: "#edebe9" }}>
                      <td className="p-2.5 max-w-[480px] break-words" style={{ color: "#323130" }}>{file.fileName}</td>
                      <td className="p-2.5 uppercase" style={{ color: "#605e5c" }}>{file.fileType}</td>
                      <td className="p-2.5 whitespace-nowrap" style={{ color: "#605e5c" }}>{formatBytes(file.sizeBytes)}</td>
                      <td className="p-2.5 whitespace-nowrap" style={{ color: "#605e5c" }}>{new Date(file.updatedAt).toLocaleDateString("es-PE")}</td>
                      <td className="p-2.5">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => void openPreview(file)} title="Vista previa" aria-label={`Vista previa de ${file.fileName}`} className="p-1.5 rounded hover:bg-gray-100" style={{ color: "#0f6cbd" }}><FileSearch className="w-3.5 h-3.5" /></button>
                          <button type="button" onClick={() => void downloadFile(file)} title="Descargar" aria-label={`Descargar ${file.fileName}`} className="p-1.5 rounded hover:bg-gray-100" style={{ color: "#605e5c" }}><Download className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredFiles.length === 0 && <tr><td colSpan={5} className="p-5 text-center" style={{ color: "#797775" }}>No hay archivos que coincidan con el filtro.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-[9px]" style={{ background: "#faf9f8", color: "#797775" }}>Mostrando {numberFormat.format(filteredFiles.length)} de {numberFormat.format(files.length)} archivos. {imported?.registries?.description}</div>
          </section>
        </>
      )}

      {selectedFile && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3" style={{ background: "rgba(0,0,0,.45)" }} role="dialog" aria-modal="true" aria-label={`Vista previa de ${selectedFile.fileName}`}>
          <div className="bg-white rounded shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-start justify-between gap-3" style={{ borderColor: "#edebe9" }}>
              <div className="min-w-0">
                <h2 className="text-[12px] font-semibold break-words" style={{ color: "#201f1e" }}>{selectedFile.fileName}</h2>
                <p className="text-[10px] mt-1" style={{ color: "#797775" }}>{preview ? `${numberFormat.format(preview.totalRows)} filas informadas · muestra de hasta 100 filas` : "Vista de solo lectura"}</p>
              </div>
              <button type="button" onClick={closePreview} aria-label="Cerrar vista previa" className="p-1.5 rounded hover:bg-gray-100" style={{ color: "#605e5c" }}><X className="w-4 h-4" /></button>
            </div>
            {preview?.sheets.length ? (
              <div className="px-4 pt-3">
                <label className="text-[10px] mr-2" htmlFor="source-sheet" style={{ color: "#605e5c" }}>Hoja:</label>
                <select id="source-sheet" value={preview.selectedSheet} onChange={(event) => void openPreview(selectedFile, event.target.value)} className="px-2 py-1 rounded text-[10px]" style={{ border: "1px solid #c8c6c4" }}>
                  {preview.sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
                </select>
              </div>
            ) : null}
            <div className="overflow-auto flex-1 p-4">
              {previewLoading && <div className="flex items-center gap-2 text-[11px]" style={{ color: "#605e5c" }}><LoaderCircle className="w-4 h-4 animate-spin" />Leyendo archivo…</div>}
              {previewError && <p role="alert" className="text-[11px]" style={{ color: "#a4262c" }}>{previewError}</p>}
              {preview?.previewAvailable && (
                <table className="text-left text-[9px] border-collapse">
                  <thead><tr>{previewColumns.map((column, index) => <th key={`${String(column)}-${index}`} className="border p-2 whitespace-nowrap" style={{ background: "#faf9f8", borderColor: "#e1dfdd", color: "#323130" }}>{column ?? `Columna ${index + 1}`}</th>)}</tr></thead>
                  <tbody>{previewRows.map((row, rowIndex) => <tr key={rowIndex}>{previewColumns.map((_, columnIndex) => <td key={columnIndex} className="border p-2 min-w-20 max-w-64 break-words" style={{ borderColor: "#edebe9", color: "#605e5c" }}>{row[columnIndex] == null ? "" : String(row[columnIndex])}</td>)}</tr>)}</tbody>
                </table>
              )}
            </div>
            <div className="p-3 border-t flex justify-end" style={{ borderColor: "#edebe9" }}>
              <button type="button" onClick={() => void downloadFile(selectedFile)} className="inline-flex items-center gap-1.5 rounded px-3 py-2 text-[10px] font-medium text-white" style={{ background: "#0f6cbd" }}><Download className="w-3.5 h-3.5" />Descargar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
