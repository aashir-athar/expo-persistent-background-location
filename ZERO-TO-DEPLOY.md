# ZERO-TO-DEPLOY — maintainer runbook

> **Audience:** the maintainer (aashir-athar). End users should read [README.md](./README.md); this file is the soup-to-nuts operational guide for developing, testing, building, and publishing `expo-persistent-background-location`.

This package is an Expo module for **SDK 56 / New Architecture** with native Kotlin (Android) and Swift (iOS) layers, a JS API, and a config plugin. The hard part to verify is **killed-app survival** — there is no unit test for "swipe the app away and confirm GPS keeps flowing", so most of this runbook is about doing that correctly on real hardware.

---

## 0. Prerequisites

| Tool                | Version             | Why                                                        |
| ------------------- | ------------------- | ---------------------------------------------------------- |
| **Node**            | 20+ (LTS)           | Expo SDK 56 / `expo-module-scripts` baseline.              |
| **npm**             | 10+                 | Lockfile + publish.                                        |
| **JDK**             | 17 (Temurin)        | Required by AGP / compileSdk 36. JDK 21 also works; 11 won't. |
| **Android Studio**  | latest (Koala/Ladybug+) | SDK Platform 36, Build-Tools, platform-tools (`adb`), an emulator. |
| **Android SDK**     | compileSdk **36**, minSdk **24** | Matches the module's `build.gradle`.            |
| **Xcode**           | 16+ (macOS only)    | iOS deployment target **15.1**, Swift 5.9. CocoaPods via `npx pod-install`. |
| **Watchman**        | optional            | Faster Metro file watching.                                |
| **A real device**   | one Android + one iPhone | Emulators/simulators **cannot** faithfully reproduce swipe-kill, OEM killers, or SLC. |

Confirm the basics:

```bash
node -v          # v20+
java -version    # 17.x
adb version      # platform-tools present
xcodebuild -version   # macOS only
```

> iOS work (building, signing, the force-quit test) requires macOS + Xcode. Android work is cross-platform. On Windows, use Git Bash / PowerShell; `adb` is identical.

---

## 1. How the scaffold was generated

The repo was bootstrapped with Expo's module template, then aligned to SDK 56:

```bash
npx create-expo-module@latest expo-persistent-background-location
```

That produced the standard layout: `src/` (JS), `android/` + `ios/` (native), `plugin/src/` (config plugin), `example/` (a dev-client app that depends on the module via a local path), plus `expo-module.config.json`, `tsconfig*.json`, and `app.plugin.js`.

Key wiring to be aware of when editing:

- **`expo-module.config.json`** is the autolinking contract. It registers the Android module class `expo.modules.persistentbackgroundlocation.ExpoPersistentBackgroundLocationModule`, the iOS module `ExpoPersistentBackgroundLocationModule`, and — critically for iOS relaunch — the **AppDelegate subscriber** `ExpoPersistentBackgroundLocationAppDelegate`. If you rename a native class, update this file or autolinking breaks.
- **Native function names must match exactly** across three places: `src/ExpoPersistentBackgroundLocationModule.ts` (the TS declaration), the Kotlin `Module` definition, and the Swift `Module` definition. The contract is: `start(config)`, `stop()`, `isRunning()`, `getStatusAsync()`, `getCurrentPosition(options)`, `getBufferedLocations(limit)`, `clearBuffer()`, `flush()`, `getPermissionStatusAsync()`, `requestPermissionsAsync(background)`, `openSettings()`. Events: `onLocation`, `onMotionChange`, `onProviderChange`, `onSync`, `onError`.
- **Defaults live in JS only** — `normalizeStartOptions` in [`src/index.ts`](./src/index.ts) is the single source of truth, flattening the public nested `StartOptions` into `NativeStartConfig`. Native carries matching defaults only as a safety net. When you add an option, add it in the types, the normalizer, and both native `Record` classes.

### SDK 56 alignment

