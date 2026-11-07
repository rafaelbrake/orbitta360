import { redirect } from "next/navigation";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { homeFor, requireProfile } from "@/lib/session";

/** Área dos Diretores Comerciais: oculta enquanto o interruptor (src/lib/features.ts) estiver desligado. */
export default async function DiretorLayout({ children }: { children: React.ReactNode }) {
  if (!DIRECTORS_ENABLED) {
    const { profile } = await requireProfile();
    redirect(homeFor(profile.role));
  }
  return children;
}
