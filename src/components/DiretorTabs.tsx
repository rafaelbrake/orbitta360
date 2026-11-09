import { Tabs } from "@/components/ui";

export function DiretorTabs({ current }: { current: "regiao" | "registros" | "scores" }) {
  return (
    <Tabs
      current={current}
      items={[
        { key: "regiao", label: "Minha região", href: "/diretor/regiao" },
        { key: "registros", label: "Destaques por oferta", href: "/diretor" },
        { key: "scores", label: "Score por segmento", href: "/diretor/scores" },
      ]}
    />
  );
}
