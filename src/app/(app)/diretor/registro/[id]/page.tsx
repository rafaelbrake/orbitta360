import { notFound } from "next/navigation";
import { deleteMmtRecord } from "@/app/actions/mmt";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Icon } from "@/components/Icon";
import { MmtForm } from "@/components/MmtForm";
import { BackLink } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { allowedSegments } from "@/lib/mmt-data";
import { requireProfile } from "@/lib/session";
import type { MmtRecord } from "@/lib/types";

export default async function MmtRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireProfile("diretor", "admin");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: rec } = await supabase.from("mmt_records").select("*").eq("id", id).maybeSingle<MmtRecord>();
  if (!rec) notFound(); // RLS: registro de outro diretor também cai aqui

  const [config, editable, offers] = await Promise.all([
    loadConfig(supabase),
    supabase.rpc("mmt_editable", { p_author: rec.author_id }),
    supabase.rpc("list_offers", { p_bu: rec.bu_id }),
  ]);
  const segments = await allowedSegments(supabase, profile, config, rec.segment_id);

  const isEditable = editable.data === true;
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <BackLink href="/diretor">Meus registros</BackLink>
        {isEditable && (
          <form action={deleteMmtRecord} className="-mt-3">
            <input type="hidden" name="id" value={rec.id} />
            <ConfirmSubmit className="btn btn-danger btn-sm" danger title="Excluir este registro?" message="Esta ação não pode ser desfeita." confirmLabel="Excluir"><Icon name="delete" size={16} />Excluir registro</ConfirmSubmit>
          </form>
        )}
      </div>
    <MmtForm
      key={rec.id}
      id={rec.id}
      type={rec.type}
      regional={rec.regional}
      segments={segments}
      bus={config.bus.filter((b) => b.active || b.id === rec.bu_id)}
      initialOffers={(offers.data ?? []) as { id: string; code: string | null; name: string }[]}
      readOnly={editable.data !== true}
      initial={{
        segment_id: rec.segment_id, bu_id: rec.bu_id, offer_id: rec.offer_id, priority: rec.priority,
        headline: rec.headline ?? "", evidence: rec.evidence ?? "", reason: rec.reason ?? "", action: rec.action ?? "", indicator: rec.indicator ?? "",
        audience: rec.audience, audience_other: rec.audience_other ?? "",
      }}
    />
    </>
  );
}
