import Link from "next/link";
import { BuHeader } from "@/components/BuHeader";
import { OffersGrid, type GridRow } from "@/components/OffersGrid";
import { StepPanel } from "@/components/StepPanel";
import { EmptyState } from "@/components/EmptyState";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { Pagination } from "@/components/Pagination";
import { Notice } from "@/components/ui";
import { buSummary, loadEvaluations, loadOffers, requireBuAccess } from "@/lib/data";
import { matchesQuery, pageParam, paginate, param } from "@/lib/list";
import { isOfferComplete, OFFER_TYPES, REVENUE_MODELS } from "@/lib/offers";

export default async function OffersPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { code } = await params;
  const sp = await searchParams;
  const { supabase, profile, bu, config, editable, submission, stage } = await requireBuAccess(code);
  const [all, evals] = await Promise.all([loadOffers(supabase, bu.id), loadEvaluations(supabase, bu.id)]);
  const segs = config.activeSegments;
  const summary = buSummary(all, segs, evals);
  const offers = all.filter((o) => !o.is_group); // etapa 1 lista as ofertas cadastradas; os agrupamentos ficam na etapa 2
  const groupName = new Map(all.filter((o) => o.is_group).map((g) => [g.id, g.name]));

  const f = { q: param(sp.q), type: param(sp.type), model: param(sp.model), status: param(sp.status), group: param(sp.group), cad: param(sp.cad) };
  const filtered = offers
    .filter((o) => matchesQuery(f.q, o.name, o.code, o.description))
    .filter((o) => !f.type || o.offer_type === f.type)
    .filter((o) => !f.model || o.revenue_model === f.model)
    .filter((o) => !f.status || (f.status === "ativa" ? o.active : !o.active))
    .filter((o) => !f.group || (f.group === "agrupada" ? !!o.group_id : !o.group_id))
    .filter((o) => !f.cad || (f.cad === "completo" ? isOfferComplete(o) : o.active && !isOfferComplete(o)));
  const pg = paginate(filtered, pageParam(sp.page), 50); // tabela editável: páginas maiores
  const pending = offers.filter((o) => o.active && !isOfferComplete(o)).length;
  const gridRows: GridRow[] = pg.items.map((o) => ({
    id: o.id, code: o.code, name: o.name, description: o.description, offer_type: o.offer_type, revenue_model: o.revenue_model,
    ticket_medio: o.ticket_medio, active: o.active, groupId: o.group_id, groupName: o.group_id ? (groupName.get(o.group_id) ?? null) : null,
  }));

  const fields: FilterField[] = [
    { type: "search", name: "q", placeholder: "Nome, ID ou descrição" },
    { type: "select", name: "type", label: "Tipo", options: OFFER_TYPES.map((v) => ({ value: v, label: v })) },
    { type: "select", name: "model", label: "Modelo de receita", options: REVENUE_MODELS.map((v) => ({ value: v, label: v })) },
    { type: "select", name: "cad", label: "Cadastro", options: [{ value: "pendente", label: "Pendentes (faltam tipo/modelo)" }, { value: "completo", label: "Completos" }] },
    { type: "select", name: "group", label: "Agrupamento", options: [{ value: "agrupada", label: "Agrupadas" }, { value: "avulsa", label: "Avulsas" }] },
    { type: "select", name: "status", label: "Situação", allLabel: "Todas", options: [{ value: "ativa", label: "Consideradas" }, { value: "inativa", label: "Desconsideradas" }] },
  ];
  const base = `/bu/${bu.code}/ofertas`;

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <BuHeader bu={bu} current="ofertas" summary={summary} stage={stage} lock={profile.role === "head"} submission={submission} waves={config.waves} />
      {!editable && <Notice tone="warn" className="mb-4">Somente leitura: período fechado ou envio concluído.</Notice>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-(--ink-2)"><strong>Etapa 1.</strong> Confira se a lista está completa e <strong>preencha tipo e modelo de receita direto na tabela</strong> (o ticket é opcional). Na etapa 2 você agrupa as ofertas parecidas, e só então classifica.</p>
        {editable && (
          <div className="flex gap-2">
            <Link href={`${base}/importar`} className="btn"><Icon name="upload_file" size={18} />Importar do Excel</Link>
            <Link href={`${base}/nova`} className="btn btn-primary"><Icon name="add" size={18} />Nova oferta</Link>
          </div>
        )}
      </div>

      {editable && pending > 0 && (
        <Notice tone="warn" className="mb-4">
          Faltam tipo e/ou modelo de receita em <strong>{pending}</strong> {pending === 1 ? "oferta" : "ofertas"}. Sem isso não dá para confirmar a lista.{" "}
          {f.cad !== "pendente" && <Link href={`${base}?cad=pendente`} className="font-semibold underline">Ver só as pendentes</Link>}
        </Notice>
      )}

      <ListFilters fields={fields} total={filtered.length} noun={["oferta", "ofertas"]} />

      {pg.total === 0 ? (
        <div className="card">
          <EmptyState icon="inventory_2" title={offers.length === 0 ? "Nenhuma oferta cadastrada" : "Nenhuma oferta encontrada"}>
            {offers.length === 0 ? (editable ? "Use “Nova oferta” ou importe o template Excel." : "A BU ainda não cadastrou ofertas.") : "Ajuste os filtros para ver outras ofertas."}
          </EmptyState>
        </div>
      ) : (
        <OffersGrid code={bu.code} rows={gridRows} allIds={filtered.map((o) => o.id)} editable={editable} />
      )}
      <Pagination {...pg} basePath={base} params={f} />

      <StepPanel
        code={bu.code}
        step="offers"
        confirmedAt={stage.offersConfirmedAt}
        editable={editable}
        title="Etapa 1 — A lista de ofertas está completa?"
        doneTitle="Etapa 1 concluída: lista de ofertas confirmada"
        confirmLabel="Lista completa, ir para o agrupamento"
        reopenTitle="Reabrir a conferência das ofertas?"
        reopenMessage="O agrupamento também será reaberto e a classificação fica bloqueada até você confirmar as duas etapas de novo. As notas já lançadas continuam guardadas."
        disabledReason={summary.originals === 0 ? "Cadastre ao menos uma oferta para continuar." : pending > 0 ? `Preencha tipo e modelo das ${pending} ofertas pendentes para continuar.` : null}
        blocked={summary.originals === 0 || pending > 0}
      >
        Você tem <strong>{summary.originals}</strong> {summary.originals === 1 ? "oferta ativa" : "ofertas ativas"}. Se não estiver faltando nenhuma, confirme para seguir ao agrupamento. Dá para voltar a esta etapa depois.
      </StepPanel>
    </div>
  );
}
