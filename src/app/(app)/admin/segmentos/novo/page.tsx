import { saveSegment } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { SegmentForm } from "@/components/forms/SegmentForm";
import { BackLink, PageHeader } from "@/components/ui";
import { loadConfig, loadLeaderCandidates } from "@/lib/data";
import { requireProfile } from "@/lib/session";

export default async function NewSegmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const [config, people] = await Promise.all([loadConfig(supabase), loadLeaderCandidates(supabase)]);
  return (
    <div className="max-w-3xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href="/admin/segmentos">Segmentos</BackLink>
      <PageHeader title="Novo segmento" />
      <SegmentForm mode="new" action={saveSegment} nextSort={config.segments.length + 1} cancelHref="/admin/segmentos" waveOptions={[...new Set(config.segments.map((s) => s.wave))]} people={people} />
    </div>
  );
}
