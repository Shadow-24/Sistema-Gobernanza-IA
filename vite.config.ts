import fs from "fs";
import path from "path";
import { defineConfig, type Connect, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.API_PORT || "8000");
const apiProxy = {
  "/api": {
    target: `http://127.0.0.1:${apiPort}`,
    changeOrigin: true,
  },
};

// publicDir está desactivado para no copiar todos los CSV a dist; se sirven solo las rutas que el frontend consulta.
const servePublicAssets = (): Plugin => {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = decodeURIComponent((req.url ?? "").split("?")[0]);
    if (!/^\/(imports|pdfjs)\//.test(url) || url.includes("..")) return next();
    const file = path.join(__dirname, "public", url);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
    res.setHeader("Content-Type", "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: "serve-public-assets",
    configureServer: (server) => { server.middlewares.use(middleware); },
    configurePreviewServer: (server) => { server.middlewares.use(middleware); },
  };
};

export default defineConfig({
  publicDir: false,
  server: {
    host: "127.0.0.1",
    proxy: apiProxy,
  },
  preview: {
    host: "127.0.0.1",
    proxy: apiProxy,
  },
  plugins: [react(), tailwindcss(), servePublicAssets()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  assetsInclude: ["**/*.svg", "**/*.csv"],
});
