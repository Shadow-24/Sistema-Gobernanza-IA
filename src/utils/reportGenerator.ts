/**
 * Report Generator Core - Extracción y transformación de datos para reportes
 */

import { CSVRow } from './csvParser';
import { apiRequest } from '../app/apiClient';

// Tipos de datos
export interface Resolution {
  id: string;
  fecha: string;
  tipo: string;
  sector: string;
  departamento: string;
  monto?: string;
  estado: string;
  descripcion?: string;
}

export interface Case {
  id: string;
  codigo: string;
  fecha: string;
  sector: string;
  departamento: string;
  monto?: string;
  estado: string;
  descripcion?: string;
  resolucion?: string;
}

export interface Complaint {
  id: string;
  codigo: string;
  fecha: string;
  departamento: string;
  tipoImpacto: string;
  estado: string;
  descripcion?: string;
}

export interface Facility {
  id: string;
  nombre: string;
  departamento: string;
  sector: string;
  ubicacion?: string;
  capacidad?: string;
}

export type ReportPeriodData = {
  cases: Case[];
  resolutions: Resolution[];
  complaints: Complaint[];
  facilities: Facility[];
  totalFines: number;
};

// Cache de datos parseados
const dataCache = new Map<string, CSVRow[]>();
let datasetsRequest: Promise<Record<string, CSVRow[]>> | null = null;
const DATASET_KEYS_BY_FILENAME: Record<string, string> = {
  'Resolucionesdirectorales20182025_2944601782350740761.csv': 'resolutions',
  'Expedientesresueltos20212025_2944571782350726004.csv': 'cases',
  'DenunciasSINADA20192025_2944631782350634676.csv': 'complaints',
  'CDCLyOPDHconInstalacionesFijas.csv': 'facilities',
};

function getCSVValue(row: CSVRow, ...fieldNames: string[]): string {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const keys = Object.keys(row);
  for (const fieldName of fieldNames) {
    const expected = normalize(fieldName);
    const key = keys.find((candidate) => normalize(candidate) === expected)
      ?? keys.find((candidate) => normalize(candidate).includes(expected));
    if (key) return row[key]?.trim() ?? '';
  }
  return '';
}

/**
 * Carga y cachea datos de CSV
 */
async function loadCSVData(filename: string): Promise<CSVRow[]> {
  if (dataCache.has(filename)) {
    return dataCache.get(filename)!;
  }
  const datasetKey = DATASET_KEYS_BY_FILENAME[filename];
  if (!datasetKey) throw new Error(`No hay una clave de dataset configurada para ${filename}.`);
  const request = datasetsRequest ?? apiRequest<Record<string, CSVRow[]>>('/api/datasets');
  datasetsRequest = request;
  let datasets: Record<string, CSVRow[]>;
  try {
    datasets = await request;
  } catch (error) {
    if (datasetsRequest === request) datasetsRequest = null;
    throw error;
  }
  const data = datasets[datasetKey];
  if (!data) throw new Error(`El dataset ${datasetKey} no está disponible en PostgreSQL.`);
  dataCache.set(filename, data);
  return data;
}

/**
 * Extrae resoluciones del CSV de resoluciones directorales
 */
export async function extractResolutions(year?: number): Promise<Resolution[]> {
  const csvData = await loadCSVData('Resolucionesdirectorales20182025_2944601782350740761.csv');
  
  return csvData
    .filter((row) => {
      if (!year) return true;
      const rowYear = extractYear(getCSVValue(row, 'FECHA RD'));
      return rowYear === year;
    })
    .map((row, index) => ({
      id: getCSVValue(row, 'NRO RESOLU') || `RES-${index + 1}`,
      fecha: getCSVValue(row, 'FECHA RD'),
      tipo: getCSVValue(row, 'TIPO DE RD') || 'No especificado',
      sector: getCSVValue(row, 'SECTOR') || 'No especificado',
      departamento: getCSVValue(row, 'DEPARTAMENTO') || 'No especificado',
      estado: getCSVValue(row, 'TIPO DE RD') || 'No especificado',
      descripcion: [getCSVValue(row, 'EXPEDIENTE'), getCSVValue(row, 'RAZON SOCIAL'), getCSVValue(row, 'UNIDAD AMBIENTAL')].filter(Boolean).join(' · '),
    }));
}

