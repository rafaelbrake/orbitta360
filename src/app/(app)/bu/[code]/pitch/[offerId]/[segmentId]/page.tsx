import { notFound } from "next/navigation";
import { PitchForm, type PitchValues } from "@/components/PitchForm";
import { loadEvaluations, loadOffers, requireBuAccess, requireStageReady } from "@/lib/data";
import { isScorable } from "@/lib/offers";
import type { Pitch } from "@/lib/types";

/** Pitch de uma oferta (ou agrupamento) em um segmento. Oferta dentro de agrupamento não tem pitch próprio. */
export default async function PitchPage({ params }: { params: Promise<{ code: string; offerId: string; segmentId: string }> }) {
  const { code, offerId, segmentId } = await params;
  const ctx = await requireBuAccess(code);
  const { supabase, bu, config, editable } = ctx;
  requireStageReady(ctx);
  const [offers, evals] = await Promise.all([loadOffers(supabase, bu.id), loadEvaluations(supabase, bu.id)]);
  const offer = offers.find((o) => o.id === offerId && isScorable(o));
  const segment = config.activeSegments.find((s) => s.id === segmentId);
  if (!offer || !segment) notFound();
  const evaluation = evals.find((e) => e.offer_id === offer.id && e.segment_id === segment.id);
  const { data } = await supabase.from("pitches").select("*").eq("offer_id", offer.id).eq("segment_id", segment.id).maybeSingle<Pitch>();

  // Ficha nova: descrição, modelo e ticket já vêm da oferta (o head ajusta o que precisar).
  const initial: PitchValues = {
    descricao: data ? (data.descricao ?? "") : (offer.description ?? ""),
    dores: data?.dores ?? "", proposta_valor: data?.proposta_valor ?? "", pitch_abertura: data?.pitch_abertura ?? "",
    pergunta_1: data?.pergunta_1 ?? "", pergunta_2: data?.pergunta_2 ?? "", pergunta_3: data?.pergunta_3 ?? "",
    cases: data?.cases ?? [],
    perfil_cliente: data?.perfil_cliente ?? "", persona_decisora: data?.persona_decisora ?? "", persona_influenciadora: data?.persona_influenciadora ?? "",
    funcionarios_min: data?.funcionarios_min != null ? String(data.funcionarios_min) : "",
    funcionarios_max: data?.funcionarios_max != null ? String(data.funcionarios_max) : "",
    modelo_receita: data ? (data.modelo_receita ?? "") : (offer.revenue_model ?? ""),
    ticket_medio: data ? (data.ticket_medio != null ? String(Number(data.ticket_medio)) : "") : (offer.ticket_medio != null ? String(offer.ticket_medio) : ""),
  };
  const classLabel = evaluation?.class_code ? (config.bands.find((b) => b.code === evaluation.class_code)?.label ?? null) : null;

  return (
    <PitchForm
      key={`${offer.id}:${segment.id}`}
      offerId={offer.id}
      segmentId={segment.id}
      offerName={offer.name}
      segmentName={segment.name}
      classLabel={classLabel}
      initial={initial}
      prefilled={!data && !!offer.description}
      readOnly={!editable}
      backHref={`/bu/${bu.code}`}
    />
  );
}
