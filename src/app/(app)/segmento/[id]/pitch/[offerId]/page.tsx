import { notFound } from "next/navigation";
import { resetLeaderPitch } from "@/app/actions/segment";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Flash } from "@/components/Flash";
import { LeaderPitchForm } from "@/components/LeaderPitchForm";
import type { PitchValues } from "@/components/PitchForm";
import { Notice } from "@/components/ui";
import type { PitchData } from "@/lib/book";
import { hasPitchContent } from "@/lib/book";
import { requireSegmentAccess } from "@/lib/segment-data";

type SP = Promise<Record<string, string | string[] | undefined>>;

const toValues = (p: PitchData | null, offer: { description: string | null; revenue_model: string | null; ticket_medio: number | null }): PitchValues => ({
  descricao: p ? (p.descricao ?? "") : (offer.description ?? ""),
  dores: p?.dores ?? "", proposta_valor: p?.proposta_valor ?? "", pitch_abertura: p?.pitch_abertura ?? "",
  pergunta_1: p?.pergunta_1 ?? "", pergunta_2: p?.pergunta_2 ?? "", pergunta_3: p?.pergunta_3 ?? "",
  cases: p?.cases ?? [],
  perfil_cliente: p?.perfil_cliente ?? "", persona_decisora: p?.persona_decisora ?? "", persona_influenciadora: p?.persona_influenciadora ?? "",
  funcionarios_min: p?.funcionarios_min != null ? String(p.funcionarios_min) : "", funcionarios_max: p?.funcionarios_max != null ? String(p.funcionarios_max) : "",
  modelo_receita: p ? (p.modelo_receita ?? "") : (offer.revenue_model ?? ""),
  ticket_medio: p ? (p.ticket_medio != null ? String(Number(p.ticket_medio)) : "") : (offer.ticket_medio != null ? String(offer.ticket_medio) : ""),
});

/** Pitch de uma oferta para o book do segmento. Abre com o texto do líder, se houver, ou com o do head. */
export default async function LeaderPitchPage({ params, searchParams }: { params: Promise<{ id: string; offerId: string }>; searchParams: SP }) {
  const { id, offerId } = await params;
  const sp = await searchParams;
  const { supabase, config, segment, isAdmin, isLeader } = await requireSegmentAccess(id);

  const [offerR, headR, leaderR, stR, evalR] = await Promise.all([
    supabase.from("offers").select("id,name,code,description,revenue_model,ticket_medio").eq("id", offerId).maybeSingle(),
    supabase.from("pitches").select("*").eq("offer_id", offerId).eq("segment_id", id).maybeSingle(),
    supabase.from("segment_pitches").select("*").eq("offer_id", offerId).eq("segment_id", id).maybeSingle(),
    supabase.from("segment_strategies").select("status").eq("segment_id", id).maybeSingle(),
    supabase.from("evaluations_scored").select("class_code").eq("offer_id", offerId).eq("segment_id", id).maybeSingle(),
  ]);
  const offer = offerR.data as { id: string; name: string; code: string | null; description: string | null; revenue_model: string | null; ticket_medio: number | null } | null;
  if (!offer) notFound();
  const head = (headR.data as PitchData | null) ?? null;
  const leader = (leaderR.data as PitchData | null) ?? null;
  const final = stR.data?.status === "final";
  const canEdit = (isAdmin || isLeader) && !final;
  const hasOwn = !!leader;
  const classLabel = evalR.data?.class_code ? (config.bands.find((b) => b.code === evalR.data!.class_code)?.label ?? null) : null;

  const banner = (
    <div className="space-y-3">
      <Flash ok={sp.ok} erro={sp.erro} />
      <Notice tone="info" icon="edit">
        {hasOwn
          ? "Você está editando a sua versão deste pitch, a que vai para o book."
          : hasPitchContent(head)
            ? "Este é o texto escrito pelo head. Ao editar, você cria a versão do segmento para o book; o texto do head fica guardado."
            : "O head ainda não escreveu este pitch. O que você escrever aqui vai para o book."}
        {hasOwn && canEdit && (
          <form action={resetLeaderPitch} className="ml-2 inline">
            <input type="hidden" name="segment_id" value={id} /><input type="hidden" name="offer_id" value={offerId} />
            <ConfirmSubmit className="btn btn-sm" title="Voltar ao texto do head?" message="A sua versão será descartada e o book volta a usar o texto escrito pelo head." confirmLabel="Descartar a minha versão">Voltar ao texto do head</ConfirmSubmit>
          </form>
        )}
      </Notice>
    </div>
  );

  return (
    <LeaderPitchForm
      segmentId={id} offerId={offer.id} offerName={offer.name} segmentName={segment.name} classLabel={classLabel}
      initial={toValues(leader ?? head, offer)} readOnly={!canEdit} backHref={`/segmento/${id}`} banner={banner}
    />
  );
}
