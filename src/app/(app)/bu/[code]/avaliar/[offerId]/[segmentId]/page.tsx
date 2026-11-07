import { notFound } from "next/navigation";
import { EvaluationForm } from "@/components/EvaluationForm";
import { loadEvaluations, loadOffers, requireBuAccess, requireStageReady } from "@/lib/data";
import { annualizedTicket, MONTHS_PER_YEAR } from "@/lib/offers";
import { suggestRevenueNote } from "@/lib/scoring";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export default async function EvaluatePage({ params }: { params: Promise<{ code: string; offerId: string; segmentId: string }> }) {
  const { code, offerId, segmentId } = await params;
  const ctx = await requireBuAccess(code);
  const { supabase, bu, config, editable } = ctx;
  requireStageReady(ctx);
  const [offers, evals, tick] = await Promise.all([
    loadOffers(supabase, bu.id, true),
    loadEvaluations(supabase, bu.id),
    supabase.from("bu_ticket").select("ticket_medio").eq("bu_id", bu.id).maybeSingle(),
  ]);
  const offer = offers.find((o) => o.id === offerId);
  const segment = config.activeSegments.find((s) => s.id === segmentId);
  if (!offer || !segment) notFound();

  const e = evals.find((x) => x.offer_id === offerId && x.segment_id === segmentId);
  const average = tick.data ? Number(tick.data.ticket_medio) : null;
  // Recorrente informa o valor mensal; pontual, o volume do deal. A comparação com o ticket anual da BU usa a base anual.
  const annual = annualizedTicket(offer.ticket_medio, offer.revenue_model);
  const note = suggestRevenueNote(annual, average, config.settings.ticket_step);
  const basis = offer.revenue_model === "Recorrente" ? `${brl(offer.ticket_medio ?? 0)}/mês × ${MONTHS_PER_YEAR} = ${brl(annual ?? 0)}/ano` : `${brl(annual ?? 0)} de volume do deal`;

  const cells = offers.flatMap((o) => config.activeSegments.map((s) => ({ o: o.id, s: s.id })));
  const idx = cells.findIndex((c) => c.o === offerId && c.s === segmentId);
  const next = cells[idx + 1];

  return (
    <EvaluationForm
      key={`${offerId}:${segmentId}`}
      offerId={offer.id}
      segmentId={segment.id}
      offerName={offer.name}
      segmentName={segment.name}
      criteria={config.criteria}
      bands={config.bands}
      initial={{
        notApplicable: e?.not_applicable ?? false,
        notes: [e?.n1 ?? null, e?.n2 ?? null, e?.n3 ?? null, e?.n4 ?? null, e?.n5 ?? null],
        evidence: [e?.e1 ?? "", e?.e2 ?? "", e?.e3 ?? "", e?.e4 ?? "", e?.e5 ?? ""],
      }}
      suggestion={note && annual && average ? { note, basis, average } : null}
      readOnly={!editable}
      pitchHref={`/bu/${bu.code}/pitch/${offer.id}/${segment.id}`}
      backHref={`/bu/${bu.code}`}
      nextHref={next ? `/bu/${bu.code}/avaliar/${next.o}/${next.s}` : null}
    />
  );
}
