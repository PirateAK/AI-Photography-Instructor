import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const APP_PORT = Number(process.env.APP_PORT || 3001);
const BACKEND_PORT = APP_PORT + 100;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    strictPort: true,
    port: APP_PORT,
    fs: { allow: [".", ".."] }, // allow importing ../data/camera_models.json
    proxy: {
      "/api": { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
    },
  },
});
