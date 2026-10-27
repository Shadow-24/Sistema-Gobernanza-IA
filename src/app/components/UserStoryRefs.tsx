type UserStoryRefsProps = {
  ids?: string[];
  note?: string;
};

/** Small navigation cue only; it does not imply that acceptance criteria are met. */
export function UserStoryRefs({ ids = [], note }: UserStoryRefsProps) {
  const label = ids.length ? ids.join(" · ") : "Sin HU directa";
  return (
    <span
      title={note ?? "Historias relacionadas con esta sección; la etiqueta no certifica el cumplimiento de sus criterios de aceptación."}
      className="inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-[9px] font-medium"
      style={{ background: "#eff6ff", color: "#0f6cbd" }}
    >
      {label}
    </span>
  );
}
