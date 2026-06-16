/**
 * `expo-persistent-background-location` — public API.
 *
 * Continuous background GPS that survives swipe-to-kill on Android (foreground
 * service + boot receiver) and resumes after termination on iOS (significant-
 * location-change + region monitoring). Fixes are buffered to a native SQLite
 * store and optionally synced to your backend by the native layer — so nothing
 * is lost while the JS runtime is gone.
 *
 * @packageDocumentation
 */

import { Platform, type EventSubscription } from "expo-modules-core";

import {
  LocationPermissionError,
  UnsupportedPlatformError,
  type CurrentPositionOptions,
  type ExpoPersistentBackgroundLocationEvents,
  type LocationErrorEvent,
  type LocationFix,
  type MotionChangeEvent,
  type PermissionResult,
  type ProviderChangeEvent,
  type RequestPermissionsOptions,
  type StartOptions,
  type SyncResult,
  type TrackingStatus,
} from "./ExpoPersistentBackgroundLocation.types";
import NativeModule from "./ExpoPersistentBackgroundLocationModule";
import type { NativeStartConfig } from "./ExpoPersistentBackgroundLocationModule";

export * from "./ExpoPersistentBackgroundLocation.types";

const isWeb = Platform.OS === "web";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Strip any non-string header values so the native bridge never sees `undefined`. */
function sanitizeHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * Normalize the user-facing {@link StartOptions} into the flat, fully-resolved
 * {@link NativeStartConfig}. This is the **single source of truth for every
 * default** — the native layers carry matching defaults only as a safety net.
 */
export function normalizeStartOptions(
  options: StartOptions = {},
): NativeStartConfig {
  const fs = options.foregroundService ?? {};
  const buffer = options.buffer ?? {};
  const motion = options.motion ?? {};

  const syncUrl =
    typeof buffer.syncUrl === "string" ? buffer.syncUrl.trim() : "";
  const hasSyncUrl = syncUrl.length > 0;

  // Location data is sensitive PII — refuse to ship it over cleartext unless the
  // caller has explicitly opted in (e.g. a local dev backend).
  if (
    hasSyncUrl &&
    !buffer.allowInsecureSync &&
    !/^https:\/\//i.test(syncUrl)
  ) {
    throw new Error(
      `expo-persistent-background-location: buffer.syncUrl must be HTTPS (got "${syncUrl}"). ` +
        `Set buffer.allowInsecureSync: true to override for local development.`,
    );
  }

  const interval = clamp(options.interval ?? 5000, 0, 86_400_000);

  return {
    accuracy: options.accuracy ?? "high",
    distanceFilter: clamp(options.distanceFilter ?? 10, 0, 1_000_000),
    interval,
    fastestInterval: clamp(
      options.fastestInterval ?? Math.floor(interval / 2),
      0,
      86_400_000,
    ),
    activityType: options.activityType ?? "other",
    showsBackgroundLocationIndicator:
      options.showsBackgroundLocationIndicator ?? true,
    pausesUpdatesAutomatically: options.pausesUpdatesAutomatically ?? false,

    stopOnTerminate: options.stopOnTerminate ?? false,
    restartOnBoot: options.restartOnBoot ?? true,
    useSignificantChanges: options.useSignificantChanges ?? true,
    debug: options.debug ?? false,

    notificationTitle: fs.notificationTitle ?? "Location tracking active",
    notificationBody:
      fs.notificationBody ??
      "Your location is being tracked in the background.",
    notificationChannelId:
      fs.notificationChannelId ?? "persistent_background_location",
    notificationChannelName:
      fs.notificationChannelName ?? "Background location",
    notificationColor: fs.notificationColor ?? null,
    notificationIcon: fs.notificationIcon ?? null,
    tapToOpenApp: fs.tapToOpenApp ?? true,

    persist: buffer.persist ?? hasSyncUrl,
    syncUrl: hasSyncUrl ? syncUrl : null,
    httpMethod: buffer.httpMethod ?? "POST",
    headers: sanitizeHeaders(buffer.headers),
    batchSize: clamp(buffer.batchSize ?? 50, 1, 1000),
    autoSync: buffer.autoSync ?? hasSyncUrl,
    maxRecordsToPersist: clamp(
      buffer.maxRecordsToPersist ?? 10_000,
      100,
      1_000_000,
    ),

    motionEnabled: motion.enabled ?? false,
    stationaryTimeoutMs: clamp(
      motion.stationaryTimeoutMs ?? 60_000,
      0,
      86_400_000,
    ),
  };
}

