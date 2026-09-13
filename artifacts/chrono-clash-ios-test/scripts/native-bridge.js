/**
 * Capacitor-only native bridge. Copied into the iOS www bundle after the
 * existing Chrono Clash production build. Never imported by the web game.
 *
 * - Maps the game's existing navigator.vibrate() calls onto iOS haptics.
 *   iOS WKWebView does not implement the Vibration API.
 * - Blocks pinch-zoom / two-finger page gestures that a native WebView can
 *   still emit even when Capacitor zoomEnabled is false.
 */
(function chronoClashIosNativeBridge() {
  if (typeof window === "undefined") return;
  if (!window.Capacitor || window.Capacitor.getPlatform?.() !== "ios") return;

  var Haptics = window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
  if (Haptics && typeof Haptics.impact === "function") {
    var vibrate = function (pattern) {
      var first = Array.isArray(pattern) ? Number(pattern[0]) || 0 : Number(pattern) || 0;
      if (first <= 0) {
        if (typeof Haptics.selectionChanged === "function") {
          Haptics.selectionChanged();
        }
        return true;
      }
      var style = first >= 40 ? "HEAVY" : first >= 20 ? "MEDIUM" : "LIGHT";
      Haptics.impact({ style: style });
      return true;
    };
    try {
      navigator.vibrate = vibrate;
    } catch (err) {
      try {
        Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
      } catch (_ignored) {
        /* existing game code already no-ops when vibrate is missing */
      }
    }
  }

  var blockNativeGesture = function (event) {
    event.preventDefault();
  };
  document.addEventListener("gesturestart", blockNativeGesture, { passive: false });
  document.addEventListener("gesturechange", blockNativeGesture, { passive: false });
  document.addEventListener("gestureend", blockNativeGesture, { passive: false });
})();
