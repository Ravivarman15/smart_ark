import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Free universal real-time translation middleware.
 * Executes translation requests server-side without CORS limitations or API keys.
 */
function translateApiPlugin(): Plugin {
  return {
    name: "smart-ark-translate-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith("/api/translate")) {
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
            });
            req.on("end", async () => {
              try {
                const parsed = JSON.parse(body || "{}");
                const texts: string[] = Array.isArray(parsed.texts)
                  ? parsed.texts
                  : [parsed.text || ""];
                const targetLang = parsed.targetLang || "ta";
                const sourceLang = parsed.sourceLang || "en";

                if (texts.length === 0 || (texts.length === 1 && !texts[0].trim())) {
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ translations: texts }));
                  return;
                }

                const joined = texts.join(" ___ ");
                const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sourceLang}&tl=${targetLang}&q=${encodeURIComponent(
                  joined,
                )}`;
                const upstream = await fetch(url);
                if (upstream.ok) {
                  const data = await upstream.json();
                  const raw = Array.isArray(data)
                    ? data[0]
                    : typeof data === "string"
                    ? data
                    : null;
                  if (raw && typeof raw === "string") {
                    const parts = raw.split(/\s*___\s*/);
                    if (parts.length === texts.length) {
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify({ translations: parts.map((p) => p.trim()) }));
                      return;
                    }
                  }
                }

                // Fallback: translate individually if delimiter split had mismatch
                const individual = await Promise.all(
                  texts.map(async (t) => {
                    try {
                      const singleUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sourceLang}&tl=${targetLang}&q=${encodeURIComponent(
                        t,
                      )}`;
                      const r = await fetch(singleUrl);
                      if (r.ok) {
                        const d = await r.json();
                        return Array.isArray(d) ? d[0] : typeof d === "string" ? d : t;
                      }
                    } catch {}
                    return t;
                  }),
                );

                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ translations: individual }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: String(err) }));
              }
            });
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    translateApiPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Raise warning threshold to 800kB (some third-party libs like recharts/html2canvas are large)
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // UI component library
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-popover",
          ],
          // Charts
          "vendor-charts": ["recharts"],
          // PDF/canvas (large libs)
          "vendor-pdf": ["html2canvas", "jspdf"],
          // Supabase
          "vendor-supabase": ["@supabase/supabase-js"],
        },
      },
    },
  },
}));
