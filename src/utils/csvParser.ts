/**
 * CSV Parser - Herramientas para parsear archivos CSV
 */

export interface CSVRow {
  [key: string]: string;
}

/**
 * Parsea contenido CSV en formato string y retorna array de objetos
 * @param csvContent - Contenido del archivo CSV como string
 * @param delimiter - Delimitador de columnas (default: ',')
 * @returns Array de objetos con las filas del CSV
 */
export function parseCSV(csvContent: string, delimiter: string = ','): CSVRow[] {
  const lines = csvContent.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  
  if (lines.length === 0) {
    return [];
  }

  const detectedDelimiter = delimiter === "," ? detectDelimiter(csvContent) : delimiter;
  const headerSearchLimit = Math.min(lines.length, 20);
  let headerIndex = 0;
  let headerValues: string[] = [];

  for (let index = 0; index < headerSearchLimit; index++) {
    const values = parseCSVLine(lines[index], detectedDelimiter);
    const populatedValues = values.filter((value) => value.trim() !== "").length;
    if (populatedValues > headerValues.filter((value) => value.trim() !== "").length) {
      headerIndex = index;
      headerValues = values;
    }
  }

  const headers = headerValues.map((header) => header.trim().replace(/^"|"$/g, ""));
  
  // Procesar datos
  const rows: CSVRow[] = [];
  
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], detectedDelimiter);
    const row: CSVRow = {};
    
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || '';
    });
    
    rows.push(row);
  }
  
  return rows;
}

/**
 * Parsea una línea individual de CSV respetando comillas
 * @param line - Línea a parsear
 * @param delimiter - Delimitador
 * @returns Array de valores
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Comilla escapada ""
        current += '"';
        i++;
      } else {
        // Alternar estado de comillas
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

/**
 * Carga y parsea un archivo CSV desde una URL o ruta
 * @param filePath - Ruta del archivo CSV
 * @returns Promesa que resuelve en array de objetos CSV
 */
export async function loadAndParseCSV(filePath: string): Promise<CSVRow[]> {
  try {
    const response = await fetch(filePath);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error(`Error loading CSV from ${filePath}:`, error);
    return [];
  }
}

/**
 * Detecta automáticamente el delimitador de un archivo CSV
 * @param csvContent - Contenido del CSV
 * @returns Delimitador detectado
 */
export function detectDelimiter(csvContent: string): string {
  const firstLine = csvContent.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  
  if (firstLine.includes('\t')) return '\t';
  if (firstLine.includes(';')) return ';';
  if (firstLine.includes(',')) return ',';
  if (firstLine.includes('|')) return '|';
  
  return ','; // default
}
