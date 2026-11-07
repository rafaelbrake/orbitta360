import Link from "next/link";
import { ConsolidadoNav, ExportLink } from "@/components/ConsolidadoNav";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui";
import { buildHeatmap, loadRanking, requireConsolidated } from "@/lib/consolidated";
import { loadConfig } from "@/lib/data";

/**
 * Escala sequencial de um só tom (mais forte = score maior), uma etapa por faixa de classificação.
 * Cores de texto escolhidas para contraste ≥ 4,5:1 em cada etapa.
 */
const RAMP: Record<string, { bg: string; fg: string }> = {
  baixa: { bg: "#e9f2ed", fg: "#17392f" },
  secundaria: { bg: "#bcdccd", fg: "#17392f" },
  potencial: { bg: "#80baa5", fg: "#17392f" },
  alta: { bg: "#00754a", fg: "#ffffff" },
};

export default async function HeatmapPage() {
  const { supabase, profile } = await requireConsolidated();
  const config = await loadConfig(supabase);
  const bus = config.bus.filter((b) => b.active);
  const segments = config.activeSegments;
  const rows = await loadRanking(supabase, config);
  const cells = buildHeatmap(rows, bus, segments);
  const bandLabel = (code: string | null) => config.bands.find((b) => b.code === code)?.label ?? "";

  const colTotal = (segId: string) => bus.reduce((n, b) => n + cells.get(`${b.id}:${segId}`)!.priorityCount, 0);
  const rowTotal = (buId: string) => segments.reduce((n, s) => n + cells.get(`${buId}:${s.id}`)!.priorityCount, 0);
  const grand = bus.reduce((n, b) => n + rowTotal(b.id), 0);

  return (
    <div>
      <ConsolidadoNav current="heatmap" role={profile.role} />
      <PageHeader
        title="Heatmap BU × segmento"
        subtitle="Em cada célula: o maior score e quantas ofertas estão em Prioridade alta ou potencial. Clique para abrir as ofertas."
        actions={<ExportLink href="/consolidado/export/heatmap" />}
      />

      {rows.length === 0 ? (
        <div className="card"><EmptyState icon="grid_view" title="Ainda não há ofertas pontuadas">As células aparecem aqui conforme os heads pontuam as ofertas.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="min-w-[44rem]">
            <thead>
              <tr>
                <th className="th sticky left-0 z-[2] bg-(--brand-50)">BU</th>
                {segments.map((s) => <th key={s.id} className="th text-center !whitespace-normal">{s.name}</th>)}
                <th className="th text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {bus.map((b) => (
                <tr key={b.id}>
                  <td className="td sticky left-0 z-[1] bg-white font-semibold">{b.code}<div className="text-xs font-normal text-(--ink-3)">{b.name}</div></td>
                  {segments.map((s) => {
                    const c = cells.get(`${b.id}:${s.id}`)!;
                    const ramp = c.maxClass ? RAMP[c.maxClass] : null;
                    return (
                      <td key={s.id} className="!p-1.5 text-center">
                        {c.offers === 0 || !ramp ? (
                          <span className="grid h-14 min-w-[5.5rem] place-items-center rounded-lg border border-dashed border-(--line-strong) text-xs text-(--ink-3)" aria-label="Sem ofertas pontuadas">—</span>
                        ) : (
                          <Link
                            href={`/consolidado/ranking?segment=${s.id}&bu=${b.id}`}
                            title={`${b.code} × ${s.name}: maior score ${c.maxScore} (${bandLabel(c.maxClass)}) · ${c.priorityCount} oferta(s) em prioridade alta ou potencial`}
                            style={{ background: ramp.bg, color: ramp.fg }}
                            className="flex h-14 min-w-[5.5rem] flex-col items-center justify-center rounded-lg leading-tight shadow-(--shadow-1) transition-transform hover:-translate-y-px hover:shadow-(--shadow-2)"
                          >
                            <span className="text-lg font-bold tabular-nums">{c.maxScore}</span>
                            <span className="text-[11px] font-medium opacity-90">{c.priorityCount} {c.priorityCount === 1 ? "prioritária" : "prioritárias"}</span>
                          </Link>
                        )}
                      </td>
                    );
                  })}
                  <td className="td text-center font-semibold tabular-nums text-(--ink-2)">{rowTotal(b.id)}</td>
                </tr>
              ))}
              <tr className="[&>td]:bg-(--brand-50)">
                <td className="td sticky left-0 font-semibold">Total</td>
                {segments.map((s) => <td key={s.id} className="td text-center font-semibold tabular-nums text-(--ink-2)">{colTotal(s.id)}</td>)}
                <td className="td text-center font-bold tabular-nums text-(--forest)">{grand}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-(--ink-2)">
        <span className="eyebrow">Maior score da célula</span>
        {["baixa", "secundaria", "potencial", "alta"].map((code) => {
          const band = config.bands.find((b) => b.code === code);
          return (
            <span key={code} className="flex items-center gap-1.5">
              <span className="size-4 rounded" style={{ background: RAMP[code].bg }} />
              {band?.label ?? code} <span className="text-(--ink-3)">({band?.min_score}–{band?.max_score})</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
