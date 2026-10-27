import * as XLSX from "xlsx";

export type HydrocarbonMonth = {
  year: number;
  month: number;
  label: string;
  productionValueUsd: number;
  canonAndParticipationUsd: number;
};

export type HydrocarbonSupervisionMonth = {
  year: number;
  month: number;
  label: string;
  supervisions: number;
  pas: number;
};

export type HydrocarbonData = {
  determinations: HydrocarbonMonth[];
  supervision: HydrocarbonSupervisionMonth[];
};

const MONTH_SHEETS = [
  { sheet: "Ene", label: "Ene" },
  { sheet: "Feb", label: "Feb" },
  { sheet: "Mar", label: "Mar" },
  { sheet: "Abr", label: "Abr" },
  { sheet: "May", label: "May" },
  { sheet: "Jun", label: "Jun" },
  { sheet: "Jul", label: "Jul" },
  { sheet: "Ago", label: "Ago" },
  { sheet: "Sep", label: "Sep" },
  { sheet: "Oct", label: "Oct" },
  { sheet: "Nov", label: "Nov" },
  { sheet: "Dic", label: "Dic" },
];

const MONTH_LABELS = MONTH_SHEETS.map(({ label }) => label);

function numericValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(/,/g, "").trim());
  return Number.NaN;
}

function normalizeHeader(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase()
    : "";
}

function monthFromDate(value: unknown): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getUTCMonth() + 1;
  if (typeof value === "string") {
    const match = value.match(/^(\d{1,2})\/\d{1,2}\/\d{2,4}$/);
    if (match) return Number(match[1]);
  }
  return 0;
}

async function fetchWorkbook(filename: string): Promise<XLSX.WorkBook> {
  const response = await fetch(`/imports/${encodeURI(filename)}`);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${filename} (HTTP ${response.status}).`);
  }
  return XLSX.read(await response.arrayBuffer(), { type: "array" });
}

function parseDeterminations(workbook: XLSX.WorkBook): HydrocarbonMonth[] {
  return MONTH_SHEETS.flatMap(({ sheet, label }, index) => {
    const worksheet = workbook.Sheets[sheet];
    if (!worksheet) return [];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    const period = rows
      .flat()
      .find((value): value is string => typeof value === "string" && value.includes("Correspondiente a"));
    if (!period?.includes("2026")) return [];

    const totals = rows.find((row) => row[0] === "Total General");
    if (!totals) return [];

    const productionValueUsd = numericValue(totals[14]);
    const canonAndParticipationUsd = numericValue(totals[15]);
    if (
      !Number.isFinite(productionValueUsd) ||
      !Number.isFinite(canonAndParticipationUsd) ||
      productionValueUsd <= 0 ||
      canonAndParticipationUsd <= 0
    ) {
      return [];
    }

    return [{ month: index + 1, label, productionValueUsd, canonAndParticipationUsd }];
  });
}

function parseSupervisionData(workbook: XLSX.WorkBook): HydrocarbonSupervisionMonth[] {
  const monthlyCounts = new Map<number, HydrocarbonSupervisionMonth>();
  const sheets = [
    { sheetName: "MNHL1_Supervisones", yearHeader: "ANO", monthHeader: "MES_NUMERO", valueHeader: "CANTIDAD", dateHeader: "FECHA", key: "supervisions" },
    { sheetName: "MNHL1_PAS", yearHeader: "ANO", monthHeader: "MES", valueHeader: "CANTIDAD_PAS", dateHeader: "FECHA", key: "pas" },
  ] as const;

  for (const { sheetName, yearHeader, monthHeader, valueHeader, dateHeader, key } of sheets) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    const headers = rows[0] ?? [];
    const yearIndex = headers.findIndex((value) => normalizeHeader(value) === yearHeader);
    const monthIndex = headers.findIndex((value) => normalizeHeader(value) === monthHeader);
    const valueIndex = headers.findIndex((value) => normalizeHeader(value) === valueHeader);
    const dateIndex = headers.findIndex((value) => normalizeHeader(value) === dateHeader);
    if (yearIndex < 0 || monthIndex < 0 || valueIndex < 0) continue;

    for (const row of rows.slice(1)) {
      if (Number(row[yearIndex]) !== 2026) continue;
      const monthFromLabel = MONTH_LABELS.findIndex((label) => normalizeHeader(row[monthIndex]) === normalizeHeader(label)) + 1;
      const month = monthFromLabel || (dateIndex >= 0 ? monthFromDate(row[dateIndex]) : 0);
      const value = numericValue(row[valueIndex]);
      if (month === 0 || !Number.isFinite(value)) continue;

      const monthly = monthlyCounts.get(month) ?? {
        month,
        label: MONTH_LABELS[month - 1],
        supervisions: 0,
        pas: 0,
      };
      monthly[key] += value;
      monthlyCounts.set(month, monthly);
    }
  }

  return Array.from(monthlyCounts.values()).sort((a, b) => a.month - b.month);
}

export async function loadHydrocarbonData(): Promise<HydrocarbonData> {
  const [determinationWorkbook, supervisionWorkbook] = await Promise.all([
    fetchWorkbook("Determinación+2026.xlsx"),
    fetchWorkbook("MNHL1-PAS HL.xlsx"),
  ]);
  const determinations = parseDeterminations(determinationWorkbook);
  if (determinations.length === 0) {
    throw new Error("El archivo no contiene totales mensuales válidos de hidrocarburos para 2026.");
  }

  const supervision = parseSupervisionData(supervisionWorkbook);
  if (supervision.length === 0) {
    throw new Error("El archivo de supervisiones y PAS no contiene registros mensuales de 2026.");
  }

  return { determinations, supervision };
}
