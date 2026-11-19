import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { output: { manualChunks: { charts: ["recharts"], vision: ["@mediapipe/face_mesh"] } } },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": { target: process.env.API_PROXY_TARGET || "http://localhost:58000", changeOrigin: true },
      "/storage": { target: process.env.API_PROXY_TARGET || "http://localhost:58000", changeOrigin: true },
    },
  },
});
