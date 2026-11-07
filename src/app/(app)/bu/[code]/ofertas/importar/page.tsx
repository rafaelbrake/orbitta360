import { redirect } from "next/navigation";
import { ImportOffers } from "@/components/ImportOffers";
import { BackLink, PageHeader } from "@/components/ui";
import { requireBuAccess } from "@/lib/data";

export default async function ImportOffersPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { bu, editable } = await requireBuAccess(code);
  if (!editable) redirect(`/bu/${bu.code}/ofertas`);
  return (
    <div className="max-w-4xl">
      <BackLink href={`/bu/${bu.code}/ofertas`}>Ofertas de {bu.code}</BackLink>
      <PageHeader title="Importar ofertas do Excel" subtitle={`${bu.code} · ${bu.name}`} />
      <ImportOffers code={bu.code} />
    </div>
  );
}
