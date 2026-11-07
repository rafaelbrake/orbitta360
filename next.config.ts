import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Importação de Excel pelo formulário: o padrão do Next é 1 MB; a Vercel aceita até 4,5 MB por requisição.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
