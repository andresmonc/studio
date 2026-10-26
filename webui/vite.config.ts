import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Dev runs on goff.local (the host the API's cookie and CORS origin use);
  // Vite rejects non-localhost Host headers unless listed.
  server: { allowedHosts: ["goff.local"] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
