import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { homeFor, requireProfile } from "@/lib/session";
import { redirect } from "next/navigation";

/** Página de espera dos Diretores Comerciais enquanto a área deles está em evolução. */
export default async function EmBreve() {
  const { profile } = await requireProfile();
  if (profile.role !== "diretor" || DIRECTORS_ENABLED) redirect(homeFor(profile.role));
  return (
    <div className="max-w-2xl">
      <PageHeader title="Área dos Diretores Comerciais" subtitle="Em evolução" />
      <div className="card">
        <EmptyState icon="schedule" title="Esta área ainda não está liberada">
          Estamos concluindo, antes, a avaliação das ofertas pelos Heads de BU. Quando a área dos Diretores Comerciais estiver pronta, a Diretoria Corporativa avisa e o seu acesso será liberado.
        </EmptyState>
      </div>
    </div>
  );
}