- `expo ^56.0.12`, `expo-modules-core ~56.0.17`, `expo-module-scripts ^56.0.3`, `react-native 0.86`, `react 19.2`, `@types/react ~19.2`.
- Android: compileSdk **36**, minSdk **24**, Kotlin, `play-services-location 21.3.0`, coroutines 1.9.0.
- iOS: deployment target **15.1**, Swift 5.9, CoreLocation + system `sqlite3`.
- `package.json` `peerDependencies` are intentionally loose (`expo >=54.0.0`, `react`/`react-native` `*`) so the module installs cleanly into consumer apps; the **devDependencies pin SDK 56** for local dev.

---

## 2. Local dev loop

```bash
# from the repo root
npm install
npm run build         # expo-module build — compiles src/ -> build/ and plugin/src -> plugin/build
```

The example app consumes the module from the parent directory. Run it on a device:

```bash
cd example
npm install
npx expo prebuild --clean      # regenerates android/ + ios/ with the config plugin applied
npx expo run:android           # or: npx expo run:ios   (macOS)
```

Tips:

- **Editing JS** (`src/`): Metro picks up changes in the example via the local path. For a clean `build/`, re-run `npm run build` at the root.
- **Editing the config plugin** (`plugin/src/`): run `npm run build` at the root, then **`npx expo prebuild --clean`** in `example/` — the plugin only runs at prebuild time, so manifest/Info.plist changes won't appear until you re-prebuild.
- **Editing native** (`android/` Kotlin, `ios/` Swift): rebuild the dev client (`run:android` / `run:ios`). Kotlin changes recompile in-place; iOS may need `npx pod-install` in `example/ios` after dependency changes.
- **Verbose native logs:** call `start({ debug: true })` and watch `adb logcat` (Android) or the Xcode console (iOS).

---

## 3. Testing killed-app survival on a real device

This is the feature; test it like you mean it. **Use physical devices.** Grant **background ("Always" / Allow all the time)** location before each test.

### Android — swipe-to-kill

1. Build & install the example on a real Android phone (`npx expo run:android`).
2. Start tracking from the app (background permission granted). Confirm the foreground-service notification appears.
3. Stream logs in a terminal:
   ```bash
   adb logcat -v time | grep -iE "PersistentBackgroundLocation|location|fused|FGS"
   ```
4. **Swipe the app away** from Recents (or simulate it):
   ```bash
   adb shell am stack list                       # find the task (or use: adb shell dumpsys activity recents)
   adb shell am kill com.aashirathar.pblexample  # kill the app process (background kill)
   ```
   For a true task-removal test, swipe it out of Recents by hand — `am kill` and a manual swipe exercise different code paths (`onTaskRemoved` only fires on task removal).
5. Move ~50–100 m (or use a mock-location app / `adb emu geo fix`). Confirm:
   - the FGS notification is still present;
   - new lines appear in logcat;
   - `bufferedCount` grew (reopen the app and check `getStatus()`, or query SQLite — see below).
6. **Force-stop test (expected to NOT survive):**
   ```bash
   adb shell am force-stop com.aashirathar.pblexample
   ```
   `force-stop` is the user pressing "Force stop" in Settings — Android guarantees **nothing** restarts after that (no `START_STICKY`, no boot receiver until next launch). Document this as expected: force-stop kills tracking until the user reopens the app.

### Android — reboot test

```bash
adb reboot
```

After the device boots (do **not** open the app), move around. With `restartOnBoot: true`, the `BOOT_COMPLETED` receiver should re-arm tracking and resume buffering. Confirm via logcat after reboot and by checking `bufferedCount` when you next open the app.

> **OEM caveat:** on Xiaomi/Huawei/Samsung/OnePlus etc., steps 4–6 and the reboot test may fail because the vendor killed the service — that's the documented out-of-scope limitation, not a regression. Note the device/OEM/OS version in any bug report.

### Inspecting the SQLite buffer directly (Android)

```bash
adb shell run-as com.aashirathar.pblexample ls -la databases/
adb shell run-as com.aashirathar.pblexample \
  sqlite3 databases/<dbname>.db "SELECT COUNT(*) FROM <table>;"
```

(`run-as` works on debuggable builds.) Easiest path: just call `getBufferedLocations()` / `getStatus()` from the example UI.

### iOS — force-quit / SLC test

