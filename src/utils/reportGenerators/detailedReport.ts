/**
 * Generador de Reporte PDF Detallado
 */

import jsPDF from 'jspdf';
import { getYearSummary, formatCurrency, formatDate } from '../reportGenerator';
import type { ReportConfiguration } from '../reportConfiguration';
import { generateConfiguredPDF } from './configuredReport';

export async function generateDetailedReportPDF(year: number, configuration?: ReportConfiguration): Promise<Blob> {
  if (configuration) return generateConfiguredPDF(configuration);
  const summary = await getYearSummary(year);
  
  const doc = new jsPDF();
  
  // Configuración base
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  
  // Página 1: Portada
  doc.setFontSize(24);
  doc.setFont(undefined, 'bold');
  doc.text('Reporte Detallado', margin, pageHeight / 2 - 30);
  doc.text('Casos de Cumplimiento Ambiental', margin, pageHeight / 2);
  
  doc.setFontSize(14);
  doc.setFont(undefined, 'normal');
  doc.text(`Año: ${year}`, margin, pageHeight / 2 + 30);
  doc.text(`Fecha de Generación: ${new Date().toLocaleDateString('es-PE')}`, margin, pageHeight / 2 + 40);
  
  // Página 2: Contenido
  doc.addPage();
  let yPosition = margin;
  
  // Título
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Casos de Cumplimiento Ambiental', margin, yPosition);
  
  yPosition += 15;
  
  // Resumen introductorio
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const introText = `Este reporte contiene un análisis detallado de ${summary.totalCases} casos resueltos durante el año ${year}. Se incluyen datos sobre sectores afectados, departamentos involucrados, montos de multas y estado de resolución de los expedientes.`;
  const splitText = doc.splitTextToSize(introText, contentWidth);
  doc.text(splitText, margin, yPosition);
  
  yPosition += splitText.length * 5 + 10;
  
  // Tabla de casos
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Detalle de Casos', margin, yPosition);
  
  yPosition += 10;
  
  // Encabezados de tabla
  doc.setFont(undefined, 'bold');
  doc.setFontSize(9);
  doc.setFillColor(31, 108, 189);
  doc.setTextColor(255, 255, 255);
  
  const tableY = yPosition;
  const colWidths = [20, 28, 25, 35, 30, 25];
  const cols = ['Código', 'Sector', 'Dpto.', 'Descripción', 'Monto', 'Estado'];
  
  let xCol = margin;
  cols.forEach((col, i) => {
    const x = xCol;
    const maxWidth = colWidths[i];
    const textLines = doc.splitTextToSize(col, maxWidth - 2);
    doc.text(textLines, x, tableY + 7);
    xCol += maxWidth;
  });
  
  // Línea separadora
  doc.setDrawColor(31, 108, 189);
  doc.line(margin, tableY + 10, margin + contentWidth, tableY + 10);
  
  // Datos de tabla
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  
  let tableRowY = tableY + 13;
  const rowHeight = 8;
  
  summary.cases.forEach((caseItem, index) => {
    // Verificar si necesitamos nueva página
    if (tableRowY > pageHeight - margin - 10) {
      doc.addPage();
      tableRowY = margin;
    }
    
    // Dibujar fila alternada
    if (index % 2 === 1) {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, tableRowY - rowHeight + 2, contentWidth, rowHeight, 'F');
    }
    
    xCol = margin + 1;
    
    // Código
    doc.text(caseItem.codigo.substring(0, 12), xCol, tableRowY);
    xCol += colWidths[0];
    
    // Sector (truncar si es necesario)
    const sectorText = caseItem.sector.substring(0, 15);
    doc.text(sectorText, xCol, tableRowY);
    xCol += colWidths[1];
    
    // Departamento (truncar)
    const deptText = caseItem.departamento.substring(0, 12);
    doc.text(deptText, xCol, tableRowY);
    xCol += colWidths[2];
    
    // Descripción (truncar)
    const descText = (caseItem.descripcion || '-').substring(0, 20);
    doc.text(descText, xCol, tableRowY);
    xCol += colWidths[3];
    
    // Monto
    doc.setTextColor(31, 108, 189);
    doc.text(formatCurrency(caseItem.monto ?? ''), xCol, tableRowY);
    doc.setTextColor(0, 0, 0);
    xCol += colWidths[4];
    
    // Estado
    doc.text(caseItem.estado, xCol, tableRowY);
    
    tableRowY += rowHeight;
  });
  
  // Nueva página: Análisis por Sector
  if (Object.keys(summary.bySector).length > 0) {
    doc.addPage();
    yPosition = margin;
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Análisis por Sector', margin, yPosition);
    
    yPosition += 15;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    Object.entries(summary.bySector).forEach(([sector, count]) => {
      const percent = ((count as number) / summary.totalCases * 100).toFixed(1);
      const text = `${sector}: ${count} casos (${percent}% del total)`;
      doc.text(text, margin + 5, yPosition);
      yPosition += 8;
      
      if (yPosition > pageHeight - margin - 10) {
        doc.addPage();
        yPosition = margin;
      }
    });
  }
  
  // Nueva página: Análisis por Departamento
  if (Object.keys(summary.byDepartment).length > 0) {
    doc.addPage();
    yPosition = margin;
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Análisis por Departamento', margin, yPosition);
    
    yPosition += 15;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    Object.entries(summary.byDepartment).forEach(([dept, count]) => {
      const percent = ((count as number) / summary.totalComplaints * 100).toFixed(1);
      const text = `${dept}: ${count} registros (${percent}% del total)`;
      doc.text(text, margin + 5, yPosition);
      yPosition += 8;
      
      if (yPosition > pageHeight - margin - 10) {
        doc.addPage();
        yPosition = margin;
      }
    });
  }
  
  // Pie de página en todas las páginas
  const pageCount = (doc as any).internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    (doc as any).setPage(i);
    doc.setFontSize(6);
    doc.setTextColor(128, 128, 128);
    doc.text(
      doc.splitTextToSize('Nota: los escenarios de IA y Supply Chain son simulados, conceptuales o demostrativos; no representan resultados reales.', contentWidth - 40),
      margin,
      pageHeight - 18,
    );
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    
    const timestamp = new Date().toLocaleTimeString('es-PE');
    doc.text(`Generado: ${timestamp}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin - 20, pageHeight - 10, { align: 'right' });
  }
  
  return doc.output('blob');
}
