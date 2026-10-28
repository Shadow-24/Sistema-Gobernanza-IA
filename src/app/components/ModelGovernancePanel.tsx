import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../AuthContext";
import { loadAIGovernanceControls, loadAIGovernanceRisks, type GovernanceControl, type GovernanceRisk } from "../aiGovernanceApi";

type ModelGovernancePanelProps = {
  scope: "demanda" | "vial";
  modelName: string;
};

const statusLabel: Record<GovernanceControl["status"], string> = {
  no_evaluado: "Sin evaluar",
  en_revision: "En revisión",
  conforme: "Conforme con evidencia",
  brecha: "Brecha",
};

export function ModelGovernancePanel({ scope, modelName }: ModelGovernancePanelProps) {
  const { hasPermission } = useAuth();
  const canViewRisks = hasPermission("riesgos");
  const canViewCompliance = hasPermission("cumplimiento");
  const [controls, setControls] = useState<GovernanceControl[]>([]);
  const [risks, setRisks] = useState<GovernanceRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const riskRequest = canViewRisks ? loadAIGovernanceRisks() : Promise.resolve([] as GovernanceRisk[]);
    Promise.all([loadAIGovernanceControls(scope), riskRequest])
      .then(([loadedControls, loadedRisks]) => {
        if (!active) return;
        setControls(loadedControls);
        setRisks(loadedRisks.filter((risk) => risk.model_name.trim().toLocaleLowerCase("es-PE") === modelName.trim().toLocaleLowerCase("es-PE")));
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el contexto de gobernanza del modelo.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canViewRisks, modelName, scope]);

  const conforming = controls.filter((control) => control.status === "conforme" && control.evidence.trim()).length;
  const gaps = controls.filter((control) => control.status === "brecha").length;
  const unassessed = controls.filter((control) => control.status === "no_evaluado").length;
  const modelSpecificControls = controls.filter((control) => control.model_scope === scope);

  return (
    <section className="rounded p-3" style={{ background: "#f5f9fd", border: "1px solid #cce0f5" }} aria-label={`Gobernanza aplicada a ${modelName}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[10px] font-semibold" style={{ color: "#0f6cbd" }}>AI TRiSM · controles de este modelo</h3>
          <p className="text-[8px] mt-0.5" style={{ color: "#605e5c" }}>{modelName} · los controles se consultan desde el registro de evidencias.</p>
        </div>
        {canViewCompliance && <Link to="/cumplimiento" className="text-[8px] underline" style={{ color: "#0f6cbd" }}>Ver evidencias</Link>}
      </div>
      {loading ? <p className="mt-2 text-[8px]" style={{ color: "#605e5c" }}>Cargando controles…</p> : error ? (
        <p role="alert" className="mt-2 text-[8px]" style={{ color: "#a4262c" }}>{error}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mt-2 text-[8px]">
            <span className="rounded px-1.5 py-1" style={{ background: "#f1faf1", color: "#107c10" }}>Con evidencia conforme: {conforming}/{controls.length}</span>
            <span className="rounded px-1.5 py-1" style={{ background: "#f3f2f1", color: "#605e5c" }}>Sin evaluar: {unassessed}</span>
            <span className="rounded px-1.5 py-1" style={{ background: "#fdf3f4", color: "#a4262c" }}>Brechas: {gaps}</span>
            {canViewRisks && <span className="rounded px-1.5 py-1" style={{ background: "#fff8f0", color: "#986f0b" }}>Riesgos registrados para este modelo: {risks.length}</span>}
          </div>
          {modelSpecificControls.map((control) => (
            <div key={control.id} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 mt-2 text-[8px]" style={{ color: "#605e5c" }}>
              <span className="font-medium">{control.focus}</span>
              <span>{statusLabel[control.status]}{control.updated_by ? ` · ${control.updated_by}` : ""}</span>
            </div>
          ))}
          {risks.slice(0, 3).map((risk) => (
            <div key={risk.id} className="mt-2 rounded px-2 py-1.5 text-[8px]" style={{ background: "#fff8f0", color: "#605e5c" }}>
              <strong>{risk.category}</strong> · {risk.description} · {risk.status.replace("_", " ")}
            </div>
          ))}
          <p className="text-[8px] mt-2" style={{ color: "#8a8886" }}>
            Es una revisión humana del control y su evidencia; no es una aprobación automática de XGBoost ni una certificación.
          </p>
        </>
      )}
    </section>
  );
}
