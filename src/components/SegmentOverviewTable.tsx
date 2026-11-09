import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ProgressBar } from "@/components/ui";
import { fmtDate } from "@/lib/data";
import type { SegmentOverview } from "@/lib/segment-overview";

/** Acompanhamento dos segmentos pela Diretoria: heads, líder, regionais e andamento da consolidação. */
export function SegmentOverviewTable({ rows }: { rows: SegmentOverview[] }) {
  return (
    <div className="table-wrap">
      <table className="min-w-[64rem]">
        <thead><tr>
          <th className="th">Segmento</th><th className="th">Líder</th><th className="th w-48">Avaliações dos heads</th><th className="th">Níveis</th>
          <th className="th">Estratégia</th><th className="th">Regionais</th><th className="th">Ajustes</th><th className="th">Status</th><th className="th col-actions w-56"></th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.segment.id}>
              <td className="td font-semibold"><Link href={`/segmento/${r.segment.id}`} className="text-(--forest) hover:underline">{r.segment.name}</Link><div className="text-xs font-normal text-(--ink-3)">{r.segment.wave}</div></td>
              <td className="td text-sm">{r.segment.leader || <span className="font-medium text-(--danger)">sem líder</span>}</td>
              <td className="td"><ProgressBar done={r.evals.done} total={r.evals.total} unit="" /></td>
              <td className="td whitespace-nowrap text-sm">
                <span className={r.levels.foco > r.focoLimit ? "font-semibold text-(--danger)" : "font-semibold text-(--forest)"}>Foco {r.levels.foco}/{r.focoLimit}</span>
                <div className="text-xs text-(--ink-3)">Apoio {r.levels.apoio} · Fora {r.levels.fora}{r.levels.semNivel > 0 ? ` · sem nível ${r.levels.semNivel}` : ""}</div>
              </td>
              <td className="td text-sm">
                <div className="flex items-center gap-1"><Icon name={r.thesis ? "task_alt" : "warning"} size={14} className={r.thesis ? "text-(--brand)" : "text-amber-700"} />Tese</div>
                <div className="flex items-center gap-1"><Icon name={r.message ? "task_alt" : "warning"} size={14} className={r.message ? "text-(--brand)" : "text-amber-700"} />Mensagem</div>
              </td>
              <td className="td whitespace-nowrap text-sm">{r.regionalViews} {r.regionalViews === 1 ? "visão" : "visões"}<div className="text-xs text-(--ink-3)">{r.highlights} destaques · {r.leaderPitches} pitches do líder</div></td>
              <td className="td text-sm tabular-nums">{r.pendingAdjustments > 0 ? <span className="badge bg-amber-100 text-amber-900">{r.pendingAdjustments} pendentes</span> : <span className="text-(--ink-3)">—</span>}</td>
              <td className="td whitespace-nowrap">
                {r.status === "final"
                  ? <span className="badge bg-(--brand) text-white"><Icon name="lock_open" size={14} />Versão final{r.finalizedAt ? ` · ${fmtDate(r.finalizedAt)}` : ""}</span>
                  : <span className="badge bg-amber-100 text-amber-900"><Icon name="edit" size={14} />Rascunho</span>}
              </td>
              <td className="td col-actions whitespace-nowrap text-right">
                <Link href={`/segmento/${r.segment.id}`} className="btn btn-sm mr-1.5">Abrir</Link>
                <Link href={`/reuniao/${r.segment.id}`} className="btn btn-sm" title="Modo reunião"><Icon name="monitoring" size={16} /></Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
