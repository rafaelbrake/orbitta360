"use client";

import { saveLeaderPitch } from "@/app/actions/segment";
import { PitchForm, type PitchValues } from "@/components/PitchForm";

/** Pitch do book: grava a versão do líder do segmento (o texto do head fica guardado). */
export function LeaderPitchForm({ segmentId, offerId, offerName, segmentName, classLabel, initial, readOnly, backHref, banner }: {
  segmentId: string; offerId: string; offerName: string; segmentName: string; classLabel: string | null; initial: PitchValues; readOnly: boolean; backHref: string; banner?: React.ReactNode;
}) {
  return (
    <PitchForm
      key={`${segmentId}:${offerId}`} mode="lider" offerId={offerId} segmentId={segmentId} offerName={offerName} segmentName={segmentName} classLabel={classLabel}
      initial={initial} prefilled={false} readOnly={readOnly} backHref={backHref} backLabel="Voltar ao segmento" banner={banner}
      save={(values) => saveLeaderPitch({ segmentId, offerId, values })}
    />
  );
}
