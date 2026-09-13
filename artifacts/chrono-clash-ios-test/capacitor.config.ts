import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native test-shell only. This does not change the Chrono Clash web game.
 * The WebView loads the existing Vite production bundle as a full-screen app.
 */
const config: CapacitorConfig = {
  appId: "com.chronoclash.ios.test",
  appName: "Chrono Clash Test",
  webDir: "www",
  backgroundColor: "#04040c",
  zoomEnabled: false,
  ios: {
    contentInset: "never",
    scrollEnabled: false,
    zoomEnabled: false,
    backgroundColor: "#04040c",
    preferredContentMode: "mobile",
    // Keep the default capacitor://localhost origin so existing /audio and
    // /assets absolute paths from the web game keep resolving.
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#00000000",
    },
    Keyboard: {
      resize: "none",
      resizeOnFullScreen: false,
    },
  },
};

export default config;
