import { BrandPattern } from "@/components/BrandPattern";
import { Logo } from "@/components/Logo";

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-(--forest)">
      <BrandPattern className="absolute inset-0 h-full w-full" />
      <main className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <div className="mb-6 text-center">
          <Logo variant="negativo" className="mx-auto h-12" />
          <h1 className="mt-5 text-3xl font-medium !text-white">Orbitta360</h1>
          <p className="mt-1 text-sm text-(--calm)">Planejamento Comercial 2027</p>
          <div className="mx-auto mt-3 h-1 w-12 rounded bg-(--accent)" />
        </div>
        <div className="card shadow-lg">
          <h2 className="mb-4 text-lg">{title}</h2>
          {children}
        </div>
      </main>
    </div>
  );
}
