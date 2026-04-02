// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://holon.software",
  trailingSlash: "never",
  build: {
    format: "file",
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
