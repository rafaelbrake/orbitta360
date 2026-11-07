/** Esqueleto exibido enquanto a página carrega (navegação entre telas do sistema). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton mt-3 h-4 w-96 max-w-full" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 !rounded-xl" />)}
      </div>
      <div className="card mt-6 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-9" />)}
      </div>
    </div>
  );
}
