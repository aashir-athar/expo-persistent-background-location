# Changelog

All notable changes to **expo-persistent-background-location** are documented in
this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because the native ↔ JS bridge is a contract, **any change to a native function
name, event name, or payload field is a breaking change** and will bump the
major version.

## [Unreleased]

## [0.1.0] - 2026-06-16

### Added

- **Android killed-app survival.** A `location`-typed foreground service that
  keeps the GPS stream alive after the task is swiped away, backed by three
  independent restart mechanisms: the `START_STICKY` system restart (reloads its
  config from disk with no JS running), a best-effort `onTaskRemoved` restart,
  and a `BOOT_COMPLETED` receiver that re-arms tracking after a reboot.
- **iOS resume-after-termination.** Significant-location-change monitoring plus
  an Expo AppDelegate subscriber so iOS relaunches the app in the background and
  resumes tracking after a force-quit (within Apple's platform limits — only the
  coarse SLC can wake a terminated app).
- **Native offline buffer + sync.** Every fix is written to an app-private SQLite
  store _before_ it reaches JS, and is optionally flushed to a developer-supplied
  HTTPS `syncUrl` in batches by the native layer — so nothing is lost while the
  JS runtime is gone.
- **Dual Android location engines.** `FusedLocationProviderClient` (battery
  optimal) with an automatic `LocationManager` fallback for de-Googled / AOSP
  devices — no hard Google Play Services requirement.
- **Heuristic motion gate** (opt-in) with optional `ActivityRecognition`
  refinement on Android, used to throttle updates when stationary.
- **New Architecture (TurboModule) ready**, strict-TypeScript API: `start`,
  `stop`, `isRunning`, `getStatus`, `getCurrentPosition`, `getBufferedLocations`,
  `clearBuffer`, `flush`, `requestPermissions`, `getPermissionStatus`,
  `openSettings`, and the `onLocation` / `onMotionChange` / `onProviderChange` /
  `onSync` / `onError` events.
- **Expo config plugin** that writes the iOS `NSLocation*UsageDescription`
  strings and the `location` background mode, and injects the Android
  location / foreground-service / boot permissions — with opt-outs for the
  background-location and activity-recognition asks.
- Two-step **When-In-Use → Always** (iOS) and foreground → background (Android
  11+) permission escalation, with `blocked` / `canAskAgain` detection.

### Security

- Auth headers in `buffer.headers` are persisted (so headless resume can keep
  syncing) but are wiped from app-private storage on `stop()`. Cleartext
  (`http://`) sync URLs are rejected unless `buffer.allowInsecureSync` is set.
  See [SECURITY.md](./SECURITY.md).

[Unreleased]: https://github.com/aashir-athar/expo-persistent-background-location/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aashir-athar/expo-persistent-background-location/releases/tag/v0.1.0
