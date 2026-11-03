import jsPDF from "jspdf";
import type { GovernanceControl, GovernanceControlStatus } from "../../app/aiGovernanceApi";

const STATUS_LABELS: Record<GovernanceControlStatus, string> = {
  no_evaluado: "Sin evaluar",
  en_revision: "En revisión",
  conforme: "Conforme",
  brecha: "Brecha",
};

const SCOPE_LABELS = { ambos: "Demanda y vial", demanda: "Demanda", vial: "Vial" } as const;

export function generateGovernanceControlsReport(controls: GovernanceControl[], generatedBy: string): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 15;
  const width = 180;
  let y = 18;

  const ensureSpace = (height: number) => {
    if (y + height > 282) {
      doc.addPage();
      y = 18;
    }
  };
  const write = (text: string, size: number, bold = false, color: [number, number, number] = [32, 31, 30]) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, width) as string[];
    ensureSpace(lines.length * (size * 0.45) + 1);
    doc.text(lines, left, y);
    y += lines.length * (size * 0.45) + 1.5;
  };

  write("Reporte de controles de gobernanza de IA", 16, true);
  write(`Generado por ${generatedBy} · ${new Date().toLocaleString("es-PE")}`, 9, false, [96, 94, 92]);
  y += 2;

  const count = (status: GovernanceControlStatus) => controls.filter((control) => control.status === status).length;
  write(
    `Resumen: ${controls.length} controles · ${count("conforme")} conformes · ${count("en_revision")} en revisión · ${count("brecha")} con brecha · ${count("no_evaluado")} sin evaluar.`,
    10,
    true,
  );
  y += 2;

  const standards = [...new Set(controls.map((control) => control.standard))];
  for (const standard of standards) {
    ensureSpace(14);
    write(standard, 12, true, [15, 108, 189]);
    for (const control of controls.filter((item) => item.standard === standard)) {
      write(`${control.focus} · ${SCOPE_LABELS[control.model_scope]} · ${STATUS_LABELS[control.status]}`, 10, true);
      write(control.objective, 9, false, [96, 94, 92]);
      write(`Evidencia: ${control.evidence || "Pendiente"}`, 9);
      write(
        control.updated_by
          ? `Último registro: ${control.updated_by} · ${new Date(control.updated_at).toLocaleString("es-PE")}`
          : "Último registro: sin evaluar",
        8,
        false,
        [138, 136, 134],
      );
      y += 2;
    }
  }

  write(
    "Autoevaluación del supervisor sustentada por la evidencia descrita. Las referencias ISO son una matriz temática, no certificación ni auditoría independiente.",
    8,
    false,
    [138, 136, 134],
  );
  return doc.output("blob");
}
