import { notFound } from "next/navigation";
import { saveBu } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { BuForm } from "@/components/forms/BuForm";
import { BackLink, PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { requireProfile } from "@/lib/session";

export default async function BuDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  const bu = config.bus.find((b) => b.id === id);
  if (!bu) notFound();
  return (
    <div className="max-w-3xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href="/admin/bus">Unidades de Negócio</BackLink>
      <PageHeader title={`${bu.code} · ${bu.name}`}>
        <span className={`badge ${bu.active ? "bg-(--brand-100) text-(--brand-800)" : "bg-slate-200 text-slate-700"}`}>{bu.active ? "Ativa" : "Inativa"}</span>
      </PageHeader>
      <BuForm mode="edit" action={saveBu} bu={bu} nextSort={bu.sort} cancelHref="/admin/bus" />
    </div>
  );
}
