import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import dns from "node:dns";
import path from "node:path";

// Every Frappe site uses the same cookie names (sid, user_id …) and browsers share cookies across ports, so the
// sugar app runs on its own hostname: sugarcane.local (needs "127.0.0.1 sugarcane.local" in /etc/hosts). Until that
// line exists it falls back to sugarcane.localhost, which browsers resolve by themselves. Plain localhost redirects.
const PORT = 5179;
const SITE = "sugarcane.local";

function ownHostname(host: string): Plugin {
  return {
    name: "sugarcane-own-hostname",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requested = (req.headers.host ?? "").split(":")[0];
        if (requested === "localhost" || requested === "127.0.0.1") {
          res.writeHead(302, { Location: `http://${host}:${PORT}${req.url ?? "/"}` });
          res.end();
          return;
        }
        if (req.url === "/" || req.url === "") {
          res.writeHead(302, { Location: "/sugar" });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

async function devHostname(): Promise<string> {
  try {
    await dns.promises.lookup(SITE);
    return SITE;
  } catch {
    return "sugarcane.localhost";
  }
}

export default defineConfig(async ({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_PROXY_TARGET || "http://127.0.0.1:8006";
  const host = command === "serve" ? await devHostname() : SITE;
  const proxy = {
    target,
    changeOrigin: true,
    headers: { Host: SITE, "X-Frappe-Site-Name": SITE },
    cookieDomainRewrite: "",
    secure: false,
  };
  return {
    plugins: [react(), ownHostname(host)],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    // the build is served by Frappe from /assets/sugarcane/frontend/ (www/sugar.html loads it)
    base: command === "build" ? "/assets/sugarcane/frontend/" : "/",
    server: {
      port: PORT,
      strictPort: true,
      host: true,
      allowedHosts: [SITE, "sugarcane.localhost", "localhost"],
      proxy: {
        "/api": proxy,
        "/files": proxy,
        "/private": proxy,
        "/assets": proxy,
        "/app": proxy,
        "/desk": proxy,
        "/printview": proxy,
        "/socket.io": { target: env.VITE_SOCKETIO_TARGET || "http://127.0.0.1:9000", ws: true, changeOrigin: false,
          headers: { "X-Frappe-Site-Name": SITE } },
      },
    },
    build: {
      outDir: "../sugarcane/public/frontend",
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-frappe": ["frappe-react-sdk"],
          },
        },
      },
    },
  };
});
