import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The security gates in src/test/security walk and READ every source file
    // in the repository. Their runtime therefore scales with how big the repo
    // has grown, not with what they assert — and several sat just under the 5s
    // default until a phase added a handful of files, at which point they began
    // failing with a timeout that says nothing about the property under test.
    //
    // Raising the budget changes no assertion. Each of those gates still passes
    // in ~2-3s on its own; the headroom is for full-suite contention.
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
