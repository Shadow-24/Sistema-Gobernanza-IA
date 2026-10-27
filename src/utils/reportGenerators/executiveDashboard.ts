/**
 * Generador de Dashboard Ejecutivo PDF
 */

import jsPDF from 'jspdf';
import { getYearSummary, formatCurrency, formatDate } from '../reportGenerator';
import type { ReportConfiguration } from '../reportConfiguration';
import { generateConfiguredPDF, generateConfiguredDashboardPreview } from './configuredReport';

export async function generateExecutiveDashboardPDF(year: number, configuration?: ReportConfiguration): Promise<Blob> {
  if (configuration) return generateConfiguredPDF(configuration);
  const summary = await getYearSummary(year);
  
  const doc = new jsPDF();
  
  // Configuración base
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  
  let yPosition = margin;
  
  // Título
  doc.setFontSize(24);
  doc.setFont(undefined, 'bold');
  doc.text('Dashboard Ejecutivo de Reportes', margin, yPosition);
  
  yPosition += 15;
  
  // Subtítulo con año
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text(`Año: ${year}`, margin, yPosition);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-PE')}`, margin + contentWidth - 60, yPosition);
  
  yPosition += 15;
  
  // Línea separadora
  doc.setDrawColor(200);
  doc.line(margin, yPosition, margin + contentWidth, yPosition);
  
  yPosition += 10;
  
  // Sección de KPIs
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('Indicadores Clave de Desempeño (KPIs)', margin, yPosition);
  
  yPosition += 12;
  
  // KPI Cards
  const kpiData = [
    { label: 'Total de Casos', value: summary.totalCases.toString() },
    { label: 'Total de Resoluciones', value: summary.totalResolutions.toString() },
    { label: 'Total de Quejas SINADA', value: summary.totalComplaints.toString() },
    { label: 'Monto Total de Multas', value: formatCurrency(summary.totalFines) },
  ];
  
  const kpiWidth = (contentWidth - 10) / 2;
  const kpiHeight = 25;
  
  kpiData.forEach((kpi, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    
    const xPos = margin + col * (kpiWidth + 5);
    const currentY = yPosition + row * (kpiHeight + 5);
    
    // Fondo del KPI
    doc.setFillColor(240, 240, 240);
    doc.rect(xPos, currentY, kpiWidth, kpiHeight, 'F');
    
    // Borde
    doc.setDrawColor(100, 150, 200);
    doc.rect(xPos, currentY, kpiWidth, kpiHeight, 'S');
    
    // Texto
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(kpi.label, xPos + 5, currentY + 8);
    
    doc.setFont(undefined, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(31, 108, 189);
    doc.text(kpi.value, xPos + 5, currentY + 18);
    
    doc.setTextColor(0, 0, 0);
  });
  
  yPosition += 60;
  
  // Sección por Sector
  if (Object.keys(summary.bySector).length > 0) {
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Distribución de Casos por Sector', margin, yPosition);
    
    yPosition += 10;
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    
    let sectorY = yPosition;
    Object.entries(summary.bySector).forEach(([sector, count]) => {
      const percent = ((count as number) / summary.totalCases * 100).toFixed(1);
      doc.text(`• ${sector}: ${count} casos (${percent}%)`, margin + 5, sectorY);
      sectorY += 8;
      
      // Verificar si necesitamos nueva página
      if (sectorY > pageHeight - margin - 10) {
        doc.addPage();
        sectorY = margin;
      }
    });
    
    yPosition = sectorY + 5;
  }
  
  // Salto de página si es necesario
  if (yPosition > pageHeight - 50) {
    doc.addPage();
    yPosition = margin;
  }
  
  // Tabla de casos principales
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Principales Casos Resueltos', margin, yPosition);
  
  yPosition += 10;
  
  // Encabezados de tabla
  doc.setFont(undefined, 'bold');
  doc.setFontSize(9);
  doc.setFillColor(31, 108, 189);
  doc.setTextColor(255, 255, 255);
  
  const tableY = yPosition;
  const colWidths = [25, 30, 25, 35, 25];
  const cols = ['ID', 'Sector', 'Departamento', 'Monto', 'Estado'];
  
  let xCol = margin;
  cols.forEach((col, i) => {
    doc.text(col, xCol, tableY + 7);
    xCol += colWidths[i];
  });
  
  // Línea separadora
  doc.setDrawColor(31, 108, 189);
  doc.line(margin, tableY + 10, margin + contentWidth, tableY + 10);
  
  // Datos de tabla
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  
  let tableRowY = tableY + 12;
  const maxRows = 10;
  
  summary.cases.slice(0, maxRows).forEach((caseItem) => {
    if (tableRowY > pageHeight - margin - 10) {
      doc.addPage();
      tableRowY = margin;
    }
    
    xCol = margin;
    doc.text(caseItem.id, xCol, tableRowY);
    xCol += colWidths[0];
    
    doc.text(caseItem.sector, xCol, tableRowY);
    xCol += colWidths[1];
    
    doc.text(caseItem.departamento, xCol, tableRowY);
    xCol += colWidths[2];
    
    doc.text(formatCurrency(caseItem.monto ?? ''), xCol, tableRowY);
    xCol += colWidths[3];
    
    doc.text(caseItem.estado, xCol, tableRowY);
    
    tableRowY += 7;
    
    // Línea alternada para legibilidad
    if ((summary.cases.indexOf(caseItem) + 1) % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, tableRowY - 7, contentWidth, 7, 'F');
    }
  });
  
  // Pie de página
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
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }
  
  return doc.output('blob');
}

