import { notFound } from "next/navigation";
import { saveSegment } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { SegmentForm } from "@/components/forms/SegmentForm";
import { BackLink, PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { requireProfile } from "@/lib/session";

export default async function SegmentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  const segment = config.segments.find((s) => s.id === id);
  if (!segment) notFound();
  return (
    <div className="max-w-3xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href="/admin/segmentos">Segmentos</BackLink>
      <PageHeader title={segment.name} subtitle={`Onda ${segment.wave}`}>
        <span className={`badge ${segment.active ? "bg-(--brand-100) text-(--brand-800)" : "bg-slate-200 text-slate-700"}`}>{segment.active ? "Ativo" : "Inativo"}</span>
      </PageHeader>
      <SegmentForm mode="edit" action={saveSegment} segment={segment} nextSort={segment.sort} cancelHref="/admin/segmentos" waveOptions={[...new Set(config.segments.map((s) => s.wave))]} />
    </div>
  );
}
