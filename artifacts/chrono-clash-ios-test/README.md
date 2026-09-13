# Chrono Clash — iOS test shell (experimental)

This package is a **separate Capacitor iOS wrapper** around the **existing** Chrono Clash React/Vite/TypeScript game.

It does **not** replace the Replit/web preview.
It does **not** change gameplay, gems, board, HUD, powers, audio, scoring, or animations.
It does **not** convert the game to Unity or Swift.

Branch: `chrono-clash-ios-test`  
**Do not merge** this branch into `main` or the live web development branches until the physical iPhone test is done.

Game source remains at `artifacts/chrono-clash/`.
This folder only adds the native test target.

---

## What this machine can and cannot do

This workspace is **Linux**. A Windows PC is the same for iOS: **Xcode cannot run here**.

| Step | Linux / Windows | Mac with Xcode 16+ |
| --- | --- | --- |
| Install JS deps | Yes | Yes |
| Build the existing web game into `www/` | Yes | Yes |
| Generate / update the Xcode project (`cap sync ios`) | Yes | Yes |
| Compile an `.app` / `.ipa` | **No** | Yes |
| Install on a personal iPhone | **No** | Yes (USB + signing) |

**No iOS binary was produced in this environment.** That is expected. Do not treat the repo as containing a finished installable IPA.

What remains on a Mac (or a cloud macOS builder such as a `macos-14` GitHub runner, MacStadium, or Xcode Cloud):

1. Open the Xcode workspace.
2. Select your Apple signing team.
3. Plug in the iPhone and Run, or archive an IPA.

---

## Exact setup commands

From the repo root, on this branch:

```bash
git checkout chrono-clash-ios-test
pnpm install
pnpm --filter @workspace/chrono-clash-ios-test run ios:sync
```

`ios:sync` does two things:

1. `node ./scripts/prepare-web.mjs`  
   Builds the **current** Chrono Clash sources with a Capacitor-only Vite config (no Replit plugins) into `artifacts/chrono-clash-ios-test/www/`.  
   Then injects `native-bridge.js` into **that copy only**.
2. `cap sync ios`  
   Copies `www/` into `ios/App/App/public` and refreshes native plugin registration.

The live web command is unchanged:

```bash
PORT=21676 BASE_PATH=/ pnpm --filter @workspace/chrono-clash run dev
```

---

## Files created (wrapper only)

| Path | Role |
| --- | --- |
| `artifacts/chrono-clash-ios-test/package.json` | Capacitor 7 + prepare/sync scripts |
| `artifacts/chrono-clash-ios-test/capacitor.config.ts` | Full-screen WebView, no page scroll, no zoom, status-bar overlay |
| `artifacts/chrono-clash-ios-test/vite.config.ts` | Capacitor-only production build of the existing game |
| `artifacts/chrono-clash-ios-test/scripts/prepare-web.mjs` | Builds the game into `www/` and injects the native bridge |
| `artifacts/chrono-clash-ios-test/scripts/native-bridge.js` | iOS-only `navigator.vibrate` → Capacitor Haptics; blocks pinch-zoom |
| `artifacts/chrono-clash-ios-test/ios/` | Generated Xcode / SPM project |
| `artifacts/chrono-clash-ios-test/ios/App/App/NativeShellViewController.swift` | Full-screen shell, bounce/scroll lock, home-indicator hide |
| `artifacts/chrono-clash-ios-test/ios/App/App/AppDelegate.swift` | `AVAudioSession` playback so Web Audio is not muted by the Silent switch |
| `artifacts/chrono-clash-ios-test/ios/App/App/Info.plist` | Portrait iPhone, full screen, camera/photo strings for the existing avatar feature |
| `pnpm-lock.yaml` | Lockfile for the new workspace package |

Game files under `artifacts/chrono-clash/src`, CSS, board, HUD, gems, and the existing `vite.config.ts` are **not** part of this change.

`www/` and `ios/App/App/public/` are build outputs and are gitignored. Always run `ios:sync` before opening Xcode.

---

## Exact iOS build instructions (Mac + Xcode)

Requirements on the Mac:

- macOS with **Xcode 16 or newer** (Capacitor 7)
- Xcode Command Line Tools
- Node 22+ and `pnpm` (same as this repo)
- An Apple ID (free) or Apple Developer Program membership (paid)

