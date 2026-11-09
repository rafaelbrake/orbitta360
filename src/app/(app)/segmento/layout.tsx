import { redirect } from "next/navigation";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { homeFor, requireProfile } from "@/lib/session";

/** Consolidação por segmento: faz parte da área dos Diretores/líderes, oculta enquanto o interruptor estiver desligado. */
export default async function SegmentoLayout({ children }: { children: React.ReactNode }) {
  if (!DIRECTORS_ENABLED) {
    const { profile } = await requireProfile();
    redirect(homeFor(profile.role));
  }
  return children;
}
