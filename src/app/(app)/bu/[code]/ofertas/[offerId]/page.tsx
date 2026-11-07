import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveOffer, toggleOffer } from "@/app/actions/bu";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Flash } from "@/components/Flash";
import { OfferForm } from "@/components/forms/OfferForm";
import { SubmitButton } from "@/components/SubmitButton";
import { BackLink, Notice, PageHeader } from "@/components/ui";
import { buOptionsFor, loadOffers, requireBuAccess } from "@/lib/data";

export default async function OfferDetailPage({ params, searchParams }: { params: Promise<{ code: string; offerId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { code, offerId } = await params;
  const sp = await searchParams;
  const { supabase, profile, bu, config, editable } = await requireBuAccess(code);
  const all = await loadOffers(supabase, bu.id);
  const offer = all.find((o) => o.id === offerId);
  if (!offer) notFound();
  if (offer.is_group) redirect(`/bu/${bu.code}/agrupamento/${offer.id}`); // agrupamento tem tela própria
  const group = offer.group_id ? all.find((o) => o.id === offer.group_id) : undefined;
  const buOptions = await buOptionsFor(supabase, profile, config);
  const list = `/bu/${bu.code}/ofertas`;

  return (
    <div className="max-w-4xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href={list}>Ofertas de {bu.code}</BackLink>
      <PageHeader
        title={offer.name}
        subtitle={`${bu.code} · ${bu.name}${offer.code ? ` · ${offer.code}` : ""}`}
        actions={editable && (
          <form action={toggleOffer}>
            <input type="hidden" name="code" value={bu.code} />
            <input type="hidden" name="id" value={offer.id} />
            <input type="hidden" name="active" value={String(!offer.active)} />
            {offer.active ? (
              <ConfirmSubmit className="btn btn-danger" danger title="Desconsiderar oferta?" message={`“${offer.name}” não segue para as próximas etapas (agrupamento, classificação e envio). Nada é apagado: as notas ficam guardadas e você pode reconsiderá-la depois.`} confirmLabel="Desconsiderar">Desconsiderar oferta</ConfirmSubmit>
            ) : (
              <SubmitButton className="btn">Reconsiderar oferta</SubmitButton>
            )}
          </form>
        )}
      >
        <span className={`badge ${offer.active ? "bg-(--brand-100) text-(--brand-800)" : "bg-slate-200 text-slate-700"}`}>{offer.active ? "Considerada" : "Desconsiderada"}</span>
      </PageHeader>
      {group && (
        <Notice tone="info" icon="list_alt" className="mb-4">
          Esta oferta faz parte do agrupamento <Link className="font-semibold underline" href={`/bu/${bu.code}/agrupamento/${group.id}`}>{group.name}</Link>: a classificação é feita no agrupamento.
        </Notice>
      )}
      {!editable && <Notice tone="warn" className="mb-4">Somente leitura: período fechado ou envio concluído.</Notice>}
      {!offer.active && editable && <Notice tone="info" className="mb-4">Oferta desconsiderada: não segue para o agrupamento nem aparece na matriz de pontuação. As notas já lançadas continuam guardadas.</Notice>}
      <OfferForm mode="edit" action={saveOffer} code={bu.code} offer={offer} readOnly={!editable} cancelHref={list} buOptions={buOptions} buId={offer.bu_id} />
    </div>
  );
}
