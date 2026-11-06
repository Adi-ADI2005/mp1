const path = require("node:path");
const { defineConfig, loadEnv } = require("vite");

module.exports = defineConfig(async ({ mode }) => {
  const { default: react } = await import("@vitejs/plugin-react");
  const env = loadEnv(mode, __dirname, "");
  const replitEnvironment = Boolean(process.env.REPLIT_DEV_DOMAIN);
  const backendPort = process.env.BACKEND_PORT
    || env.BACKEND_PORT
    || (!replitEnvironment && (process.env.PORT || env.PORT))
    || "8000";
  const frontendPort = process.env.VITE_PORT
    || env.VITE_PORT
    || (replitEnvironment ? "5000" : "5173");
  const backendTarget = `http://127.0.0.1:${backendPort}`;

  return {
    root: __dirname,
    plugins: [react({ include: /\.(js|jsx)$/ })],
    server: {
      host: "0.0.0.0",
      port: Number(frontendPort),
      strictPort: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
        "/ws": {
          target: backendTarget.replace(/^http/, "ws"),
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
  };
});