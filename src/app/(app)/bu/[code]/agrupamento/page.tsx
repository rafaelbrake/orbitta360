import Link from "next/link";
import { redirect } from "next/navigation";
import { addToGroup } from "@/app/actions/bu";
import { BuHeader } from "@/components/BuHeader";
import { EmptyState } from "@/components/EmptyState";
import { Flash } from "@/components/Flash";
import { GroupPicker } from "@/components/GroupPicker";
import { Icon } from "@/components/Icon";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { Pagination } from "@/components/Pagination";
import { StepPanel } from "@/components/StepPanel";
import { Notice } from "@/components/ui";
import { buSummary, loadEvaluations, loadOffers, requireBuAccess } from "@/lib/data";
import { matchesQuery, pageParam, paginate, param } from "@/lib/list";
import { fmtTicket, OFFER_TYPES, REVENUE_MODELS } from "@/lib/offers";

const PAGE = 50;

export default async function GroupingPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { code } = await params;
  const sp = await searchParams;
  const { supabase, profile, bu, config, editable, submission, stage } = await requireBuAccess(code);
  if (profile.role === "head" && !stage.offersConfirmedAt) redirect(`/bu/${bu.code}/ofertas`); // etapa 1 primeiro

  const [all, evals] = await Promise.all([loadOffers(supabase, bu.id), loadEvaluations(supabase, bu.id)]);
  const summary = buSummary(all, config.activeSegments, evals);
  const groups = all.filter((o) => o.is_group && o.active);
  const members = (id: string) => all.filter((o) => o.group_id === id && o.active);
  const loose = all.filter((o) => o.active && !o.is_group && !o.group_id);

  const f = { q: param(sp.q), type: param(sp.type), model: param(sp.model) };
  const filtered = loose
    .filter((o) => matchesQuery(f.q, o.name, o.code, o.description))
    .filter((o) => !f.type || o.offer_type === f.type)
    .filter((o) => !f.model || o.revenue_model === f.model);
  const pg = paginate(filtered, pageParam(sp.page), PAGE);
  const fields: FilterField[] = [
    { type: "search", name: "q", placeholder: "Ex.: alocação de mão de obra" },
    { type: "select", name: "type", label: "Tipo", options: OFFER_TYPES.map((v) => ({ value: v, label: v })) },
    { type: "select", name: "model", label: "Modelo de receita", options: REVENUE_MODELS.map((v) => ({ value: v, label: v })) },
  ];
  const base = `/bu/${bu.code}/agrupamento`;

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <BuHeader bu={bu} current="agrupamento" summary={summary} stage={stage} lock={profile.role === "head"} submission={submission} waves={config.waves} />
      {!editable && <Notice tone="warn" className="mb-4">Somente leitura: período fechado ou envio concluído.</Notice>}
      {editable && stage.groupingConfirmedAt && <Notice tone="info" className="mb-4">O agrupamento está concluído. Você pode continuar ajustando, mas reabra a etapa se quiser que a classificação espere por isso.</Notice>}

      <p className="mb-6 max-w-3xl text-sm text-(--ink-2)">
        <strong>Etapa 2.</strong> Junte ofertas parecidas em uma só. Por exemplo, “Alocação – Dev C#”, “Alocação – Dev Java” e “Alocação – Arquiteto” viram “Alocação de mão de obra – Desenvolvedor”.
        <strong> Você classifica o agrupamento, não cada oferta original.</strong> Ofertas que não têm parecidas seguem avulsas e são classificadas como estão.
      </p>

      <section className="mb-8">
        <h2 className="mb-3">Agrupamentos <span className="text-base font-normal text-(--ink-3)">· {groups.length}</span></h2>
        {groups.length === 0 ? (
          <div className="card"><EmptyState icon="list_alt" title="Nenhum agrupamento ainda" compact>Selecione duas ou mais ofertas abaixo e clique em “Agrupar selecionadas”. Se não houver o que agrupar, é só concluir a etapa.</EmptyState></div>
        ) : (
          <div className="table-wrap">
            <table className="min-w-[40rem]">
              <thead><tr><th className="th">ID</th><th className="th">Agrupamento</th><th className="th">Tipo</th><th className="th">Modelo de receita</th><th className="th text-right">Ofertas</th><th className="th text-right">Ticket / volume do deal</th><th className="th col-actions w-32"></th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td className="td whitespace-nowrap text-(--ink-3)">{g.code ?? "—"}</td>
                    <td className="td"><Link href={`${base}/${g.id}`} className="font-semibold text-(--forest) hover:underline">{g.name}</Link></td>
                    <td className="td text-sm">{g.offer_type ?? "—"}</td>
                    <td className="td text-sm">{g.revenue_model ?? "—"}</td>
                    <td className="td text-right tabular-nums">{members(g.id).length}</td>
                    <td className="td text-right tabular-nums">{fmtTicket(g.ticket_medio, g.revenue_model)}</td>
                    <td className="td col-actions text-right"><Link href={`${base}/${g.id}`} className="btn btn-sm"><Icon name={editable ? "edit" : "visibility"} size={16} />{editable ? "Ver / editar" : "Ver"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3">Ofertas avulsas <span className="text-base font-normal text-(--ink-3)">· {loose.length}</span></h2>
        <ListFilters fields={fields} total={filtered.length} noun={["oferta", "ofertas"]} />
        {pg.total === 0 ? (
          <div className="card"><EmptyState icon="inventory_2" title={loose.length === 0 ? "Todas as ofertas já estão agrupadas" : "Nenhuma oferta encontrada"} compact>{loose.length === 0 ? "Não há ofertas avulsas." : "Ajuste os filtros."}</EmptyState></div>
        ) : (
          <GroupPicker code={bu.code} rows={pg.items} allIds={filtered.map((o) => o.id)} groups={groups.map((g) => ({ id: g.id, name: g.name }))} newHref={`${base}/novo`} addAction={addToGroup} editable={editable} />
        )}
        <Pagination {...pg} basePath={base} params={f} />
      </section>

      <StepPanel
        code={bu.code}
        step="grouping"
        confirmedAt={stage.groupingConfirmedAt}
        editable={editable}
        title="Etapa 2 — Concluir o agrupamento"
        doneTitle="Etapa 2 concluída: agrupamento confirmado"
        confirmLabel="Agrupamento concluído, ir para a classificação"
        reopenTitle="Reabrir o agrupamento?"
        reopenMessage="A classificação fica bloqueada até você concluir o agrupamento de novo. As notas já lançadas continuam guardadas."
      >
        Você vai classificar <strong>{summary.scorable}</strong> {summary.scorable === 1 ? "item" : "itens"}: {summary.groups} {summary.groups === 1 ? "agrupamento" : "agrupamentos"} e {summary.scorable - summary.groups} {summary.scorable - summary.groups === 1 ? "oferta avulsa" : "ofertas avulsas"}.
        Dá para voltar e reagrupar depois, se precisar.
      </StepPanel>
    </div>
  );
}