1. Build & install on a real iPhone (`npx expo run:ios`), grant **"Always"** location.
2. Start tracking, confirm the blue background-location indicator appears.
3. **Force-quit** the app (swipe up in the app switcher).
4. **Travel ≥ ~500 m** — this genuinely requires moving (a walk/drive). Significant-location-change is cell/Wi-Fi granularity and is **not** triggered by sitting still or by small movements. Simulator GPX routes do **not** reproduce real SLC relaunch behaviour; the simulator can't force-quit-relaunch the way a device does.
5. Reopen the app and check `getBufferedLocations()` — you should see SLC-provider fixes (`provider: 'slc'`) captured while the app was dead, proving the `ExpoPersistentBackgroundLocationAppDelegate` relaunch path worked.
6. **Expected limit:** you will NOT see continuous metre-level fixes during the force-quit window — only coarse SLC fixes. Document this.

> Xcode → Debug → Simulate Location is useful for *backgrounded* (not force-quit) testing, but the **force-quit relaunch** must be done on hardware with real movement.

---

## 4. Static checks & build

```bash
npm run lint          # expo-module lint (ESLint + prettier config from expo-module-scripts)
npm run test          # expo-module test (Jest) — runs the JS unit tests
npx tsc --noEmit      # type-check src/ and plugin/src against tsconfig
npm run build         # expo-module build — emits build/ and plugin/build/
```

What `expo-module build` does: compiles `src/` → `build/` (the published JS + `.d.ts`, per `main`/`types` in `package.json`) and `plugin/src/` → `plugin/build/` (the config plugin entry, referenced by `app.plugin.js`).

Native compilation is validated by actually building the example (`run:android` / `run:ios`) — there is no standalone "compile the native lib" step outside a consumer app.

Pre-publish gate (run all four green): `lint` → `test` → `tsc --noEmit` → `build`.

---

## 5. Versioning

- **SemVer.** Current: `0.1.0` (pre-1.0 — minor bumps may carry breaking changes; call them out in the changelog).
- Bump with `npm version <patch|minor|major>` (creates the commit + tag), or edit `package.json` by hand and tag manually.
- **What forces a bump:**
  - any change to the public JS API, `StartOptions`, `LocationFix`, event payloads → **minor** (pre-1.0) / **major** (post-1.0);
  - native behaviour changes that alter survival semantics → **minor** + prominent changelog note;
  - docs/tooling only → **patch**.
- Keep a `CHANGELOG.md` (Keep a Changelog format). Since the README's FAQ references version-specific fixes, every shipped fix needs a changelog line.
- **Native ⇄ JS contract:** if you change a native function name or signature, it is a breaking change even if the JS wrapper hides it — bump accordingly and update all three definitions (TS decl, Kotlin, Swift).

---

## 6. Building for publish

`package.json` `files` whitelists exactly what ships in the tarball:

```
build, android, ios, src, plugin/build, app.plugin.js, expo-module.config.json, README.md, LICENSE
```