/**
 * Extrae casos del CSV de expedientes resueltos
 */
export async function extractCases(year?: number): Promise<Case[]> {
  const csvData = await loadCSVData('Expedientesresueltos20212025_2944571782350726004.csv');
  
  return csvData
    .filter((row) => {
      if (!year) return true;
      const rowYear = extractYear(getCSVValue(row, 'FECHA DE RESOLU'));
      return rowYear === year;
    })
    .map((row, index) => {
      const fine = getCSVValue(row, 'MULTA TFA');
      return {
        id: `CASE-${index + 1}`,
        codigo: getCSVValue(row, 'N° EXPEDIENTE', 'Nº EXPEDIENTE', 'EXPEDIENTE') || `CASE-${index + 1}`,
        fecha: getCSVValue(row, 'FECHA DE RESOLU'),
        sector: getCSVValue(row, 'SECTOR') || 'No especificado',
        departamento: getCSVValue(row, 'DEPARTAMENTO') || 'No especificado',
        monto: fine === '-999' ? undefined : fine || undefined,
        estado: getCSVValue(row, 'SENTIDO DE LA RESOLU') || 'No especificado',
        descripcion: [getCSVValue(row, 'ADMINISTRADO'), getCSVValue(row, 'UNIDAD FISCALIZABLE')].filter(Boolean).join(' · '),
        resolucion: getCSVValue(row, 'RESOLUCION TFA'),
      };
    });
}

/**
 * Extrae quejas del CSV de SINADA
 */
export async function extractComplaints(year?: number): Promise<Complaint[]> {
  const csvData = await loadCSVData('DenunciasSINADA20192025_2944631782350634676.csv');
  
  return csvData
    .filter((row) => {
      if (!year) return true;
      const rowYear = extractYear(getCSVValue(row, 'FECHA DE REGISTRO'));
      return rowYear === year;
    })
    .map((row, index) => ({
      id: `COMPLAINT-${index + 1}`,
      codigo: getCSVValue(row, 'CODIGO SINADA') || `COMPLAINT-${index + 1}`,
      fecha: getCSVValue(row, 'FECHA DE REGISTRO'),
      departamento: getCSVValue(row, 'DEPARTAMENTO') || 'No especificado',
      tipoImpacto: ['AGUA', 'AIRE', 'SUELO', 'FAUNA', 'FLORA', 'POBLACION', 'EFLUENTES', 'RESIDUOS SOLIDOS', 'GASES/HUMO', 'MATERIAL PARTICULADO', 'TALA', 'RADIACION NO IONIZANTE', 'FUENTE VISUAL', 'FUENTE SONORA']
        .filter((field) => getCSVValue(row, field) === '1').join(', ') || 'Sin componente marcado',
      estado: getCSVValue(row, 'ESTADO') || 'No especificado',
      descripcion: [getCSVValue(row, 'ACTIVIDAD ECONOMICA'), getCSVValue(row, 'PROVINCIA'), getCSVValue(row, 'DISTRITO')].filter(Boolean).join(' · '),
    }));
}

/**
 * Extrae instalaciones del CSV de CDCLy
 */
export async function extractFacilities(): Promise<Facility[]> {
  const csvData = await loadCSVData('CDCLyOPDHconInstalacionesFijas.csv');
  
  return csvData.map((row, index) => ({
    id: `FAC-${index + 1}`,
    nombre: getCSVValue(row, 'RAZON SOCIAL') || 'No especificado',
    departamento: getCSVValue(row, 'DEPARTAMENTO') || 'No especificado',
    sector: 'Hidrocarburos',
    ubicacion: [getCSVValue(row, 'DIRECCION OPERATIVA'), getCSVValue(row, 'PROVINCIA'), getCSVValue(row, 'DISTRITO')].filter(Boolean).join(', '),
    capacidad: getCSVValue(row, 'CAP.TOTAL CL (gl)'),
  }));
}

