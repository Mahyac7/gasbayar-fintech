import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration.
 *
 * This app is a thin native shell that loads the live Gasbayar web app
 * (deployed on Vercel) inside a WebView. Because the whole UI + API lives on
 * the server, we point `server.url` at the production domain instead of
 * bundling static assets.
 *
 * `webDir` still must exist and contain an index.html — Capacitor copies it
 * into the native project as an offline fallback. See public-shell/index.html.
 */
const config: CapacitorConfig = {
  appId: "id.gasbayar.app",
  appName: "Gasbayar",
  webDir: "public-shell",
  server: {
    // The live web app. Must be https for a release build.
    url: "https://gasbayar-fintech.vercel.app",
    cleartext: false,
  },
  android: {
    // Show a helpful message if the WebView can't reach the server.
    allowMixedContent: false,
  },
};

export default config;