Note: `plugin/src` is **not** shipped — only the compiled `plugin/build` is, so the plugin **must** be built before publish. `example/` is excluded (it's repo-only).

The `prepare` / `prepublishOnly` scripts (from `expo-module-scripts`) run the build automatically on `npm publish`, but build explicitly first to catch errors early:

```bash
npm run clean
npm run build              # produces build/ AND plugin/build/
npm pack --dry-run         # inspect the tarball contents BEFORE publishing
```

Verify the dry-run output includes `build/index.js`, `build/index.d.ts`, `plugin/build/index.js`, `app.plugin.js`, `expo-module.config.json`, `android/`, `ios/`, `src/`, `README.md`, `LICENSE` — and **excludes** `example/`, `plugin/src`, and any `*.test.*`.

---

## 7. Publishing to npm

```bash
npm login                      # if not already authenticated
npm whoami                     # confirm the right account
git status                     # clean working tree; on the release commit/tag

npm publish --access public --provenance
```

- **`--access public`** — required for a first publish of an unscoped (or scoped) public package.
- **`--provenance`** — publishes signed provenance attestation. This works automatically in a **GitHub Actions** publish workflow with the OIDC `id-token: write` permission (the recommended path), and is the basis for npm **trusted publishing**. For local publishes, provenance requires a supported CI; from a laptop it may be skipped — prefer publishing from a tagged GitHub Actions release so provenance + trusted publishing apply.
- Recommended CI flow: tag push → GH Actions job runs `lint`/`test`/`tsc`/`build`/`pack` → `npm publish --provenance` using a granular automation token or OIDC trusted publishing (no long-lived token).

After publish:

```bash
git push --follow-tags
```

---

## 8. Post-release verification

1. **npm page:** confirm the new version, README render, and "Provenance" badge appear on `https://www.npmjs.com/package/expo-persistent-background-location`.
2. **Clean-install smoke test** in a throwaway app:
   ```bash
   npx create-expo-app@latest pbl-smoke
   cd pbl-smoke
   npx expo install expo-persistent-background-location
   # add the config plugin to app.json
   npx expo prebuild --clean
   npx expo run:android           # and run:ios on macOS
   ```
   Confirm: the plugin injects the permissions (check the generated `android/app/src/main/AndroidManifest.xml` and `ios/.../Info.plist`), `import * as Bg from 'expo-persistent-background-location'` type-checks, `start()` launches the FGS, and `onLocation` fires.
3. **Tarball contents** match the dry-run (`npm view expo-persistent-background-location dist.tarball`, download, untar, eyeball).
4. **Re-run the killed-app survival tests** from [§3](#3-testing-killed-app-survival-on-a-real-device) against the *published* package (not the local path) at least once per minor release.
5. **GitHub release notes** mirror the changelog; attach the device/OEM matrix you tested.

---

## 9. Common pitfalls

- **Forgot to rebuild the plugin before publishing.** `plugin/build` is shipped, `plugin/src` is not. If you publish without `npm run build`, consumers get a broken/old plugin. Always `npm pack --dry-run` first.
- **Edited the plugin but didn't re-prebuild the example.** Config plugins run only at prebuild. Manifest/Info.plist changes are invisible until `npx expo prebuild --clean`.
- **Native name drift.** A function renamed in Kotlin/Swift but not in `ExpoPersistentBackgroundLocationModule.ts` (or vice-versa) fails at runtime, not compile time. Keep all three in lockstep; the names are listed in [§1](#1-how-the-scaffold-was-generated).
- **Testing survival on an emulator/simulator.** Emulators don't reproduce OEM killers, real swipe-kill task removal, or genuine SLC relaunch. Trust only physical-device results.
- **Confusing `force-stop` with `swipe-kill`.** `adb shell am force-stop` (and the Settings "Force stop" button) defeats `START_STICKY` and the boot receiver by design — nothing restarts until the user relaunches. A Recents swipe is the case we actually survive. Don't file a bug for force-stop not resuming.
- **Android 14/15 FGS-type omission.** If `isAndroidForegroundServiceEnabled` is set to `false` (or the manifest is hand-edited), the missing `FOREGROUND_SERVICE_LOCATION` permission / `foregroundServiceType` makes the service throw at start on API 34+. Keep the defaults.
- **Requesting background permission in one step.** Android 11+ and iOS require the two-step foreground→Settings escalation. Don't "fix" the permission flow to ask once — it can't be granted that way.
- **iOS missing usage strings.** Without `NSLocationAlwaysAndWhenInUseUsageDescription` (+ `UIBackgroundModes: location`), the App Store rejects the build and background updates silently fail. The plugin writes these — don't strip them.
- **Loosened peer deps masking a real break.** The `*` peers let the package install anywhere, but the module is built and tested against SDK 56. If a consumer on an older SDK reports breakage, reproduce on SDK 56 first before changing anything.
- **`maxRecordsToPersist` set too low under sustained offline.** Oldest fixes drop past the cap; a courier offline all day with a 100-row cap loses most of the route. Default 10,000 is deliberate — only lower it knowingly.

---

*End users: see [README.md](./README.md). Questions or contributions: open an issue at https://github.com/aashir-athar/expo-persistent-background-location/issues.*
