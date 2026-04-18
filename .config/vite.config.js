import { defineConfig } from "vite";
import fs from "fs";

const input = {
  main: "web/index.html",
  privacy: "web/privacy.html",
  powerpoint: "web/powerpoint.html",
};

export default defineConfig(({ command }) => ({
  root: "web",
  base: "/pptypst/",
  build: {
    outDir: "../build/",
    emptyOutDir: true,
    rollupOptions: {
      input,
      output: {
        manualChunks(id) {
          if (/[\\/]monaco-editor[\\/]/u.test(id)) {
            return "monaco";
          }

          if (/[\\/]web[\\/]src[\\/](editor-runtime|tinymist-lsp)/u.test(id)) {
            return "typst-editor";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 3155,
    ...(command === "serve" && {
      https: {
        key: fs.readFileSync("web/certs/localhost.key"),
        cert: fs.readFileSync("web/certs/localhost.crt"),
      },
    }),
  },
}));
