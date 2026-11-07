import { redirect } from "next/navigation";
import { createGroup } from "@/app/actions/bu";
import { Flash } from "@/components/Flash";
import { OfferForm } from "@/components/forms/OfferForm";
import { BackLink, Notice, PageHeader } from "@/components/ui";
import { buOptionsFor, loadEvaluations, loadOffers, nextCodesFor, requireBuAccess } from "@/lib/data";
import { flash } from "@/lib/flash";
import { fmtTicket, groupDefaults, suggestGroupName } from "@/lib/offers";
import type { Offer } from "@/lib/types";

export default async function NewGroupPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { code } = await params;
  const sp = await searchParams;
  const { supabase, profile, bu, config, editable } = await requireBuAccess(code);
  const base = `/bu/${bu.code}/agrupamento`;
  if (!editable) redirect(base);

  const ids = [...new Set([sp.ids].flat().filter((v): v is string => typeof v === "string" && v.length > 0))];
  const [all, evals] = await Promise.all([loadOffers(supabase, bu.id), loadEvaluations(supabase, bu.id)]);
  const members = ids.map((id) => all.find((o) => o.id === id && o.active && !o.is_group && !o.group_id)).filter((o): o is NonNullable<typeof o> => !!o);
  if (members.length < 2) flash(base, "erro", "Selecione ao menos 2 ofertas avulsas para agrupar.");

  const defaults = groupDefaults(members);
  const draft = { name: suggestGroupName(members.map((m) => m.name)), description: null, code: null, bcg: null, ...defaults } as unknown as Offer;
  const withNotes = members.filter((m) => evals.some((e) => e.offer_id === m.id));
  const buOptions = await buOptionsFor(supabase, profile, config);
  const nextCodes = await nextCodesFor(supabase, [bu.id], true);

  return (
    <div className="max-w-4xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href={base}>Agrupamento</BackLink>
      <PageHeader title="Novo agrupamento" subtitle={`${bu.code} · ${bu.name} · ${members.length} ofertas selecionadas`} />

      <section className="card mb-4 !p-5">
        <h2 className="mb-3">Ofertas que serão agrupadas</h2>
        <ul className="divide-y divide-(--line) text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 py-2">
              <span className="font-semibold text-(--forest)">{m.name}</span>
              <span className="text-(--ink-3)">{[m.offer_type, m.revenue_model].filter(Boolean).join(" · ")}</span>
              <span className="ml-auto tabular-nums text-(--ink-2)">{fmtTicket(m.ticket_medio, m.revenue_model)}</span>
            </li>
          ))}
        </ul>
      </section>

      {withNotes.length > 0 && (
        <Notice tone="warn" className="mb-4">
          {withNotes.length === 1 ? "Uma dessas ofertas já tem" : `${withNotes.length} dessas ofertas já têm`} notas lançadas. Elas ficam guardadas, mas não entram na classificação: a nota passa a ser a do agrupamento. Se você desfizer o agrupamento, elas voltam.
        </Notice>
      )}

      <OfferForm
        mode="new" kind="agrupamento" lockBu action={createGroup} code={bu.code} offer={draft} readOnly={false}
        cancelHref={base} buOptions={buOptions} buId={bu.id} nextCodes={nextCodes}
      >
        {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <p className="mt-3 text-xs text-(--ink-3)">Tipo e modelo vêm preenchidos quando as ofertas escolhidas têm o mesmo; o ticket é a média delas quando todas têm o mesmo modelo (valor mensal para recorrente, volume do deal para pontual); com modelos diferentes ele vem vazio. Ajuste o que precisar.</p>
      </OfferForm>
    </div>
  );
}
