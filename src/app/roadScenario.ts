import type { RoadImpactInput, RoadImpactModel } from "./riskAssessmentsApi";

export type RoadScenario = {
  phenomenonClass: string;
  phenomenon: string;
  event: string;
  department: string;
  province: string;
  roadCode: string;
  roadSection: string;
};

export type RoadField = keyof RoadScenario;

export const EMPTY_ROAD_SCENARIO: RoadScenario = {
  phenomenonClass: "",
  phenomenon: "",
  event: "",
  department: "",
  province: "",
  roadCode: "",
  roadSection: "",
};

/** Cada cadena va de lo general a lo específico; el valor de un campo restringe a los siguientes. */
const GEOGRAPHY_CHAIN: readonly RoadField[] = ["department", "province", "roadCode", "roadSection"];
const PHENOMENON_CHAIN: readonly RoadField[] = ["phenomenonClass", "phenomenon", "event"];

type Chain = { fields: readonly RoadField[]; rows: string[][] };

function chainFor(field: RoadField, model: RoadImpactModel | null): Chain | null {
  if (GEOGRAPHY_CHAIN.includes(field) && model?.locations?.length) {
    return { fields: GEOGRAPHY_CHAIN, rows: model.locations };
  }
  if (PHENOMENON_CHAIN.includes(field) && model?.phenomena?.length) {
    return { fields: PHENOMENON_CHAIN, rows: model.phenomena };
  }
  return null;
}

function distinct(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, "es"));
}

/**
 * Opciones válidas de un campo: solo los valores que existen junto a lo ya elegido en los campos
 * superiores de su cadena (p. ej. las provincias del departamento seleccionado).
 */
export function roadOptions(field: RoadField, scenario: RoadScenario, model: RoadImpactModel | null): string[] {
  const chain = chainFor(field, model);
  if (!chain) {
    const category = ROAD_CATEGORY_BY_FIELD[field];
    return model?.categories?.[category] ?? [];
  }
  const position = chain.fields.indexOf(field);
  const rows = chain.rows.filter((row) => chain.fields.slice(0, position).every((parent, index) => (
    !scenario[parent] || row[index] === scenario[parent]
  )));
  return distinct(rows.map((row) => row[position]));
}

/**
 * Aplica un cambio y mantiene la coherencia de la cadena: descarta los valores que dejan de ser
 * compatibles y autocompleta los campos que quedan determinados de forma única.
 */
export function applyRoadChange(
  scenario: RoadScenario,
  field: RoadField,
  value: string,
  model: RoadImpactModel | null,
): RoadScenario {
  const next = { ...scenario, [field]: value };
  const chain = chainFor(field, model);
  if (!chain || !value) return next;
  return completeChain(next, chain, field);
}

function completeChain(scenario: RoadScenario, chain: Chain, anchor: RoadField): RoadScenario {
  const result = { ...scenario };
  const anchorIndex = chain.fields.indexOf(anchor);
  let rows = chain.rows.filter((row) => row[anchorIndex] === result[anchor]);
  chain.fields.forEach((field, index) => {
    if (field === anchor || !result[field]) return;
    const compatible = rows.filter((row) => row[index] === result[field]);
    if (compatible.length) rows = compatible;
    else result[field] = "";
  });
  chain.fields.forEach((field, index) => {
    if (result[field]) return;
    const values = distinct(rows.map((row) => row[index]));
    if (values.length === 1) result[field] = values[0];
  });
  return result;
}

const ROAD_CATEGORY_BY_FIELD: Record<RoadField, string> = {
  phenomenonClass: "CLASE_FENOMENO",
  phenomenon: "FENOMENO",
  event: "EVENTO",
  department: "DEPARTEMENTO",
  province: "PROVINCIA",
  roadCode: "RED_AFECTADA",
  roadSection: "TRAMO_AFECADO",
};

export function normalizeRoadValue(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/**
 * Propone un escenario a partir del texto del riesgo. Busca menciones de cada valor solo entre las
 * opciones compatibles con lo ya encontrado y completa los campos que quedan determinados.
 */
export function inferRoadScenario(
  riskText: string,
  departmentText: string,
  model: RoadImpactModel | null,
): RoadScenario {
  if (!model?.categories) return EMPTY_ROAD_SCENARIO;
  const text = normalizeRoadValue(riskText);
  const mentioned = (options: string[]) => options
    .filter((value) => normalizeRoadValue(value).length >= 5 && text.includes(normalizeRoadValue(value)))
    .sort((left, right) => normalizeRoadValue(right).length - normalizeRoadValue(left).length)[0] ?? "";

  let scenario = { ...EMPTY_ROAD_SCENARIO };
  const departmentTokens = departmentText.split(/[\/,;]|\s+y\s/i).map(normalizeRoadValue);
  const department = roadOptions("department", scenario, model)
    .find((value) => departmentTokens.includes(normalizeRoadValue(value))) ?? "";
  if (department) scenario = applyRoadChange(scenario, "department", department, model);

  const infer = (fields: readonly RoadField[]) => {
    for (const field of fields) {
      if (scenario[field]) continue;
      const found = mentioned(roadOptions(field, scenario, model));
      if (found) scenario = applyRoadChange(scenario, field, found, model);
    }
  };
  infer(GEOGRAPHY_CHAIN.slice(1));
  // De lo específico a lo general: un evento mencionado determina su fenómeno y su clase.
  infer([...PHENOMENON_CHAIN].reverse());
  return scenario;
}

export function roadEvaluationInputsToScenario(inputs: RoadImpactInput): RoadScenario {
  return {
    phenomenonClass: inputs.phenomenonClass,
    phenomenon: inputs.phenomenon,
    event: inputs.event,
    department: inputs.department,
    province: inputs.province ?? "",
    roadCode: inputs.roadCode ?? "",
    roadSection: inputs.roadSection ?? "",
  };
}

export function roadScenarioToInput(scenario: RoadScenario): RoadImpactInput {
  return {
    phenomenonClass: scenario.phenomenonClass,
    phenomenon: scenario.phenomenon,
    event: scenario.event,
    department: scenario.department,
    province: scenario.province || undefined,
    roadCode: scenario.roadCode || undefined,
    roadSection: scenario.roadSection || undefined,
  };
}
