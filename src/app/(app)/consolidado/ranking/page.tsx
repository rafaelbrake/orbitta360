import Link from "next/link";
import { ConsolidadoNav, ExportLink } from "@/components/ConsolidadoNav";
import { ClassBadge, PageHeader } from "@/components/ui";
import { loadRanking, qp, requireConsolidated } from "@/lib/consolidated";
import { loadConfig } from "@/lib/data";
import { withPositions } from "@/lib/exports";
import { EmptyState } from "@/components/EmptyState";

export default async function RankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireConsolidated();
  const config = await loadConfig(supabase);

  const waves = [...new Set(config.segments.map((s) => s.wave))].sort();
  const wave = qp(sp.wave);
  const segmentList = config.segments.filter((s) => !wave || s.wave === wave);
  const segment = segmentList.find((s) => s.id === qp(sp.segment)) ?? segmentList.find((s) => s.active) ?? segmentList[0];
  const buId = qp(sp.bu);
  const classCode = qp(sp.class);

  const rows = segment ? withPositions(await loadRanking(supabase, config, { segmentId: segment.id, buId, classCode })) : [];
  const exportQs = new URLSearchParams({ ...(segment ? { segment: segment.id } : {}), ...(buId ? { bu: buId } : {}), ...(classCode ? { class: classCode } : {}) }).toString();

  return (
    <div>
      <ConsolidadoNav current="ranking" role={profile.role} />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="f-wave">Onda</label>
          <select id="f-wave" name="wave" className="input" defaultValue={wave ?? ""}>
            <option value="">Todas</option>
            {waves.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-seg">Segmento</label>
          <select id="f-seg" name="segment" className="input" defaultValue={segment?.id}>
            {segmentList.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (inativo)"}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-bu">BU</label>
          <select id="f-bu" name="bu" className="input" defaultValue={buId ?? ""}>
            <option value="">Todas</option>
            {config.bus.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-class">Classificação</label>
          <select id="f-class" name="class" className="input" defaultValue={classCode ?? ""}>
            <option value="">Todas</option>
            {config.bands.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary">Filtrar</button>
        <div className="ml-auto flex gap-2">
          <ExportLink href={`/consolidado/export/ranking?${exportQs}`} />
          {profile.role === "admin" && segment && (
            <ExportLink href={`/consolidado/export/pacote?segment=${segment.id}`} label="Pacote do segmento (Excel)" />
          )}
        </div>
      </form>

      <PageHeader title={segment ? segment.name : "Sem segmento"} subtitle={`${rows.length} ${rows.length === 1 ? "oferta pontuada" : "ofertas pontuadas"}${profile.role === "diretor" ? " · somente BUs que já enviaram" : ""}`} />

      {rows.length === 0 ? (
        <div className="card"><EmptyState icon="bar_chart" title="Nenhuma oferta pontuada neste filtro">Ajuste os filtros acima ou aguarde os heads concluírem a pontuação.</EmptyState></div>
      ) : (
      <div className="table-wrap">
        <table className="min-w-full">
          <thead><tr>
            <th className="th">#</th><th className="th">Oferta</th><th className="th">BU</th><th className="th">Score</th><th className="th">Classificação</th>
            {config.criteria.map((c) => <th key={c.id} className="th text-center" title={c.name}>C{c.id}</th>)}
            <th className="th">Pitch</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.evaluationId}>
                <td className="td tabular-nums text-(--ink-3)">{r.position}</td>
                <td className="td font-medium">{r.offerName}</td>
                <td className="td">{r.bu.code}</td>
                <td className="td font-semibold">{r.score}</td>
                <td className="td">
                  <ClassBadge code={r.classCode} label={config.bands.find((b) => b.code === r.classCode)?.label} />
                  {r.specialistLed && <span className="badge ml-1 bg-(--accent-100) text-(--accent-800)">Venda liderada pelo especialista</span>}
                </td>
                {r.notes.map((n, i) => <td key={i} className="td text-center">{n}</td>)}
                <td className="td">{r.hasPitch ? <Link className="underline" href={`/consolidado/pitch/${r.offerId}/${r.segment.id}`}>Ver pitch</Link> : <span className="text-(--ink-3)">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <p className="mt-2 text-xs text-(--ink-3)">
        {config.criteria.map((c) => `C${c.id} = ${c.name}`).join(" · ")}
      </p>
    </div>
  );
}
