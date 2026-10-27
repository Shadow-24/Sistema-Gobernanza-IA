/**
 * CSV Data Loader - Importa y carga los archivos CSV
 */

import { parseCSV, CSVRow } from './csvParser';

/**
 * Carga contenido de un archivo CSV
 */
export async function loadCSVContent(filename: string): Promise<string> {
  try {
    // Intentar cargar desde /imports/ en producción (archivos en public/imports/)
    const response = await fetch(`/imports/${filename}`);
    
    if (response.ok) {
      return await response.text();
    }
    
    // Si no está disponible, retornar string vacío
    console.warn(`CSV file not found: ${filename}`);
    return '';
  } catch (error) {
    console.error(`Error loading CSV ${filename}:`, error);
    return '';
  }
}

/**
 * Carga y parsea un CSV desde filename
 */
export async function loadCSVFromFilename(filename: string): Promise<CSVRow[]> {
  const content = await loadCSVContent(filename);
  if (!content) {
    return [];
  }
  return parseCSV(content);
}
