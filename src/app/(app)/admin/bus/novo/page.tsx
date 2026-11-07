import { saveBu } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { BuForm } from "@/components/forms/BuForm";
import { BackLink, PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { requireProfile } from "@/lib/session";

export default async function NewBuPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  return (
    <div className="max-w-3xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href="/admin/bus">Unidades de Negócio</BackLink>
      <PageHeader title="Nova BU" />
      <BuForm mode="new" action={saveBu} nextSort={config.bus.length + 1} cancelHref="/admin/bus" />
    </div>
  );
}