function ensureNotWeb(method: string): void {
  if (isWeb) throw new UnsupportedPlatformError(method, Platform.OS);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start continuous background tracking. Idempotent — calling `start` again
 * reconfigures the running tracker rather than spawning a second one.
 *
 * On **Android** this launches a `location`-typed foreground service (with the
 * configured notification) and, when `restartOnBoot` is set, arms a boot
 * receiver. On **iOS** it begins standard updates plus — when
 * `useSignificantChanges` is set — significant-location-change monitoring so
 * the OS can relaunch the app in the background after force-quit.
 *
 * @throws {@link LocationPermissionError} (from native) when authorization is missing.
 * @throws {@link UnsupportedPlatformError} on web.
 */
export async function start(options: StartOptions = {}): Promise<void> {
  ensureNotWeb("start");
  try {
    await NativeModule.start(normalizeStartOptions(options));
  } catch (error) {
    // Surface the native permission failure as a typed, catchable error.
    if ((error as { code?: string })?.code === "ERR_PERMISSION_DENIED") {
      const { status } = await getPermissionStatus();
      throw new LocationPermissionError(status);
    }
    throw error;
  }
}

/** Stop tracking, tear down the foreground service, and disarm boot restart. */
export async function stop(): Promise<void> {
  if (isWeb) return;
  await NativeModule.stop();
}

/** Whether the native tracker is currently running. */
export function isRunning(): boolean {
  if (isWeb) return false;
  return NativeModule.isRunning();
}

/** Snapshot of the current tracker state, authorization, and buffer size. */
export async function getStatus(): Promise<TrackingStatus> {
  if (isWeb) {
    return {
      running: false,
      lastFix: null,
      bufferedCount: 0,
      authorization: "denied",
      locationServicesEnabled: false,
      isMoving: false,
      trackingSince: null,
    };
  }
  return NativeModule.getStatusAsync();
}

/**
 * Resolve a single fresh fix without starting continuous tracking. Useful for a
 * one-shot "where am I now" query.
 *
 * @throws {@link UnsupportedPlatformError} on web.
 */
export async function getCurrentPosition(
  options: CurrentPositionOptions = {},
): Promise<LocationFix> {
  ensureNotWeb("getCurrentPosition");
  return NativeModule.getCurrentPosition({
    accuracy: options.accuracy ?? "high",
    timeoutMs: clamp(options.timeoutMs ?? 15_000, 1_000, 300_000),
    maximumAgeMs: clamp(options.maximumAgeMs ?? 0, 0, 86_400_000),
  });
}

// ---------------------------------------------------------------------------
// Buffer & sync
// ---------------------------------------------------------------------------

/**
 * Read buffered fixes from the native SQLite store, newest first. These are the
 * fixes captured while the app was killed or offline. Pass `0` for all rows.
 */
export async function getBufferedLocations(limit = 0): Promise<LocationFix[]> {
  if (isWeb) return [];
  return NativeModule.getBufferedLocations(clamp(limit, 0, 1_000_000));
}

/** Delete every buffered fix. Resolves with the number of rows removed. */
export async function clearBuffer(): Promise<number> {
  if (isWeb) return 0;
  return NativeModule.clearBuffer();
}

/** Force an immediate sync of the buffer to the configured `syncUrl`. */
export async function flush(): Promise<SyncResult> {
  if (isWeb)
    return {
      success: false,
      count: 0,
      status: null,
      error: "unsupported-platform",
    };
  return NativeModule.flush();
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Resolve the current foreground + background location authorization. */
export async function getPermissionStatus(): Promise<PermissionResult> {
  if (isWeb) {
    return {
      status: "denied",
      foreground: "denied",
      background: "denied",
      canAskAgain: false,
    };
  }
  return NativeModule.getPermissionStatusAsync();
}

/**
 * Prompt for location authorization. By default this also requests background
 * ("Always") access — on Android 11+ the OS mandates a two-step escalation
 * (foreground first, then a Settings trip for background), which the native
 * layer drives automatically.
 */
export async function requestPermissions(
  options: RequestPermissionsOptions = {},
): Promise<PermissionResult> {
  if (isWeb) {
    return {
      status: "denied",
      foreground: "denied",
      background: "denied",
      canAskAgain: false,
    };
  }
  return NativeModule.requestPermissionsAsync(options.background ?? true);
}

/** Open the host app's system settings page — use when permission is `blocked`. */
export function openSettings(): void {
  if (isWeb) return;
  NativeModule.openSettings();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function subscribe<E extends keyof ExpoPersistentBackgroundLocationEvents>(
  event: E,
  listener: ExpoPersistentBackgroundLocationEvents[E],
): EventSubscription {
  if (isWeb) {
    return { remove: () => undefined } as EventSubscription;
  }
  return NativeModule.addListener(event, listener);
}

/**
 * Subscribe to location fixes. Fires while the app is foregrounded,
 * backgrounded, and — on Android — after the app is swiped away (delivered the
 * moment the JS runtime is re-attached, in addition to being buffered/synced
 * natively the whole time).
 *
 * @returns an `EventSubscription` — call `.remove()` to unsubscribe.
 */
export function onLocation(
  listener: (fix: LocationFix) => void,
): EventSubscription {
  return subscribe("onLocation", listener);
}

/** Subscribe to moving ⇄ stationary transitions from the motion gate. */
export function onMotionChange(
  listener: (event: MotionChangeEvent) => void,
): EventSubscription {
  return subscribe("onMotionChange", listener);
}

/** Subscribe to location-provider / authorization changes. */
export function onProviderChange(
  listener: (event: ProviderChangeEvent) => void,
): EventSubscription {
  return subscribe("onProviderChange", listener);
}

/** Subscribe to buffer-sync results. */
export function onSync(
  listener: (event: SyncResult) => void,
): EventSubscription {
  return subscribe("onSync", listener);
}

/** Subscribe to recoverable and fatal tracker errors. */
export function onError(
  listener: (event: LocationErrorEvent) => void,
): EventSubscription {
  return subscribe("onError", listener);
}
