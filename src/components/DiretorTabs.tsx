import { Tabs } from "@/components/ui";

export function DiretorTabs({ current }: { current: "registros" | "scores" }) {
  return (
    <Tabs
      current={current}
      items={[
        { key: "registros", label: "Meus registros", href: "/diretor" },
        { key: "scores", label: "Score por segmento", href: "/diretor/scores" },
      ]}
    />
  );
}