```bash
git clone <this-repo>
cd jonethen1070-hash-chrono-clash-current-2026-
git checkout chrono-clash-ios-test
pnpm install
pnpm --filter @workspace/chrono-clash-ios-test run ios:sync
pnpm --filter @workspace/chrono-clash-ios-test run ios:open
```

`ios:open` launches `ios/App/App.xcodeproj`. If Xcode asks, use the project that already references the local `CapApp-SPM` package (Swift Package Manager — CocoaPods is not required).

In Xcode:

1. Select the **App** target.
2. **Signing & Capabilities**
   - Team: your Personal Team or Developer Program team
   - Bundle ID: `com.chronoclash.ios.test`  
     If Apple rejects the ID as taken, change it to something you own, e.g. `com.yourname.chronoclash.test`. Do not change game code.
3. Destination: your connected **iPhone** (not a generic iOS Device if you want a one-click install).
4. Product → Run (`⌘R`) for a debug install, or Product → Archive for an IPA.

---

## Install on a personal iPhone

### Free Apple ID (fastest for a private feel test)

1. On the iPhone: Settings → Privacy & Security → **Developer Mode** → On (iOS 16+), then reboot.
2. USB-C/Lightning cable to the Mac. Unlock the phone. Trust this computer.
3. In Xcode, pick the phone as the run destination and press Run.
4. First launch: Settings → General → VPN & Device Management → trust your Apple ID certificate.
5. Free personal-team builds expire in **7 days**. Re-Run from Xcode to refresh.

This installs **Chrono Clash Test** as a home-screen app:

- no Safari address bar
- no browser back/forward chrome
- no Replit editor chrome
- full-screen WebView with the existing game

### Paid Apple Developer Program ($99/year)

Same Xcode Run flow, plus:

- Ad Hoc / development profiles last longer
- **TestFlight**: Archive → Distribute App → App Store Connect → TestFlight → install from the TestFlight app
- Required if you want wireless installs for more than a week or testers who are not at your Mac

### Windows / this Linux agent

You **cannot** sign or install onto an iPhone from Windows or this Linux VM.

Options:

1. Copy this branch to a Mac and follow the Xcode steps above.
2. Use a cloud Mac (MacStadium, AWS EC2 Mac, GitHub Actions `macos-14` + signing secrets) to archive, then install via TestFlight or a signed IPA + Apple Configurator / Finder.

A Windows-only machine cannot substitute for Xcode.

---

## Apple signing requirements

- **Bundle ID** must be unique on the team you sign with.
- **Automatic signing** is already set in the Xcode project (`CODE_SIGN_STYLE = Automatic`).
- A free Apple ID is enough for a 7-day personal device install.
- App Store / TestFlight distribution requires the paid program.
- `ITSAppUsesNonExemptEncryption` is set to `false` for this test shell (no custom crypto added). Confirm that still matches any backend you later ship.

---

## Native shell behavior (no game rewrite)

- Full-screen `WKWebView`, portrait iPhone only
- `scrollEnabled: false` + bounce off so swipes do not pan the page
- `zoomEnabled: false` + gesture block so pinch does not scale the board
- Status bar overlays the WebView so the game’s existing `env(safe-area-inset-*)` CSS still applies
- Home indicator auto-hides
- Existing Web Audio continues; Silent-switch mute is disabled at the session level only
- Existing `navigator.vibrate` patterns are forwarded to iOS haptics **inside the wrapper**. iOS does not implement the web Vibration API. If the Haptics plugin is unavailable, the game already no-ops — same as desktop Safari
- Board geometry is whatever the current web game already does on that phone size. This shell does **not** scale or letterbox to a fake 390×844 frame

---

## Known test-build limits

- First audio/haptic still needs a tap, same as the web game’s unlock path.
- Google Fonts still load from the network (existing `index.html`). The phone needs internet the first time those faces are fetched.
- This is **not** an App Store submission.
- Do not merge until you have played the installed build and decided whether a native shell should stay.

---

## Stop

After `ios:sync` on a Mac, open Xcode and install. Do not change gameplay on this branch to “make iOS work.”
