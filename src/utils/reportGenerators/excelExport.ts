/**
 * Generador de Exportación Excel
 */

import * as XLSX from 'xlsx';
import { getYearSummary, extractComplaints, extractFacilities, formatCurrency, formatDate } from '../reportGenerator';
import type { ReportConfiguration } from '../reportConfiguration';
import { buildConfiguredReportSections, getReportSectionMetadata } from './configuredReport';

export async function generateExcelExport(year: number, configuration?: ReportConfiguration): Promise<Blob> {
  if (configuration) return generateConfiguredExcelExport(configuration);
  const summary = await getYearSummary(year);
  const complaints = await extractComplaints(year);
  const facilities = await extractFacilities();
  
  // Crear workbook
  const wb = XLSX.utils.book_new();
  
  // Hoja 1: Casos
  const casesData = summary.cases.map((c) => ({
    'ID': c.id,
    'Código': c.codigo,
    'Fecha': formatDate(c.fecha),
    'Sector': c.sector,
    'Departamento': c.departamento,
    'Monto (PEN)': formatCurrency(c.monto ?? ''),
    'Estado': c.estado,
    'Descripción': c.descripcion || '-',
  }));
  
  const wseCases = XLSX.utils.json_to_sheet(casesData);
  // Establecer ancho de columnas
  wseCases['!cols'] = [
    { wch: 10 },
    { wch: 15 },
    { wch: 12 },
    { wch: 20 },
    { wch: 18 },
    { wch: 15 },
    { wch: 12 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wseCases, 'Casos');
  
  // Hoja 2: Quejas SINADA
  const complaintsData = complaints.map((c) => ({
    'ID': c.id,
    'Código': c.codigo,
    'Fecha': formatDate(c.fecha),
    'Departamento': c.departamento,
    'Tipo de Impacto': c.tipoImpacto,
    'Estado': c.estado,
    'Descripción': c.descripcion || '-',
  }));
  
  const wsComplaints = XLSX.utils.json_to_sheet(complaintsData);
  wsComplaints['!cols'] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsComplaints, 'Quejas SINADA');
  
  // Hoja 3: Instalaciones
  const facilitiesData = facilities.map((f) => ({
    'ID': f.id,
    'Nombre': f.nombre,
    'Departamento': f.departamento,
    'Sector': f.sector,
    'Ubicación': f.ubicacion || '-',
    'Capacidad': f.capacidad || '-',
  }));
  
  const wsFacilities = XLSX.utils.json_to_sheet(facilitiesData);
  wsFacilities['!cols'] = [
    { wch: 10 },
    { wch: 30 },
    { wch: 18 },
    { wch: 15 },
    { wch: 30 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsFacilities, 'Instalaciones');
  
  // Hoja 4: Resoluciones
  const resolutionsData = summary.resolutions.map((r) => ({
    'ID': r.id,
    'Fecha': formatDate(r.fecha),
    'Tipo': r.tipo,
    'Sector': r.sector,
    'Departamento': r.departamento,
    'Estado': r.estado,
    'Descripción': r.descripcion || '-',
  }));
  
  const wsResolutions = XLSX.utils.json_to_sheet(resolutionsData);
  wsResolutions['!cols'] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsResolutions, 'Resoluciones');
  
  // Hoja 5: Resumen Ejecutivo
  const summaryData = [
    { Métrica: 'Total de Casos', Valor: summary.totalCases },
    { Métrica: 'Total de Resoluciones', Valor: summary.totalResolutions },
    { Métrica: 'Total de Quejas SINADA', Valor: summary.totalComplaints },
    { Métrica: 'Monto Total de Multas', Valor: formatCurrency(summary.totalFines) },
    { Métrica: 'Año del Reporte', Valor: year.toString() },
    { Métrica: 'Fecha de Generación', Valor: new Date().toLocaleDateString('es-PE') },
    { Métrica: 'Nota sobre escenarios', Valor: 'IA y Supply Chain: simulados, conceptuales o demostrativos; no son resultados reales.' },
  ];
  
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');
  
  // Hoja 6: Pivot - Casos por Sector
  if (Object.keys(summary.bySector).length > 0) {
    const pivotSector = Object.entries(summary.bySector).map(([sector, count]) => ({
      'Sector': sector,
      'Cantidad de Casos': count,
      'Porcentaje': `${((count as number) / summary.totalCases * 100).toFixed(2)}%`,
    }));
    
    const wsPivotSector = XLSX.utils.json_to_sheet(pivotSector);
    wsPivotSector['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsPivotSector, 'Pivot - Sector');
  }
  
  // Hoja 7: Pivot - Quejas por Departamento
  if (Object.keys(summary.byDepartment).length > 0) {
    const pivotDept = Object.entries(summary.byDepartment).map(([dept, count]) => ({
      'Departamento': dept,
      'Cantidad de Quejas': count,
      'Porcentaje': `${((count as number) / summary.totalComplaints * 100).toFixed(2)}%`,
    }));
    
    const wsPivotDept = XLSX.utils.json_to_sheet(pivotDept);
    wsPivotDept['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsPivotDept, 'Pivot - Dpto');
  }
  
  // Generar blob
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function generateConfiguredExcelExport(configuration: ReportConfiguration): Promise<Blob> {
  const workbook = XLSX.utils.book_new();
  const sections = await buildConfiguredReportSections(configuration);
  const metadata = getReportSectionMetadata(configuration);
  const maximumRows = configuration.detailLevel === 'executive' ? 4
    : configuration.detailLevel === 'detailed' ? 100
    : Number.POSITIVE_INFINITY;
  const contentRows = sections.flatMap((section) => {
    const records = section.records.slice(0, maximumRows);
    if (records.length === 0) return [{ Sección: section.title, Periodo: `${configuration.startDate} – ${configuration.endDate}`, Fuente: section.source, Registro: 'Sin registros exportables para esta selección y periodo.', Etiqueta: section.simulated ? 'Simulado / conceptual' : 'CSV histórico' }];
    return records.map((record) => ({ Sección: section.title, Periodo: `${configuration.startDate} – ${configuration.endDate}`, Fuente: section.source, Registro: record, Etiqueta: section.simulated ? 'Simulado / conceptual' : 'CSV histórico' }));
  });
  const contentSheet = XLSX.utils.json_to_sheet(contentRows);
  contentSheet['!cols'] = [{ wch: 34 }, { wch: 26 }, { wch: 58 }, { wch: 90 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, contentSheet, 'Contenido seleccionado');

  const configurationRows = [
    { Campo: 'Tipo de reporte', Valor: configuration.reportType },
    { Campo: 'Fecha inicial', Valor: configuration.startDate },
    { Campo: 'Fecha final', Valor: configuration.endDate },
    { Campo: 'Nivel de detalle', Valor: configuration.detailLevel },
    ...metadata.map((section) => ({ Campo: `Sección: ${section.label}`, Valor: section.source })),
    { Campo: 'Alcance temporal', Valor: 'Las fuentes sin fecha de registro o con datos simulados no se filtran por el periodo; se identifican en la columna Etiqueta/Fuente.' },
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(configurationRows), 'Configuración');

  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
