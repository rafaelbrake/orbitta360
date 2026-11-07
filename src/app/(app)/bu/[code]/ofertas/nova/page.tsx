import { redirect } from "next/navigation";
import { saveOffer } from "@/app/actions/bu";
import { Flash } from "@/components/Flash";
import { OfferForm } from "@/components/forms/OfferForm";
import { BackLink, PageHeader } from "@/components/ui";
import { buOptionsFor, nextCodesFor, requireBuAccess } from "@/lib/data";

export default async function NewOfferPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { code } = await params;
  const sp = await searchParams;
  const { supabase, profile, bu, config, editable } = await requireBuAccess(code);
  const buOptions = await buOptionsFor(supabase, profile, config);
  const nextCodes = await nextCodesFor(supabase, buOptions.map((b) => b.id));
  if (!editable) redirect(`/bu/${bu.code}/ofertas`);
  return (
    <div className="max-w-4xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href={`/bu/${bu.code}/ofertas`}>Ofertas de {bu.code}</BackLink>
      <PageHeader title="Nova oferta" subtitle={`${bu.code} · ${bu.name}`} />
      <OfferForm mode="new" action={saveOffer} code={bu.code} readOnly={false} cancelHref={`/bu/${bu.code}/ofertas`} buOptions={buOptions} buId={bu.id} nextCodes={nextCodes} />
    </div>
  );
}
