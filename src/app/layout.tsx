import type { Metadata } from "next";
import { Montserrat, Oswald } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

// Gotham (fonte oficial) é licenciada e não está disponível na web: Montserrat é o substituto geométrico mais próximo.
// Oswald é a fonte de apoio oficial, usada nos títulos.
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"] });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Orbitta360 — Selbetti",
  description: "Plataforma de priorização do portfólio e planejamento comercial 2027",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} ${oswald.variable} h-full antialiased`}>
      <body className="min-h-full"><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
