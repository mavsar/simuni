import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET?.trim() || "http://localhost:3300";
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src")
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes("node_modules")) {
                        return undefined;
                    }
                    if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) {
                        return "react-vendor";
                    }
                    if (id.includes("react-router")) {
                        return "router-vendor";
                    }
                    return "vendor";
                }
            }
        }
    },
    server: {
        port: 5190,
        proxy: {
            "/api": {
                target: apiProxyTarget,
                changeOrigin: true
            }
        }
    }
});