/**
 * Extrae el año de una cadena de fecha
 */
function extractYear(dateString: string): number | null {
  const match = dateString.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

function parseSourceDate(dateString: string): Date | null {
  const value = dateString.trim();
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return new Date(Date.UTC(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3])));
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return new Date(Date.UTC(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2])));
  return null;
}

function isWithinPeriod(dateString: string, startDate: string, endDate: string): boolean {
  const date = parseSourceDate(dateString);
  if (!date) return false;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);
  return date >= start && date <= end;
}

export async function getReportPeriodData(startDate: string, endDate: string): Promise<ReportPeriodData> {
  const [allCases, allResolutions, allComplaints, facilities] = await Promise.all([
    extractCases(), extractResolutions(), extractComplaints(), extractFacilities(),
  ]);
  const cases = allCases.filter((item) => isWithinPeriod(item.fecha, startDate, endDate));
  const resolutions = allResolutions.filter((item) => isWithinPeriod(item.fecha, startDate, endDate));
  const complaints = allComplaints.filter((item) => isWithinPeriod(item.fecha, startDate, endDate));
  const totalFines = cases.reduce((sum, item) => {
    const amount = Number(item.monto?.replace(/[^\d.-]/g, "") ?? 0);
    return Number.isFinite(amount) && amount !== -999 ? sum + amount : sum;
  }, 0);
  return { cases, resolutions, complaints, facilities, totalFines };
}

/**
 * Obtiene años disponibles en los datos
 */
export async function getAvailableYears(): Promise<number[]> {
  const cases = await extractCases();
  const resolutions = await extractResolutions();
  const complaints = await extractComplaints();
  
  const years = new Set<number>();
  
  [...cases, ...resolutions, ...complaints].forEach((item) => {
    const year = extractYear((item as any).fecha);
    if (year) {
      years.add(year);
    }
  });
  
  return Array.from(years).sort((a, b) => b - a);
}

/**
 * Calcula métricas de resumen para un año
 */
export async function getYearSummary(year: number) {
  const [cases, resolutions, complaints] = await Promise.all([
    extractCases(year),
    extractResolutions(year),
    extractComplaints(year),
  ]);

  // Calcular totales por sector
  const sectorCounts = new Map<string, number>();
  cases.forEach((c) => {
    sectorCounts.set(c.sector, (sectorCounts.get(c.sector) || 0) + 1);
  });

  // Calcular totales por departamento
  const departmentCounts = new Map<string, number>();
  complaints.forEach((c) => {
    departmentCounts.set(c.departamento, (departmentCounts.get(c.departamento) || 0) + 1);
  });

  // Calcular montos totales
  const totalMonto = cases.reduce((sum, c) => {
    const monto = parseFloat(c.monto?.replace(/[^\d.-]/g, '') || '0');
    return sum + (isNaN(monto) || monto === -999 ? 0 : monto);
  }, 0);

  return {
    totalCases: cases.length,
    totalResolutions: resolutions.length,
    totalComplaints: complaints.length,
    totalFines: totalMonto,
    bySector: Object.fromEntries(sectorCounts),
    byDepartment: Object.fromEntries(departmentCounts),
    cases,
    resolutions,
    complaints,
  };
}

/**
 * Formatea un número como moneda
 */
export function formatCurrency(value: number | string): string {
  const cleaned = typeof value === 'string' ? value.replace(/[^\d.-]/g, '') : value;
  const num = typeof cleaned === 'string' ? parseFloat(cleaned) : cleaned;
  
  if (value === '' || value === null || value === undefined || isNaN(num) || num === -999) return 'No consignado';
  
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(num);
}

/**
 * Formatea una fecha
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateString;
  }
}

/**
 * Clea el caché de datos
 */
export function clearDataCache(): void {
  dataCache.clear();
}
