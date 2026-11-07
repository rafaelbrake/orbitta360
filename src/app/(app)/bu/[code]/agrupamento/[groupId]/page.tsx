import Link from "next/link";
import { notFound } from "next/navigation";
import { dissolveGroup, removeFromGroup, saveOffer } from "@/app/actions/bu";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Flash } from "@/components/Flash";
import { OfferForm } from "@/components/forms/OfferForm";
import { Icon } from "@/components/Icon";
import { BackLink, Notice, PageHeader } from "@/components/ui";
import { buOptionsFor, loadOffers, requireBuAccess } from "@/lib/data";
import { fmtTicket } from "@/lib/offers";

export default async function GroupDetailPage({ params, searchParams }: { params: Promise<{ code: string; groupId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { code, groupId } = await params;
  const sp = await searchParams;
  const { supabase, profile, bu, config, editable } = await requireBuAccess(code);
  const all = await loadOffers(supabase, bu.id);
  const group = all.find((o) => o.id === groupId && o.is_group);
  if (!group) notFound();
  const members = all.filter((o) => o.group_id === group.id);
  const base = `/bu/${bu.code}/agrupamento`;
  const buOptions = await buOptionsFor(supabase, profile, config);

  return (
    <div className="max-w-4xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href={base}>Agrupamento</BackLink>
      <PageHeader
        title={group.name}
        subtitle={`${bu.code} · ${bu.name}${group.code ? ` · ${group.code}` : ""}`}
        actions={editable && (
          <form action={dissolveGroup}>
            <input type="hidden" name="code" value={bu.code} />
            <input type="hidden" name="group_id" value={group.id} />
            <ConfirmSubmit
              className="btn btn-danger" danger title="Desfazer este agrupamento?"
              message="As ofertas voltam a ser avulsas e as notas do agrupamento são descartadas. As notas que as ofertas originais já tinham voltam a valer."
              confirmLabel="Desfazer agrupamento"
            >Desfazer agrupamento</ConfirmSubmit>
          </form>
        )}
      >
        <span className="badge bg-(--brand-100) text-(--brand-800)"><Icon name="list_alt" size={14} />Agrupamento · {members.length} ofertas</span>
      </PageHeader>
      {!editable && <Notice tone="warn" className="mb-4">Somente leitura: período fechado ou envio concluído.</Notice>}

      <section className="mb-4">
        <h2 className="mb-3">Ofertas do agrupamento</h2>
        <div className="table-wrap">
          <table className="min-w-[36rem]">
            <thead><tr><th className="th">Oferta</th><th className="th">Tipo</th><th className="th">Modelo de receita</th><th className="th text-right">Ticket / volume do deal</th>{editable && <th className="th col-actions w-32"></th>}</tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="td"><Link href={`/bu/${bu.code}/ofertas/${m.id}`} className="font-semibold text-(--forest) hover:underline">{m.name}</Link></td>
                  <td className="td text-sm">{m.offer_type ?? "—"}</td>
                  <td className="td text-sm">{m.revenue_model ?? "—"}</td>
                  <td className="td text-right tabular-nums">{fmtTicket(m.ticket_medio, m.revenue_model)}</td>
                  {editable && (
                    <td className="td col-actions text-right">
                      <form action={removeFromGroup}>
                        <input type="hidden" name="code" value={bu.code} />
                        <input type="hidden" name="group_id" value={group.id} />
                        <input type="hidden" name="offer_id" value={m.id} />
                        <ConfirmSubmit className="btn btn-sm" title="Tirar esta oferta do agrupamento?" message={`“${m.name}” volta a ser uma oferta avulsa e passa a ser classificada sozinha.`} confirmLabel="Remover">Remover</ConfirmSubmit>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && <p className="mt-2 text-xs text-(--ink-3)">Para incluir mais ofertas, volte à lista e use “Adicionar a…” com as ofertas avulsas marcadas.</p>}
      </section>

      <OfferForm
        mode="edit" kind="agrupamento" action={saveOffer} code={bu.code} offer={group} readOnly={!editable}
        cancelHref={base} buOptions={buOptions} buId={group.bu_id} back={`${base}/${group.id}`}
      />
    </div>
  );
}
