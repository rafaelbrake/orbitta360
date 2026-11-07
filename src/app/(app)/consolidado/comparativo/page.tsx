import Link from "next/link";
import { ConsolidadoNav, ExportLink } from "@/components/ConsolidadoNav";
import { ClassBadge } from "@/components/ui";
import { deliveryRisk, painWithoutOpening, parseCompareParams } from "@/lib/compare";
import { loadRanking, qp, requireConsolidated, type RankingRow } from "@/lib/consolidated";
import { loadConfig } from "@/lib/data";
import type { Criterion } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";

function Table({ rows, config, highlight }: { rows: RankingRow[]; config: { criteria: Criterion[]; bands: { code: string; label: string }[] }; highlight: number[] }) {
  if (rows.length === 0)
    return <div className="card"><EmptyState compact icon="task_alt" title="Nenhuma oferta nesta condição">Nada a investigar com os limiares atuais.</EmptyState></div>;
  return (
    <div className="table-wrap">
      <table className="min-w-full">
        <thead><tr>
          <th className="th">Segmento</th><th className="th">BU</th><th className="th">Oferta</th><th className="th">Score</th><th className="th">Classificação</th>
          {config.criteria.map((c) => <th key={c.id} className="th text-center" title={c.name}>C{c.id}</th>)}
          <th className="th">Pitch</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.evaluationId}>
              <td className="td">{r.segment.name}</td><td className="td">{r.bu.code}</td><td className="td font-medium">{r.offerName}</td>
              <td className="td font-semibold">{r.score}</td>
              <td className="td"><ClassBadge code={r.classCode} label={config.bands.find((b) => b.code === r.classCode)?.label} /></td>
              {r.notes.map((n, i) => (
                <td key={i} className={`td text-center ${highlight.includes(i) ? "bg-red-50 font-semibold text-red-800" : ""}`}>{n}</td>
              ))}
              <td className="td">{r.hasPitch ? <Link className="underline" href={`/consolidado/pitch/${r.offerId}/${r.segment.id}`}>Ver</Link> : "—"}</td>
            </tr>
          ))}
          
        </tbody>
      </table>
    </div>
  );
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireConsolidated();
  const config = await loadConfig(supabase);
  const potencialMin = config.bands.find((b) => b.code === "potencial")?.min_score ?? 70;
  const p = parseCompareParams((k) => qp(sp[k]), potencialMin);
  const segmentId = qp(sp.segment);
  const buId = qp(sp.bu);

  const rows = await loadRanking(supabase, config, { segmentId, buId });
  const risk = deliveryRisk(rows, p);
  const pain = painWithoutOpening(rows, p);
  const qs = new URLSearchParams({
    ...(segmentId ? { segment: segmentId } : {}), ...(buId ? { bu: buId } : {}),
    min: String(p.minScore), prontidao: String(p.maxReadiness), dor: String(p.minPain), abertura: String(p.maxOpening),
  }).toString();
  const n = (id: number) => config.criteria.find((c) => c.id === id)?.name ?? `Critério ${id}`;

  return (
    <div className="space-y-6">
      <ConsolidadoNav current="comparativo" role={profile.role} />
      <form method="get" className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="c-seg">Segmento</label>
          <select id="c-seg" name="segment" className="input" defaultValue={segmentId ?? ""}>
            <option value="">Todos</option>
            {config.segments.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c-bu">BU</label>
          <select id="c-bu" name="bu" className="input" defaultValue={buId ?? ""}>
            <option value="">Todas</option>
            {config.bus.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="c-min">Score alto a partir de</label><input id="c-min" name="min" type="number" min={0} max={100} defaultValue={p.minScore} className="input w-24" /></div>
        <div><label className="label" htmlFor="c-pr">Prontidão ≤</label><input id="c-pr" name="prontidao" type="number" min={1} max={5} defaultValue={p.maxReadiness} className="input w-20" /></div>
        <div><label className="label" htmlFor="c-dor">Dor ≥</label><input id="c-dor" name="dor" type="number" min={1} max={5} defaultValue={p.minPain} className="input w-20" /></div>
        <div><label className="label" htmlFor="c-ab">Abertura ≤</label><input id="c-ab" name="abertura" type="number" min={1} max={5} defaultValue={p.maxOpening} className="input w-20" /></div>
        <button className="btn btn-primary">Aplicar</button>
        <div className="ml-auto"><ExportLink href={`/consolidado/export/comparativo?${qs}`} /></div>
      </form>

      <section>
        <h2 className="mb-2">Risco de entrega <span className="font-normal text-(--ink-3)">· {risk.length}</span></h2>
        <p className="mb-2 text-sm text-(--ink-2)">
          Score ≥ {p.minScore}, mas <strong>{n(5)}</strong> ≤ {p.maxReadiness}: a oferta é atraente no papel, porém não temos cases ou prontidão para entregar com segurança.
        </p>
        <Table rows={risk} config={config} highlight={[4]} />
      </section>

      <section>
        <h2 className="mb-2">Dor máxima, abertura difícil <span className="font-normal text-(--ink-3)">· {pain.length}</span></h2>
        <p className="mb-2 text-sm text-(--ink-2)">
          <strong>{n(1)}</strong> ≥ {p.minPain}, mas <strong>{n(4)}</strong> ≤ {p.maxOpening}: o problema existe e é grande, mas o AM tem dificuldade de abrir a conversa. Candidatas a pitch, treinamento ou venda com especialista.
        </p>
        <Table rows={pain} config={config} highlight={[0, 3]} />
      </section>
    </div>
  );
}