/**
 * Genera preview del dashboard como HTML para visualización en navegador
 */
export async function generateDashboardPreview(year: number, configuration?: ReportConfiguration): Promise<string> {
  if (configuration) return generateConfiguredDashboardPreview(configuration);
  const summary = await getYearSummary(year);
  
  const sectorsList = Object.entries(summary.bySector)
    .map(([sector, count]) => {
      const percent = ((count as number) / summary.totalCases * 100).toFixed(1);
      return `<li>${sector}: ${count} casos (${percent}%)</li>`;
    })
    .join('');
  
  const casesList = summary.cases
    .slice(0, 10)
    .map((c) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.id}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.sector}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.departamento}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatCurrency(c.monto ?? '')}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${c.estado}</td>
      </tr>
    `)
    .join('');
  
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dashboard Ejecutivo - ${year}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { color: #1f6cbd; margin-bottom: 10px; font-size: 28px; }
        .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
        hr { border: none; border-top: 2px solid #e0e0e0; margin: 20px 0; }
        .kpi-section { margin-bottom: 30px; }
        .kpi-section h2 { font-size: 18px; color: #333; margin-bottom: 15px; font-weight: 600; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
        .kpi-card { background: linear-gradient(135deg, #1f6cbd 0%, #135a9e 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .kpi-card-label { font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px; }
        .kpi-card-value { font-size: 28px; font-weight: bold; margin-top: 8px; }
        .sectors-section { margin-bottom: 30px; }
        .sectors-section h2 { font-size: 18px; color: #333; margin-bottom: 15px; font-weight: 600; }
        .sectors-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
        .sector-item { background: #f9f9f9; padding: 12px; border-left: 4px solid #1f6cbd; }
        .sector-item strong { color: #1f6cbd; }
        .table-section { margin-bottom: 30px; }
        .table-section h2 { font-size: 18px; color: #333; margin-bottom: 15px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; }
        thead { background: #1f6cbd; color: white; }
        th { padding: 12px; text-align: left; font-weight: 600; font-size: 13px; }
        td { padding: 12px; }
        tbody tr:nth-child(even) { background: #f9f9f9; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📊 Dashboard Ejecutivo de Reportes</h1>
        <div class="meta">
          <p><strong>Año:</strong> ${year} | <strong>Generado:</strong> ${new Date().toLocaleDateString('es-PE')}</p>
        </div>
        <hr>
        
        <div class="kpi-section">
          <h2>Indicadores Clave de Desempeño (KPIs)</h2>
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-card-label">Total de Casos</div>
              <div class="kpi-card-value">${summary.totalCases}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-card-label">Total de Resoluciones</div>
              <div class="kpi-card-value">${summary.totalResolutions}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-card-label">Total de Quejas SINADA</div>
              <div class="kpi-card-value">${summary.totalComplaints}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-card-label">Monto Total de Multas</div>
              <div class="kpi-card-value">${formatCurrency(summary.totalFines)}</div>
            </div>
          </div>
        </div>
        
        ${Object.keys(summary.bySector).length > 0 ? `
        <div class="sectors-section">
          <h2>Distribución de Casos por Sector</h2>
          <div class="sectors-list">
            ${sectorsList}
          </div>
        </div>
        ` : ''}
        
        <div class="table-section">
          <h2>Principales Casos Resueltos</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Sector</th>
                <th>Departamento</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${casesList}
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>
  `;
}
