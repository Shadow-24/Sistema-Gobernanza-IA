import { createContext, useContext, useEffect, useState } from "react";
import { CSVRow } from "../utils/csvParser";
import { HydrocarbonData } from "../utils/hydrocarbonData";
import { OperationalData } from "../utils/operationalData";
import { apiRequest } from "./apiClient";
import { useAuth } from "./AuthContext";

export type SectorDatasets = {
  facilities: CSVRow[];
  complaints: CSVRow[];
  fuelDictionary: CSVRow[];
  cases: CSVRow[];
  resolutions: CSVRow[];
};

const EMPTY_DATASETS: SectorDatasets = {
  facilities: [], complaints: [], fuelDictionary: [], cases: [], resolutions: [],
};

const SectorDataContext = createContext<{
  datasets: SectorDatasets;
  loading: boolean;
  hydrocarbonData: HydrocarbonData | null;
  hydrocarbonLoading: boolean;
  hydrocarbonError: string | null;
  operationalData: OperationalData | null;
  operationalLoading: boolean;
  operationalError: string | null;
  dataError: string | null;
}>({
  datasets: EMPTY_DATASETS,
  loading: true,
  hydrocarbonData: null,
  hydrocarbonLoading: true,
  hydrocarbonError: null,
  operationalData: null,
  operationalLoading: true,
  operationalError: null,
  dataError: null,
});

export function SectorDataProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [datasets, setDatasets] = useState(EMPTY_DATASETS);
  const [loading, setLoading] = useState(true);
  const [hydrocarbonData, setHydrocarbonData] = useState<HydrocarbonData | null>(null);
  const [hydrocarbonLoading, setHydrocarbonLoading] = useState(true);
  const [hydrocarbonError, setHydrocarbonError] = useState<string | null>(null);
  const [operationalData, setOperationalData] = useState<OperationalData | null>(null);
  const [operationalLoading, setOperationalLoading] = useState(true);
  const [operationalError, setOperationalError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setDatasets(EMPTY_DATASETS);
      setHydrocarbonData(null);
      setOperationalData(null);
      setDataError(null);
      setHydrocarbonError(null);
      setOperationalError(null);
      setLoading(false);
      setHydrocarbonLoading(false);
      setOperationalLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setHydrocarbonLoading(true);
    setOperationalLoading(true);
    setDataError(null);
    setHydrocarbonError(null);
    setOperationalError(null);
    apiRequest<Record<string, CSVRow[]>>("/api/datasets")
      .then((storedDatasets) => {
        if (!active) return;
        setDatasets({
          facilities: storedDatasets.facilities ?? [],
          complaints: storedDatasets.complaints ?? [],
          fuelDictionary: storedDatasets.fuelDictionary ?? [],
          cases: storedDatasets.cases ?? [],
          resolutions: storedDatasets.resolutions ?? [],
        });
      })
      .catch((error: unknown) => {
        console.error("No se pudieron cargar los datos sectoriales desde PostgreSQL:", error);
        if (active) setDataError(error instanceof Error ? error.message : "No se pudieron cargar los datos sectoriales.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    apiRequest<HydrocarbonData>("/api/datasets/hydrocarbons")
      .then((data) => { if (active) setHydrocarbonData(data); })
      .catch((error: unknown) => {
        console.error("No se pudieron cargar los datos de hidrocarburos desde PostgreSQL:", error);
        if (active) setHydrocarbonError(error instanceof Error ? error.message : "No se pudieron cargar los datos de hidrocarburos.");
      })
      .finally(() => { if (active) setHydrocarbonLoading(false); });
    apiRequest<OperationalData>("/api/datasets/operations")
      .then((data) => { if (active) setOperationalData(data); })
      .catch((error: unknown) => {
        console.error("No se pudieron cargar los datos operativos desde PostgreSQL:", error);
        if (active) setOperationalError(error instanceof Error ? error.message : "No se pudieron cargar los datos operativos.");
      })
      .finally(() => { if (active) setOperationalLoading(false); });

    return () => { active = false; };
  }, [user, authLoading]);

  return (
    <SectorDataContext.Provider value={{ datasets, loading, hydrocarbonData, hydrocarbonLoading, hydrocarbonError, operationalData, operationalLoading, operationalError, dataError }}>
      {children}
    </SectorDataContext.Provider>
  );
}

export function useSectorData() {
  return useContext(SectorDataContext);
}

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function csvValue(row: CSVRow, ...fieldNames: string[]): string {
  const keys = Object.keys(row);
  for (const name of fieldNames) {
    const target = normalizeKey(name);
    const key = keys.find((candidate) => normalizeKey(candidate) === target)
      ?? keys.find((candidate) => normalizeKey(candidate).includes(target));
    if (key && row[key] !== undefined) return row[key].trim();
  }
  return "";
}

export function csvYear(row: CSVRow, ...fieldNames: string[]): number | null {
  const match = csvValue(row, ...fieldNames).match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

export function latestCsvYear(rows: CSVRow[], ...fieldNames: string[]): number | null {
  return rows.reduce<number | null>((latest, row) => {
    const year = csvYear(row, ...fieldNames);
    return year !== null && (latest === null || year > latest) ? year : latest;
  }, null);
}

export function csvMonth(row: CSVRow, ...fieldNames: string[]): number | null {
  const value = csvValue(row, ...fieldNames);
  const localDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (localDate) return Number(localDate[2]);
  const isoDate = value.match(/^(\d{4})-(\d{2})-/);
  if (isoDate) return Number(isoDate[2]);
  return null;
}

export function groupCount(rows: CSVRow[], fieldNames: string[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = csvValue(row, ...fieldNames).trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return Array.from(counts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}