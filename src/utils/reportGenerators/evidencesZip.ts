/**
 * Generador de ZIP - Evidencias Digitales
 */

import JSZip from 'jszip';
import jsPDF from 'jspdf';
import { getYearSummary, formatCurrency, formatDate } from '../reportGenerator';
import type { ReportConfiguration } from '../reportConfiguration';
import { buildConfiguredReportSections } from './configuredReport';

export async function generateEvidencesZip(year: number, configuration?: ReportConfiguration): Promise<Blob> {
  if (configuration) return generateConfiguredEvidencesZip(configuration);
  const summary = await getYearSummary(year);
  const zip = new JSZip();
  
  // Crear carpetas principales
  const casesFolder = zip.folder('Casos');
  const resolutionsFolder = zip.folder('Resoluciones');
  const complaintFolder = zip.folder('Quejas');
  const indexFolder = zip.folder('Indice');
  
  if (!casesFolder || !resolutionsFolder || !complaintFolder || !indexFolder) {
    throw new Error('No se pueden crear carpetas en el ZIP');
  }
  
  // Generar PDF por cada caso
  summary.cases.forEach((caseItem, index) => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Expediente de Caso', 20, 20);
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    let yPos = 35;
    
    doc.text(`ID: ${caseItem.id}`, 20, yPos);
    yPos += 10;
    doc.text(`Código: ${caseItem.codigo}`, 20, yPos);
    yPos += 10;
    doc.text(`Fecha: ${formatDate(caseItem.fecha)}`, 20, yPos);
    yPos += 10;
    doc.text(`Sector: ${caseItem.sector}`, 20, yPos);
    yPos += 10;
    doc.text(`Departamento: ${caseItem.departamento}`, 20, yPos);
    yPos += 10;
    doc.text(`Monto: ${formatCurrency(caseItem.monto ?? '')}`, 20, yPos);
    yPos += 10;
    doc.text(`Estado: ${caseItem.estado}`, 20, yPos);
    
    yPos += 15;
    doc.setFont(undefined, 'bold');
    doc.text('Descripción:', 20, yPos);
    
    yPos += 8;
    doc.setFont(undefined, 'normal');
    const descLines = doc.splitTextToSize(caseItem.descripcion || 'Sin descripción', 170);
    doc.text(descLines, 20, yPos);
    
    yPos += descLines.length * 5 + 10;
    
    doc.setFont(undefined, 'bold');
    doc.text('Resolución:', 20, yPos);
    
    yPos += 8;
    doc.setFont(undefined, 'normal');
    const resLines = doc.splitTextToSize(caseItem.resolucion || 'En proceso', 170);
    doc.text(resLines, 20, yPos);
    
    // Pie de página
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Documento generado: ${new Date().toLocaleDateString('es-PE')}`,
      20,
      280
    );
    
    const pdfBlob = doc.output('blob');
    const filename = `${caseItem.codigo || `CASO_${index + 1}`}.pdf`;
    casesFolder.file(filename, pdfBlob);
  });
  
  // Generar PDF por cada resolución
  summary.resolutions.forEach((resolution, index) => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Resolución Directoral', 20, 20);
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    let yPos = 35;
    
    doc.text(`ID: ${resolution.id}`, 20, yPos);
    yPos += 10;
    doc.text(`Fecha: ${formatDate(resolution.fecha)}`, 20, yPos);
    yPos += 10;
    doc.text(`Tipo: ${resolution.tipo}`, 20, yPos);
    yPos += 10;
    doc.text(`Sector: ${resolution.sector}`, 20, yPos);
    yPos += 10;
    doc.text(`Departamento: ${resolution.departamento}`, 20, yPos);
    yPos += 10;
    yPos += 10;
    doc.text(`Estado: ${resolution.estado}`, 20, yPos);
    
    yPos += 15;
    doc.setFont(undefined, 'bold');
    doc.text('Contenido:', 20, yPos);
    
    yPos += 8;
    doc.setFont(undefined, 'normal');
    const contentLines = doc.splitTextToSize(
      resolution.descripcion || 'Resolución directoral de conformidad',
      170
    );
    doc.text(contentLines, 20, yPos);
    
    // Pie de página
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Documento generado: ${new Date().toLocaleDateString('es-PE')}`,
      20,
      280
    );
    
    const pdfBlob = doc.output('blob');
    const filename = `RES-${resolution.id}.pdf`;
    resolutionsFolder.file(filename, pdfBlob);
  });
  
  // Generar PDF por cada queja
  summary.complaints.forEach((complaint, index) => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Registro de Queja - SINADA', 20, 20);
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    let yPos = 35;
    
    doc.text(`ID: ${complaint.id}`, 20, yPos);
    yPos += 10;
    doc.text(`Código: ${complaint.codigo}`, 20, yPos);
    yPos += 10;
    doc.text(`Fecha: ${formatDate(complaint.fecha)}`, 20, yPos);
    yPos += 10;
    doc.text(`Departamento: ${complaint.departamento}`, 20, yPos);
    yPos += 10;
    doc.text(`Tipo de Impacto: ${complaint.tipoImpacto}`, 20, yPos);
    yPos += 10;
    doc.text(`Estado: ${complaint.estado}`, 20, yPos);
    
    yPos += 15;
    doc.setFont(undefined, 'bold');
    doc.text('Descripción de la Queja:', 20, yPos);
    
    yPos += 8;
    doc.setFont(undefined, 'normal');
    const descLines = doc.splitTextToSize(complaint.descripcion || 'Sin descripción', 170);
    doc.text(descLines, 20, yPos);
    
    // Pie de página
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Documento generado: ${new Date().toLocaleDateString('es-PE')}`,
      20,
      280
    );
    
    const pdfBlob = doc.output('blob');
    const filename = `${complaint.codigo || `QUEJA_${index + 1}`}.pdf`;
    complaintFolder.file(filename, pdfBlob);
  });
  
  // Crear archivo de índice
  const indexContent = `# Índice de Evidencias Digitales - Año ${year}

## Contenido del Archivo

### Carpeta: Casos/
Contiene ${summary.cases.length} expedientes de casos en formato PDF.
Cada archivo contiene:
- Código de caso
- Fecha del expediente
- Sector involucrado
- Departamento
- Monto de multa
- Estado del caso
- Descripción detallada

### Carpeta: Resoluciones/
Contiene ${summary.resolutions.length} resoluciones directorales en formato PDF.
Cada archivo contiene:
- Fecha de resolución
- Tipo de resolución
- Sector
- Departamento
- Monto
- Contenido de la resolución

### Carpeta: Quejas/
Contiene ${summary.complaints.length} registros de quejas SINADA en formato PDF.
Cada archivo contiene:
- Código de queja
- Fecha de registro
- Departamento
- Tipo de impacto ambiental
- Estado
- Descripción de la queja

## Resumen General

- **Total de Casos:** ${summary.totalCases}
- **Total de Resoluciones:** ${summary.totalResolutions}
- **Total de Quejas:** ${summary.totalComplaints}
- **Monto Total de Multas:** ${formatCurrency(summary.totalFines)}
- **Año del Reporte:** ${year}
- **Fecha de Generación:** ${new Date().toLocaleDateString('es-PE')}
- **Hora:** ${new Date().toLocaleTimeString('es-PE')}

## Notas Importantes

1. Todos los documentos están en formato PDF y requieren un lector PDF para visualizarlos.
2. Los archivos están organizados por tipo de documento para facilitar la búsqueda.
3. Cada documento contiene la información completa del registro correspondiente.
4. Este archivo de índice (README.md) proporciona una visión general del contenido.
5. Los escenarios de IA y Supply Chain son simulados, conceptuales o demostrativos; no representan resultados reales.

---
Generado automáticamente por el Sistema de Reportes
`;
  
  indexFolder.file('README.md', indexContent);
  
  // Generar blob del ZIP
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

async function generateConfiguredEvidencesZip(configuration: ReportConfiguration): Promise<Blob> {
  const zip = new JSZip();
  const sections = await buildConfiguredReportSections(configuration);
  const indexLines = [
    '# Evidencias Digitales configuradas',
    `Periodo: ${configuration.startDate} – ${configuration.endDate}`,
    `Nivel de detalle: ${configuration.detailLevel}`,
    '',
    'Solo se procesaron las categorías seleccionadas. Los artefactos conceptuales se identifican como simulados.',
    '',
  ];

  for (const section of sections) {
    indexLines.push(`## ${section.title}`, `Fuente: ${section.source || 'CSV históricos'}`);
    if (section.simulated) indexLines.push('Etiqueta: Simulado / evaluación conceptual');
    if (section.records.length === 0) {
      indexLines.push('Sin evidencia exportable disponible para esta categoría.');
      indexLines.push('');
      continue;
    }

    const records = configuration.detailLevel === 'executive' ? section.records.slice(0, 1)
      : configuration.detailLevel === 'detailed' ? section.records.slice(0, 100)
      : section.records;
    const folderName = section.id === 'resolution-evidence' ? 'Resoluciones'
      : section.id === 'case-evidence' ? 'Expedientes'
      : section.id === 'complaint-evidence' ? 'Denuncias_SINADA'
      : section.id === 'risk-evidence' ? 'Riesgos_simulados'
      : 'Trazabilidad_simulada';
    records.forEach((record, index) => {
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(section.title, 18, 20);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      const tag = section.simulated ? 'SIMULADO · EVALUACIÓN CONCEPTUAL' : 'FUENTE CSV HISTÓRICA';
      doc.text(tag, 18, 29);
      doc.text(`Periodo solicitado: ${configuration.startDate} – ${configuration.endDate}`, 18, 37);
      const lines = doc.splitTextToSize(record, 174);
      doc.text(lines, 18, 50);
      const fileName = `${folderName}/${section.id}-${String(index + 1).padStart(3, '0')}.pdf`;
      zip.file(fileName, doc.output('blob'));
      indexLines.push(`- ${fileName}`);
    });
    indexLines.push('');
  }

  zip.file('Indice/README.md', indexLines.join('\n'));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
