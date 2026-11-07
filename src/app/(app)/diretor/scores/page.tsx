import Link from "next/link";
import { DiretorTabs } from "@/components/DiretorTabs";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { requireProfile } from "@/lib/session";

export default async function ScoresPage() {
  const { supabase, profile } = await requireProfile("diretor");
  const config = await loadConfig(supabase);
  const { data } = await supabase.rpc("segment_overview");
  const overview = (data ?? []) as {
    segment_id: string; bus_sent: number; offers_scored: number; n_alta: number; n_potencial: number; n_secundaria: number; n_baixa: number; max_score: number | null;
  }[];
  const segName = new Map(config.segments.map((s) => [s.id, s.name]));
  const band = (code: string) => config.bands.find((b) => b.code === code)?.label ?? code;
  const activeBus = config.bus.filter((b) => b.active).length;

  return (
    <div>
      <PageHeader title="Manter / Mudar / Treinar" subtitle="Score de priorização por segmento: visão consolidada e somente leitura das BUs que já enviaram, sem o detalhe de cada BU." />
      <DiretorTabs current="scores" />
      {overview.length === 0 ? (
        <div className="card"><EmptyState icon="bar_chart" title="Nenhum segmento ativo">Os scores aparecem aqui quando houver segmentos ativos.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="min-w-[44rem]">
            <thead><tr>
              <th className="th">Segmento</th><th className="th">BUs que enviaram</th><th className="th text-right">Ofertas pontuadas</th>
              <th className="th text-right">{band("alta")}</th><th className="th text-right">{band("potencial")}</th><th className="th text-right">{band("secundaria")}</th><th className="th text-right">{band("baixa")}</th><th className="th text-right">Maior score</th>
            </tr></thead>
            <tbody>
              {overview.map((o) => (
                <tr key={o.segment_id}>
                  <td className="td font-semibold">{segName.get(o.segment_id)}</td>
                  <td className="td tabular-nums">{o.bus_sent} de {activeBus}</td>
                  <td className="td text-right tabular-nums">{o.offers_scored}</td>
                  <td className="td text-right tabular-nums">{o.n_alta}</td><td className="td text-right tabular-nums">{o.n_potencial}</td>
                  <td className="td text-right tabular-nums">{o.n_secundaria}</td><td className="td text-right tabular-nums">{o.n_baixa}</td>
                  <td className="td text-right font-semibold tabular-nums">{o.max_score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {profile.can_see_bu_detail && (
        <p className="mt-3 text-sm text-(--ink-2)">A Diretoria Corporativa liberou o detalhe das BUs enviadas: <Link href="/consolidado/ranking" className="font-semibold text-(--brand) underline">ver o ranking por segmento</Link>.</p>
      )}
    </div>
  );
}
