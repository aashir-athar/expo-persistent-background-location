<div align="center">

# expo-persistent-background-location

### Continuous **background GPS** that survives swipe-to-kill on Android and resumes after termination on iOS — Expo SDK 56, New Architecture.

Keep a continuous location stream alive while your app is backgrounded, **auto-restart it after the app is killed or swiped away on Android** (foreground service + boot receiver), and **resume after termination on iOS** (significant-location-change). Every fix is buffered to a native **SQLite** store *before* it reaches JS and can be synced to your backend over HTTP by the native layer — so nothing is lost while the JS runtime is gone. The free, open-source escape from **TransistorSoft's Android-release paywall**.

<br />

[![npm version](https://img.shields.io/npm/v/expo-persistent-background-location.svg?style=for-the-badge&color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/expo-persistent-background-location)
[![npm downloads](https://img.shields.io/npm/dm/expo-persistent-background-location.svg?style=for-the-badge&color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/expo-persistent-background-location)
[![Expo SDK](https://img.shields.io/badge/Expo%20SDK-56-000020.svg?style=for-the-badge&logo=expo&logoColor=white)](https://docs.expo.dev/versions/v56.0.0/)
[![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-3DDC84.svg?style=for-the-badge&logo=android&logoColor=white)](#platform-support)

[![License](https://img.shields.io/npm/l/expo-persistent-background-location.svg?style=flat-square&color=blue)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?style=flat-square&logo=typescript&logoColor=white)](#)
[![New Architecture](https://img.shields.io/badge/New%20Architecture-ready-9457EB.svg?style=flat-square&logo=react&logoColor=white)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](#contributing)

```
                       ┌──────────────────────────────────────────────────────┐
   OS location  ─────► │  Native tracker  (Kotlin FGS / Swift CoreLocation)   │
   (GPS / fused / SLC) │                                                       │
                       │   ① write fix ──► SQLite buffer  (survives app kill)  │
                       │   ② emit  ──────► onLocation  (when JS is attached)   │
                       │   ③ batch ──────► HTTP sync ──► your backend (offline-│
                       └────────────┬──────────────────────────────tolerant)──┘
                                    │
                  app killed/swiped │ app alive
              ┌─────────────────────┴─────────────────────┐
              ▼                                            ▼
   START_STICKY restart · onTaskRemoved          onLocation / onMotionChange
   restart · BOOT_COMPLETED receiver (Android)    onProviderChange / onSync /
   SLC relaunch via AppDelegate (iOS)             onError  ──►  Your UI / store
```

</div>

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Features](#features)
- [Platform support](#platform-support)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick start](#quick-start)
- [Complete example](#complete-example)
- [API reference](#api-reference)
  - [Lifecycle](#lifecycle)
  - [Buffer & sync](#buffer--sync)
  - [Permissions](#permissions)
  - [Events](#events)
  - [Types](#types)
  - [Errors](#errors)
- [How killed-app survival works](#how-killed-app-survival-works)
- [Battery & accuracy notes](#battery--accuracy-notes)
- [FAQ & troubleshooting](#faq--troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Why this exists

Continuous background location on React Native / Expo has one production-grade native library — **[react-native-background-geolocation](https://github.com/transistorsoft/react-native-background-geolocation)** by TransistorSoft. It is excellent. It is also **paid for Android release builds**: debug builds are free, but shipping to the Play Store requires a per-app purchased license key. iOS is free; Android is not. For an indie dev or an OSS project, that licensing wall is a real barrier.

The Expo-blessed alternative, **`expo-location`**, deliberately documents that it **cannot keep tracking after the app is force-quit**. From the Expo docs' platform-limitation note: background location updates *"stop when the app is terminated by the user."* And there is a long-standing, never-fully-closed thread about killed-app behaviour — **[expo/expo#3535](https://github.com/expo/expo/issues/3535)** — where people keep rediscovering that `expo-location`'s background task does not survive a swipe-to-kill on Android (the `TaskManager` task is gone the moment the process dies; nothing relaunches it).

This package fills that exact gap, for free, under MIT:

- On **Android**, a `location`-typed **foreground service** keeps the process alive after swipe-to-kill, `START_STICKY` lets the system restart the service (reloading config from disk), `onTaskRemoved` does a best-effort restart, and a `BOOT_COMPLETED` receiver re-arms tracking after reboot.
- On **iOS**, **significant-location-change (SLC)** monitoring lets the OS relaunch the app in the background after the user force-quits it, and the bundled `AppDelegate` subscriber re-attaches the tracker on relaunch.
- Every fix is written to a **native SQLite buffer first**, then delivered to JS and/or **HTTP-synced** by the native layer — so a dead JS runtime or an offline network never loses data.

It does **not** try to out-engineer TransistorSoft. It is honest about what each OS actually permits (see [Platform support](#platform-support)) — particularly the hard iOS force-quit limit and Android OEM battery killers.

---

## Features

- **Continuous background GPS** — standard location updates while foregrounded and backgrounded, on both platforms.
- **Survives swipe-to-kill on Android** — foreground service + `START_STICKY` + `onTaskRemoved` restart + `BOOT_COMPLETED` boot receiver.
- **Resumes after termination on iOS** — significant-location-change wakes the app; the bundled AppDelegate subscriber re-attaches the tracker.
- **Native SQLite buffer** — every fix is persisted *before* it reaches JS, so nothing is lost while the runtime is gone. Configurable hard cap so an offline device never fills the disk.
- **Offline HTTP sync** — the native layer batches buffered fixes to your `syncUrl` (POST/PUT, custom headers) with no JS required; survives network outages and retries.
- **Motion gating (optional)** — activity-recognition throttles location requests when the device is stationary to save battery, and resumes on movement.
- **One-shot position** — `getCurrentPosition()` for a single fresh fix without starting continuous tracking.
- **Rich `LocationFix`** — lat/lng, accuracy, altitude, speed, heading (with their accuracies), motion/activity, battery level & charging, mock-location flag, and provider.
- **Typed events** — `onLocation`, `onMotionChange`, `onProviderChange`, `onSync`, `onError`, each returning an `EventSubscription` with `.remove()`.
- **Two-step background permission** — handles the Android 11+ foreground-then-Settings escalation for `ACCESS_BACKGROUND_LOCATION` automatically.
- **Config plugin** — injects the iOS usage strings + `UIBackgroundModes` and the Android location / foreground-service / boot permissions, with opt-outs for Play Store review.
- **Safe web stub** — every method becomes a typed no-op (or throws `UnsupportedPlatformError` where a return value is impossible) so cross-platform builds don't break.
- **Strict TypeScript** — `LocationFix`, `StartOptions`, `TrackingStatus`, `PermissionResult`, `SyncResult`, the event payloads, and error classes are all fully typed.
- **New Architecture** — built on `expo-modules-core` for SDK 56 (Fabric / TurboModules).

---

## Platform support

| Platform     | Background while alive | After **force-quit / swipe-kill**                                                 | After **reboot**                       |
| ------------ | ---------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| **Android 7+** (minSdk 24) | Full — foreground service keeps continuous GPS running with the screen off. | Best-effort restart via `START_STICKY` + `onTaskRemoved`. **OEM battery killers can defeat this** (see below). | Yes, via `BOOT_COMPLETED` receiver when `restartOnBoot` is set. |
| **iOS 15.1+** | Full — standard updates continue backgrounded with the `location` background mode. | **Only significant-location-change (~500 m of movement) can wake the app.** Continuous high-frequency GPS does **not** survive force-quit — this is an Apple OS limit, not a bug. | N/A — iOS relaunches via SLC on next significant movement, not on boot. |
| **Web**      | No-op stub.            | —                                                                                 | —                                      |

### Brutally honest caveats — read before you ship

> **iOS force-quit is a hard wall.** When a user force-quits your app (swipe up in the app switcher), iOS **will not** resume continuous GPS. The *only* mechanism Apple provides to relaunch a force-quit app for location is **significant-location-change**, which fires roughly every **500 metres** (cell-tower / Wi-Fi granularity), not on a timer and not at GPS precision. If your product needs metre-level continuous tracking through a force-quit on iOS, **no library can deliver that** — including the paid ones. Set `useSignificantChanges: true` (the default) to get the coarse SLC relaunch behaviour, and design your UX around it.

> **Android OEM battery killers are explicitly out of scope for v1.** Aggressive vendor power managers — **Xiaomi/MIUI, Huawei/EMUI, Samsung, OnePlus/OPPO/Vivo (BBK), and others** — will silently kill background processes (including foreground services) to save battery, regardless of what the framework promises. We rely on the documented Android framework behaviour (FGS, `START_STICKY`, boot receiver); we do **not** ship OEM-specific autostart hacks or ML-driven battery-optimization workarounds in v1. Direct affected users to [dontkillmyapp.com](https://dontkillmyapp.com/) and ask them to disable battery optimization for your app. This is a known, documented limitation.

---

## Installation

```bash
npx expo install expo-persistent-background-location
```

Or with raw npm / yarn / pnpm:

```bash
npm  install expo-persistent-background-location
yarn add     expo-persistent-background-location
pnpm add     expo-persistent-background-location
```

> Requires **Expo SDK 56** with the **New Architecture** enabled (the default). This is a custom native module, so it does **not** run in Expo Go — you need a **dev client** or an EAS build.

After installing and adding the [config plugin](#configuration):

```bash
npx expo prebuild --clean
npx expo run:android   # or: npx expo run:ios
```

---

## Configuration

### 1. Register the config plugin

The config plugin writes the platform glue the OS requires for background location — the iOS usage-description strings (the App Store rejects builds without them) plus the `UIBackgroundModes`, and the Android location / foreground-service / boot permissions. Add it to your [`app.json`](./example/app.json) / `app.config.ts`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-persistent-background-location",
        {
          "locationWhenInUsePermission": "Allow $(PRODUCT_NAME) to use your location while tracking your route.",
          "locationAlwaysAndWhenInUsePermission": "Allow $(PRODUCT_NAME) to keep tracking your route in the background.",
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true,
          "isActivityRecognitionEnabled": true
        }
      ]
    ]
  }
}
```

### 2. Plugin options

All options are optional — sensible defaults are applied. iOS keys map to `Info.plist`; Android keys gate which permissions are injected into the merged `AndroidManifest.xml`.

| Option                                | Type             | Default              | Effect                                                                                                          |
| ------------------------------------- | ---------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `locationWhenInUsePermission`         | `string`         | sensible default     | iOS `NSLocationWhenInUseUsageDescription`.                                                                      |
| `locationAlwaysAndWhenInUsePermission`| `string`         | sensible default     | iOS `NSLocationAlwaysAndWhenInUseUsageDescription` — required for "Always" / background.                        |
| `locationAlwaysPermission`            | `string`         | sensible default     | iOS `NSLocationAlwaysUsageDescription` (legacy, still read by older OSes).                                      |
| `motionPermission`                    | `string \| false`| sensible default     | iOS `NSMotionUsageDescription`. Set to `false` to omit it (only needed if you enable `motion.enabled`).         |
| `enableBackgroundFetch`               | `boolean`        | `true`               | Add the `fetch` / `processing` iOS background modes for sync wake-ups (the `location` mode is always added).    |
| `isAndroidBackgroundLocationEnabled`  | `boolean`        | `true`               | Inject `ACCESS_BACKGROUND_LOCATION`. Set `false` to have the plugin strip it (eases Play Store review).         |
| `isAndroidForegroundServiceEnabled`   | `boolean`        | `true`               | Inject `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, and `POST_NOTIFICATIONS`.                           |
| `isActivityRecognitionEnabled`        | `boolean`        | `true`               | Inject `ACTIVITY_RECOGNITION` (needed for `motion.enabled`). Set `false` to strip it.                           |

The plugin always ensures these Android permissions regardless of options: `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `WAKE_LOCK`, `INTERNET`, `ACCESS_NETWORK_STATE`, `RECEIVE_BOOT_COMPLETED`.

After editing the plugin config, re-run `npx expo prebuild --clean`.

---

## Quick start

```ts
import {
  requestPermissions,
  start,
  onLocation,
} from 'expo-persistent-background-location';

async function beginTracking() {
  // 1. Ask for location authorization (foreground + background "Always").
  const perm = await requestPermissions({ background: true });
  if (perm.foreground !== 'granted') return;

  // 2. Subscribe to fixes (fires foregrounded, backgrounded, and after resume).
  const sub = onLocation((fix) => {
    console.log(`${fix.latitude}, ${fix.longitude} (±${fix.accuracy ?? '?'}m)`);
  });

  // 3. Start continuous background tracking.
  await start({
    accuracy: 'high',
    distanceFilter: 10,
    interval: 5000,
    foregroundService: {
      notificationTitle: 'Tracking your route',
      notificationBody: 'Tap to return to the app.',
    },
    buffer: { persist: true /* , syncUrl: 'https://api.example.com/locations' */ },
  });

  // …later: sub.remove(); await stop();
}
```

Tracking now continues with the screen off, after you background the app, and — on Android — after the task is swiped away (see [How killed-app survival works](#how-killed-app-survival-works)).

---

## Complete example

A minimal run-tracker that requests permission, starts background tracking, watches fixes stream in live (including after the app is backgrounded / swiped), accumulates distance, and inspects the offline buffer. This mirrors [`example/App.tsx`](./example/App.tsx).

```tsx
import * as Bg from 'expo-persistent-background-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [authorization, setAuthorization] = useState<string>('unknown');
  const [running, setRunning] = useState(false);
  const [bufferedCount, setBufferedCount] = useState(0);
  const [fixes, setFixes] = useState<Bg.LocationFix[]>([]);
  const distanceRef = useRef(0);
  const lastRef = useRef<Bg.LocationFix | null>(null);
  const [distance, setDistance] = useState(0);

  const refreshStatus = useCallback(async () => {
    const status = await Bg.getStatus();
    setRunning(status.running);
    setBufferedCount(status.bufferedCount);
    setAuthorization(status.authorization);
  }, []);

  useEffect(() => {
    Bg.getPermissionStatus().then((p) => setAuthorization(p.status));
    refreshStatus();

    const locationSub = Bg.onLocation((fix) => {
      setFixes((prev) => [fix, ...prev].slice(0, 50));
      const last = lastRef.current;
      if (last) {
        distanceRef.current += haversine(last.latitude, last.longitude, fix.latitude, fix.longitude);
        setDistance(distanceRef.current);
      }
      lastRef.current = fix;
    });

    const motionSub = Bg.onMotionChange(({ isMoving, activity }) => {
      console.log(`[motion] ${isMoving ? 'moving' : 'stationary'} (${activity})`);
    });

    const syncSub = Bg.onSync((result) => {
      console.log(`[sync] ${result.success ? 'ok' : 'fail'} count=${result.count}`);
      refreshStatus();
    });

    const errorSub = Bg.onError((e) => console.warn(`[error] ${e.code}: ${e.message}`));

    return () => {
      locationSub.remove();
      motionSub.remove();
      syncSub.remove();
      errorSub.remove();
    };
  }, [refreshStatus]);

  const onStart = useCallback(async () => {
    const perm = await Bg.requestPermissions({ background: true });
    setAuthorization(perm.status);
    if (perm.foreground !== 'granted') return;

    await Bg.start({
      accuracy: 'high',
      distanceFilter: 10,
      interval: 5000,
      restartOnBoot: true,
      foregroundService: {
        notificationTitle: 'Run in progress',
        notificationBody: 'Tracking your route — tap to return.',
      },
      buffer: { persist: true /* , syncUrl: 'https://api.example.com/locations' */ },
      motion: { enabled: true },
    });
    refreshStatus();
  }, [refreshStatus]);

  const onStop = useCallback(async () => {
    await Bg.stop();
    refreshStatus();
  }, [refreshStatus]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Persistent Background Location</Text>
      <View style={styles.row}>
        <Stat label="Auth" value={authorization} />
        <Stat label="Running" value={running ? 'yes' : 'no'} />
        <Stat label="Buffered" value={String(bufferedCount)} />
        <Stat label="Distance" value={`${(distance / 1000).toFixed(2)} km`} />
      </View>

      <View style={styles.buttons}>
        <Button title="Start" onPress={onStart} disabled={running} />
        <Button title="Stop" onPress={onStop} disabled={!running} />
        <Button title="Flush" onPress={() => Bg.flush().then(refreshStatus)} />
        <Button title="Clear" onPress={() => Bg.clearBuffer().then(refreshStatus)} />
      </View>

      <FlatList
        style={styles.list}
        data={fixes}
        keyExtractor={(fix, i) => `${fix.timestamp}-${i}`}
        renderItem={({ item }) => (
          <View style={styles.fix}>
            <Text style={styles.fixCoords}>
              {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
            </Text>
            <Text style={styles.fixMeta}>
              ±{item.accuracy?.toFixed(0) ?? '?'}m · {item.isMoving ? item.activity : 'still'} ·{' '}
              {item.speed != null ? `${(item.speed * 3.6).toFixed(1)} km/h` : '—'}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#0b0f14' },
  title: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 16, fontWeight: '700', color: '#3DDC84' },
  statLabel: { fontSize: 12, color: '#8a94a6' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  list: { flex: 1 },
  fix: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1c2530' },
  fixCoords: { color: '#fff', fontVariant: ['tabular-nums'] },
  fixMeta: { color: '#8a94a6', fontSize: 12 },
});
```

---

## API reference

All functions are imported from the package root. Async functions return a `Promise`; event subscriptions return an `EventSubscription` from `expo-modules-core` (call `.remove()` to unsubscribe). On web, every method is a typed no-op except where it cannot return a sensible value, in which case it throws `UnsupportedPlatformError`.

### Lifecycle

#### `start(options?)`

```ts
start(options?: StartOptions): Promise<void>;
```

Start (or **reconfigure**) continuous background tracking. **Idempotent** — calling `start` again reconfigures the running tracker rather than spawning a second one.

- On **Android**: launches a `location`-typed foreground service with the configured notification and, when `restartOnBoot` is set, arms the boot receiver.
- On **iOS**: begins standard location updates plus, when `useSignificantChanges` is set, significant-location-change monitoring so the OS can relaunch the app after force-quit.

Throws `LocationPermissionError` when authorization is missing, and `UnsupportedPlatformError` on web. See [`StartOptions`](#startoptions) for every field.

#### `stop()`

```ts
stop(): Promise<void>;
```

Stop tracking, tear down the foreground service, and disarm boot restart. No-op on web.

#### `isRunning()`

```ts
isRunning(): boolean;
```

Whether the native tracker is currently running (synchronous). Returns `false` on web.

#### `getStatus()`

```ts
getStatus(): Promise<TrackingStatus>;
```

Snapshot of the current tracker state, authorization, and buffer size. See [`TrackingStatus`](#trackingstatus).

#### `getCurrentPosition(options?)`

```ts
getCurrentPosition(options?: CurrentPositionOptions): Promise<LocationFix>;
```

Resolve a single fresh fix **without** starting continuous tracking — a one-shot "where am I now". Throws `UnsupportedPlatformError` on web.

| Option         | Type              | Default  | Range          | Effect                                                  |
| -------------- | ----------------- | -------- | -------------- | ------------------------------------------------------- |
| `accuracy`     | `LocationAccuracy`| `'high'` | —              | Desired accuracy for the one-shot fix.                  |
| `timeoutMs`    | `number`          | `15000`  | `1000–300000`  | Reject after this many ms without a fix.                |
| `maximumAgeMs` | `number`          | `0`      | `0–86400000`   | Accept a cached fix no older than this (`0` = force fresh). |

### Buffer & sync

#### `getBufferedLocations(limit?)`

```ts
getBufferedLocations(limit?: number): Promise<LocationFix[]>;
```

Read buffered fixes from the native SQLite store, **newest first** — these are the fixes captured while the app was killed or offline. Pass `0` (the default) for all rows. Returns `[]` on web.

#### `clearBuffer()`

```ts
clearBuffer(): Promise<number>;
```

Delete every buffered fix. Resolves with the number of rows removed. Returns `0` on web.

#### `flush()`

```ts
flush(): Promise<SyncResult>;
```

Force an immediate sync of the buffer to the configured `syncUrl`. Resolves with a [`SyncResult`](#syncresult). On web resolves with `{ success: false, count: 0, status: null, error: 'unsupported-platform' }`.

### Permissions

#### `getPermissionStatus()`

```ts
getPermissionStatus(): Promise<PermissionResult>;
```

Resolve the current foreground + background location authorization without prompting. See [`PermissionResult`](#permissionresult).

#### `requestPermissions(options?)`

```ts
requestPermissions(options?: { background?: boolean }): Promise<PermissionResult>;
```

Prompt for location authorization. By default (`background: true`) this also requests background ("Always") access. On **Android 11+** the OS mandates a **two-step** escalation — foreground is granted first, then the user is sent to Settings for background — which the native layer drives automatically. See [`PermissionResult`](#permissionresult) and the [two-step note](#android-1115-foreground-service-and-the-two-step-background-prompt) below.

| Option       | Type      | Default | Effect                                              |
| ------------ | --------- | ------- | --------------------------------------------------- |
| `background` | `boolean` | `true`  | Also request background ("Always") authorization.   |

#### `openSettings()`

```ts
openSettings(): void;
```

Open the host app's system settings page. Use this when a permission is `blocked` (the user can no longer be prompted). No-op on web.

### Events

Each subscription function returns an `EventSubscription`; call `.remove()` to unsubscribe. On web they return a no-op subscription.

#### `onLocation(listener)`

```ts
onLocation(listener: (fix: LocationFix) => void): EventSubscription;
```

Subscribe to location fixes. Fires while the app is foregrounded, backgrounded, and — on Android — after the app is swiped away (delivered the moment the JS runtime is re-attached, in addition to being buffered/synced natively the whole time).

#### `onMotionChange(listener)`

```ts
onMotionChange(listener: (event: MotionChangeEvent) => void): EventSubscription;
```

Subscribe to moving ⇄ stationary transitions from the motion gate. See [`MotionChangeEvent`](#event-payloads).

#### `onProviderChange(listener)`

```ts
onProviderChange(listener: (event: ProviderChangeEvent) => void): EventSubscription;
```

Subscribe to location-provider / authorization changes (e.g. the user toggles GPS off). See [`ProviderChangeEvent`](#event-payloads).

#### `onSync(listener)`

```ts
onSync(listener: (event: SyncResult) => void): EventSubscription;
```

Subscribe to buffer-sync results — fires each time the native layer flushes the buffer to `syncUrl`. See [`SyncResult`](#syncresult).

#### `onError(listener)`

```ts
onError(listener: (event: LocationErrorEvent) => void): EventSubscription;
```

Subscribe to recoverable and fatal tracker errors. See [`LocationErrorEvent`](#event-payloads).

### Types

The full canonical definitions live in [`src/ExpoPersistentBackgroundLocation.types.ts`](./src/ExpoPersistentBackgroundLocation.types.ts). The key shapes:

#### Enumerations

```ts
type LocationAccuracy = 'lowest' | 'low' | 'balanced' | 'high' | 'highest';

type LocationAuthorizationStatus =
  | 'granted'      // background tracking permitted ("Always" / ACCESS_BACKGROUND_LOCATION)
  | 'whenInUse'    // only-while-using; background limited
  | 'denied'
  | 'undetermined'
  | 'restricted'
  | 'blocked';     // cannot prompt again — needs a Settings trip

type MotionActivityType =
  | 'still' | 'walking' | 'running' | 'on_foot' | 'on_bicycle' | 'in_vehicle' | 'unknown';

type IOSActivityType =
  | 'other' | 'automotiveNavigation' | 'fitness' | 'otherNavigation' | 'airborne';
```

`LocationAccuracy` maps to platform priorities — `high` → Android `PRIORITY_HIGH_ACCURACY` / iOS `kCLLocationAccuracyNearestTenMeters`; `highest` → `PRIORITY_HIGH_ACCURACY` / `kCLLocationAccuracyBest`; `balanced` → `PRIORITY_BALANCED_POWER` / `kCLLocationAccuracyHundredMeters`; `low` → `PRIORITY_LOW_POWER` / `kCLLocationAccuracyKilometer`; `lowest` → `PRIORITY_PASSIVE` / `kCLLocationAccuracyThreeKilometers`.

#### `LocationFix`

A single location sample. Every optional numeric field is `null` when the platform did not report it; `latitude`, `longitude`, and `timestamp` are always present.

| Key                | Type                  | Notes                                                                          |
| ------------------ | --------------------- | ------------------------------------------------------------------------------ |
| `id`               | `string \| null`      | Stable SQLite row id; `null` for live, not-yet-persisted fixes.                |
| `latitude`         | `number`              | Decimal degrees (WGS-84).                                                      |
| `longitude`        | `number`              | Decimal degrees (WGS-84).                                                      |
| `accuracy`         | `number \| null`      | Horizontal accuracy radius in metres (68% confidence).                         |
| `altitude`         | `number \| null`      | Metres above the WGS-84 ellipsoid.                                             |
| `altitudeAccuracy` | `number \| null`      | Vertical accuracy in metres.                                                   |
| `speed`            | `number \| null`      | Ground speed in m/s.                                                           |
| `speedAccuracy`    | `number \| null`      | Speed accuracy in m/s.                                                         |
| `heading`          | `number \| null`      | Course in degrees (0–360, clockwise from true north).                          |
| `headingAccuracy`  | `number \| null`      | Heading accuracy in degrees.                                                   |
| `timestamp`        | `number`              | Unix **epoch milliseconds** (UTC) when the fix was acquired.                   |
| `isMoving`         | `boolean`             | Whether the motion gate considers the device moving.                          |
| `activity`         | `MotionActivityType`  | Best-effort motion classification.                                            |
| `batteryLevel`     | `number \| null`      | `[0, 1]`, or `null` when unavailable.                                          |
| `isCharging`       | `boolean \| null`     | `null` when unavailable.                                                       |
| `mocked`           | `boolean`             | `true` when from a mock / test provider.                                       |
| `provider`         | `string \| null`      | e.g. `'fused'`, `'gps'`, `'network'`, `'slc'`, `'visit'`.                       |

#### `StartOptions`

Every field has a sensible default (the single source of truth for defaults is `normalizeStartOptions` in [`src/index.ts`](./src/index.ts)).

| Option                             | Type                       | Default        | Notes                                                                                   |
| ---------------------------------- | -------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `accuracy`                         | `LocationAccuracy`         | `'high'`       | Accuracy / power trade-off.                                                              |
| `distanceFilter`                   | `number`                   | `10`           | Min movement in metres between delivered fixes. `0` delivers every fix.                  |
| `interval`                         | `number`                   | `5000`         | Desired update interval in ms (Android).                                                 |
| `fastestInterval`                  | `number`                   | `interval / 2` | Fastest interval the app can handle, in ms (Android).                                    |
| `activityType`                     | `IOSActivityType`          | `'other'`      | iOS `CLActivityType` hint.                                                               |
| `showsBackgroundLocationIndicator` | `boolean`                  | `true`         | Show the blue background-location bar (iOS 11+).                                         |
| `pausesUpdatesAutomatically`       | `boolean`                  | `false`        | Let Core Location auto-pause when stationary (iOS).                                      |
| `stopOnTerminate`                  | `boolean`                  | `false`        | If `true`, tracking ends on termination and does **not** restart.                       |
| `restartOnBoot`                    | `boolean`                  | `true`         | Re-arm tracking after reboot via the boot receiver (Android).                           |
| `useSignificantChanges`            | `boolean`                  | `true`         | SLC + region monitoring so iOS can relaunch after force-quit. Disabling = iOS stops permanently on force-quit. |
| `debug`                            | `boolean`                  | `false`        | Emit verbose native logs (`adb logcat` / Xcode console).                                 |
| `foregroundService`                | `ForegroundServiceOptions` | see below      | Android notification (iOS ignores this block).                                           |
| `buffer`                           | `BufferOptions`            | see below      | Offline persistence + HTTP sync.                                                         |
| `motion`                           | `MotionOptions`            | see below      | Activity-recognition gating.                                                             |

**`foregroundService`** (Android only — the persistent notification is what keeps the process alive after swipe-kill):

| Option                    | Type      | Default                                                       |
| ------------------------- | --------- | ------------------------------------------------------------ |
| `notificationTitle`       | `string`  | `'Location tracking active'`                                 |
| `notificationBody`        | `string`  | `'Your location is being tracked in the background.'`        |
| `notificationChannelId`   | `string`  | `'persistent_background_location'`                           |
| `notificationChannelName` | `string`  | `'Background location'`                                       |
| `notificationColor`       | `string`  | `#RRGGBB` or `#AARRGGBB` accent colour. Default: none.       |
| `notificationIcon`        | `string`  | Small-icon drawable resource name. Default: the app icon.    |
| `tapToOpenApp`            | `boolean` | `true` — tapping the notification re-opens the host app.     |

**`buffer`** (when `persist` is on, every fix is written to SQLite *before* JS delivery; when `syncUrl` is set, the native layer batches to your backend with no JS required):

| Option                | Type             | Default                | Range          | Notes                                                          |
| --------------------- | ---------------- | ---------------------- | -------------- | -------------------------------------------------------------- |
| `persist`             | `boolean`        | `true` if `syncUrl` set, else `false` | —      | Persist fixes to the SQLite buffer.                            |
| `syncUrl`             | `string`         | none                   | —              | HTTPS endpoint that receives batched fixes as a JSON array.   |
| `httpMethod`          | `'POST' \| 'PUT'`| `'POST'`               | —              | HTTP method for sync requests.                                 |
| `headers`             | `Record<string,string>` | `{}`            | —              | Extra HTTP headers, e.g. an `Authorization` token.            |
| `batchSize`           | `number`         | `50`                   | `1–1000`       | Max fixes per sync request.                                    |
| `autoSync`            | `boolean`        | `true` if `syncUrl` set | —             | Automatically flush the buffer in the background.             |
| `maxRecordsToPersist` | `number`         | `10000`                | `100–1000000`  | Hard cap; oldest rows drop once exceeded so disk can't fill.  |

**`motion`** (requires `ACTIVITY_RECOGNITION` on Android 10+ / motion usage description on iOS):

| Option                | Type      | Default | Range        | Notes                                                          |
| --------------------- | --------- | ------- | ------------ | -------------------------------------------------------------- |
| `enabled`             | `boolean` | `false` | —            | Throttle location when stationary; resume on movement.        |
| `stationaryTimeoutMs` | `number`  | `60000` | `0–86400000` | Continuous stillness before throttling kicks in.              |

#### `TrackingStatus`

```ts
interface TrackingStatus {
  running: boolean;
  lastFix: LocationFix | null;
  bufferedCount: number;                    // fixes currently in the SQLite buffer
  authorization: LocationAuthorizationStatus;
  locationServicesEnabled: boolean;         // device GPS / network switched on
  isMoving: boolean;
  trackingSince: number | null;             // epoch ms the session began, or null
}
```

#### `PermissionResult`

```ts
interface PermissionResult {
  status: LocationAuthorizationStatus;       // combined — 'granted' only when background is permitted
  foreground: LocationAuthorizationStatus;
  background: LocationAuthorizationStatus;
  canAskAgain: boolean;                      // false → must use openSettings()
}
```

#### `SyncResult`

```ts
interface SyncResult {
  success: boolean;
  count: number;                             // fixes included in the batch
  status: number | null;                     // HTTP status, or null if skipped
  error: string | null;                      // message when success is false
}
```

#### Event payloads

```ts
interface MotionChangeEvent {
  isMoving: boolean;
  activity: MotionActivityType;
  fix: LocationFix | null;
}

interface ProviderChangeEvent {
  enabled: boolean;        // any provider enabled
  gpsEnabled: boolean;     // Android GPS provider (mirrors `enabled` on iOS)
  networkEnabled: boolean; // Android network provider (mirrors `enabled` on iOS)
  authorization: LocationAuthorizationStatus;
}

interface LocationErrorEvent {
  code: string;            // e.g. 'ERR_LOCATION_UNAVAILABLE'
  message: string;
  fatal: boolean;          // true when the tracker had to stop
}
```

### Errors

#### `LocationPermissionError`

Thrown by `start()` when tracking is started without the required authorization. Carries a `status: LocationAuthorizationStatus` field. `instanceof`-checkable.

```ts
import { start, LocationPermissionError } from 'expo-persistent-background-location';

try {
  await start();
} catch (e) {
  if (e instanceof LocationPermissionError) {
    console.log('Need permission, status was', e.status);
  }
}
```

#### `UnsupportedPlatformError`

Thrown by methods that cannot return a sensible value on web (e.g. `start`, `getCurrentPosition`). `instanceof`-checkable.

---

## How killed-app survival works

This is the heart of the package. The mechanisms are different on each OS, and each has honest limits.

### Android — surviving swipe-to-kill

Four layers, in order of how the process gets back:

1. **Foreground service keeps the process alive.** When you call `start()`, the module starts a `location`-typed foreground service with the persistent notification you configured. A foreground service is the only sanctioned way to run continuous background work; while it's up, the OS keeps your process resident and GPS streaming with the screen off. Swiping the app away from Recents removes the *task* but the service (and thus tracking) keeps running.
2. **`START_STICKY` system restart.** If the system reclaims the process under memory pressure, `START_STICKY` tells Android to recreate the service when resources free up. On recreation there is **no JS** — so the service **reloads its `StartOptions` from disk** (they were persisted on the last `start()`) and resumes natively. Fixes continue to flow into the SQLite buffer and sync; `onLocation` re-delivers once the JS runtime re-attaches.
3. **`onTaskRemoved` best-effort restart.** When the task is explicitly swiped away, the service's `onTaskRemoved` schedules a restart of itself as a defensive measure for OEMs that tear the service down with the task.
4. **`BOOT_COMPLETED` receiver.** When `restartOnBoot` is `true` (default), a boot receiver re-arms tracking after the device reboots, again reloading config from disk.

**The honest limit:** layers 2–4 are *best-effort*. **OEM battery killers** (MIUI/Xiaomi, EMUI/Huawei, Samsung, OnePlus/OPPO/Vivo) routinely kill foreground services and block autostart in ways the Android framework cannot override. v1 does **not** ship vendor-specific autostart hacks. Tell affected users to disable battery optimization for your app and consult [dontkillmyapp.com](https://dontkillmyapp.com/).

### iOS — resuming after force-quit

iOS gives you exactly **two** background-relaunch mechanisms for location, and only one survives a user force-quit:

- **While the app is merely backgrounded** (not force-quit): the `location` background mode + standard updates keep continuous GPS flowing.
- **After the user force-quits** (swipe-up in the app switcher): the system terminates your process and **will not** restart it for standard updates. The *only* thing that relaunches a force-quit app is **significant-location-change (SLC)** — and only when the device moves ~**500 m**. On that relaunch, iOS spins your app up in the background and calls into the bundled `ExpoPersistentBackgroundLocationAppDelegate` subscriber, which re-attaches the tracker, records the fix to the SQLite buffer, and (if configured) syncs.

So with `useSignificantChanges: true` (default), an iOS app that's been force-quit will **resume coarse (~500 m) tracking** on the next significant move — but it will **not** resume metre-level continuous GPS until the user reopens the app. **No library can change this; it is an Apple OS constraint.** If you set `useSignificantChanges: false`, iOS tracking stops permanently on force-quit.

---

## Battery & accuracy notes

- **`accuracy` is the biggest lever.** `highest` (`kCLLocationAccuracyBest` / `PRIORITY_HIGH_ACCURACY`) is the most power-hungry; `balanced` is the usual sweet spot for delivery/fitness apps that don't need sub-10 m precision. Drop to `low`/`lowest` for passive presence tracking.
- **`distanceFilter` saves battery when stationary.** A larger filter (e.g. `25`–`50` m) means fewer wake-ups and fewer fixes when the user isn't really moving. `0` delivers every fix and is the most expensive.
- **`interval` / `fastestInterval` (Android)** bound how often the fused provider may deliver. Longer intervals = less battery.
- **`motion.enabled` is the smart lever.** With activity-recognition gating on, location requests are throttled when the device has been still for `stationaryTimeoutMs` and resumed on movement — substantial savings for apps that sit idle a lot. Requires the activity-recognition permission.
- **The foreground-service notification is mandatory on Android.** You cannot run continuous background location without it; users will see it, so make the title/body honest and useful (`tapToOpenApp` lets them jump back in).
- **`showsBackgroundLocationIndicator` (iOS)** shows the blue status bar while tracking in the background — required for App Store transparency; leave it on.
- **Sync batching** — a larger `batchSize` means fewer HTTP requests (less radio wake-up) at the cost of more data lost if a single batch fails. `autoSync` flushes in the background; `flush()` forces it.

---

## FAQ & troubleshooting

<details>
<summary><strong>Does this keep tracking after the app is force-quit on iOS?</strong></summary>

Not at GPS precision — and no library can. iOS only relaunches a force-quit app via **significant-location-change** (~500 m granularity). With `useSignificantChanges: true` (default) you get coarse resume on the next significant move; you do **not** get continuous metre-level GPS until the user reopens the app. This is an Apple OS limit. See [How killed-app survival works](#how-killed-app-survival-works).
</details>

<details>
<summary><strong>My Android tracking dies when the screen is off / after a few minutes on a Xiaomi/Huawei/Samsung phone.</strong></summary>

That's an **OEM battery killer**, not a bug in this package. Aggressive vendor power managers kill foreground services and block autostart regardless of the Android framework. v1 deliberately does not ship vendor hacks. Ask the user to: disable battery optimization for your app, enable "Autostart" (MIUI/EMUI), and lock the app in Recents. See [dontkillmyapp.com](https://dontkillmyapp.com/) for per-vendor steps.
</details>

<details>
<summary><strong>Android 14/15 build fails with a foreground-service-type error.</strong></summary>

Android 14 (API 34) requires a declared `foregroundServiceType` and the `FOREGROUND_SERVICE_LOCATION` permission for location services; Android 15 (API 35) tightens timing rules. The [config plugin](#configuration) injects `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, and `POST_NOTIFICATIONS` when `isAndroidForegroundServiceEnabled` is `true` (the default), and the native service declares the `location` type. If you stripped these via plugin options or a custom manifest, restore them and re-run `npx expo prebuild --clean`. The user must have granted location permission *before* the location-typed service starts.
</details>

<details>
<summary><strong>I asked for permission but only got <code>whenInUse</code> — background isn't working.</strong></summary>

Background ("Always") location is a **two-step** grant on Android 11+ and iOS. The OS grants foreground first, then requires a **separate trip to Settings** to upgrade to "Allow all the time". `requestPermissions({ background: true })` drives this escalation automatically, but the user must actually choose "Allow all the time" in Settings. Check `result.background` and `result.status` — `status` is only `granted` when background is permitted. If `canAskAgain` is `false`, send the user to `openSettings()`.
</details>

<details>
<summary><strong>iOS prompt never offers "Always", only "While Using".</strong></summary>

iOS shows "While Using the App" first by design, then later surfaces a one-time "Keep Always Allow?" upgrade prompt after the app has used background location. Make sure your `Info.plist` has `NSLocationAlwaysAndWhenInUseUsageDescription` (the [config plugin](#configuration) writes it) and that `UIBackgroundModes` includes `location`. You cannot force the "Always" choice up-front; design your onboarding to explain why you need it.
</details>

<details>
<summary><strong>The buffer keeps growing and never syncs.</strong></summary>

Sync only runs when `buffer.syncUrl` is set. Without it, fixes persist to SQLite (if `persist` is on) but are never sent — read them yourself with `getBufferedLocations()`. With a `syncUrl`, check `onSync` / `onError` and the `SyncResult.status`/`error` fields. The buffer is capped at `maxRecordsToPersist` (default 10,000); oldest rows drop past the cap so the disk can't fill.
</details>

<details>
<summary><strong>Can I use this in Expo Go?</strong></summary>

No. This is a custom native module — Expo Go doesn't ship it. Use a **dev client** (`npx expo run:android` / `run:ios`) or an EAS build.
</details>

<details>
<summary><strong>Nothing happens on web.</strong></summary>

By design — web is a typed no-op. Methods that can't return a value (like `start` / `getCurrentPosition`) throw `UnsupportedPlatformError`; the rest return sane defaults so cross-platform builds don't break.
</details>

---

## Contributing

PRs and issues welcome — especially:

- **OEM-killer survival** — vendor-specific autostart strategies are out of scope for v1; well-tested contributions are very welcome.
- **Real-device test reports** — which phones/OEMs survive swipe-kill and reboot, and which don't.
- **iOS region/visit monitoring** improvements around the SLC relaunch path.
- **Docs** — clearer permission-onboarding recipes.

```bash
git clone https://github.com/aashir-athar/expo-persistent-background-location
cd expo-persistent-background-location
npm install
npm run build      # expo-module build
npm run lint
```

See [ZERO-TO-DEPLOY.md](./ZERO-TO-DEPLOY.md) for the full maintainer runbook (dev loop, real-device kill tests, publishing).

---

## License

MIT © Aashir Athar — see [LICENSE](./LICENSE).
