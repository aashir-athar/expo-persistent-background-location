/**
 * Public type definitions for `expo-persistent-background-location`.
 *
 * These types are the canonical contract between the JS API and the native
 * Android (Kotlin) / iOS (Swift) implementations. The shape of every record
 * crossing the bridge is described here — keep the native `Record` classes and
 * `Bundle` / `[String: Any]` serializers in lock-step with this file.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/**
 * Desired positioning accuracy. Maps to platform priorities:
 *
 * | Value      | Android (Priority)               | iOS (CLLocationAccuracy)              |
 * | ---------- | -------------------------------- | ------------------------------------- |
 * | `lowest`   | `PRIORITY_PASSIVE`               | `kCLLocationAccuracyThreeKilometers`  |
 * | `low`      | `PRIORITY_LOW_POWER`             | `kCLLocationAccuracyKilometer`        |
 * | `balanced` | `PRIORITY_BALANCED_POWER`        | `kCLLocationAccuracyHundredMeters`    |
 * | `high`     | `PRIORITY_HIGH_ACCURACY`         | `kCLLocationAccuracyNearestTenMeters` |
 * | `highest`  | `PRIORITY_HIGH_ACCURACY`         | `kCLLocationAccuracyBest`             |
 */
export type LocationAccuracy =
  | "lowest"
  | "low"
  | "balanced"
  | "high"
  | "highest";

/**
 * Resolved authorization state. `granted` means the app may track in the
 * background ("Always" on iOS / `ACCESS_BACKGROUND_LOCATION` on Android 10+).
 * `whenInUse` means only-while-using; background tracking is limited.
 */
export type LocationAuthorizationStatus =
  | "granted"
  | "whenInUse"
  | "denied"
  | "undetermined"
  | "restricted"
  | "blocked";

/**
 * Coarse motion classification. Always `unknown` when `motion.enabled` is off or
 * motion detection is unavailable.
 *
 * Note: `on_foot` / `on_bicycle` are Android-only (from `ActivityRecognition`);
 * iOS's speed heuristic coalesces those into `walking` / `running` / `in_vehicle`.
 */
export type MotionActivityType =
  | "still"
  | "walking"
  | "running"
  | "on_foot"
  | "on_bicycle"
  | "in_vehicle"
  | "unknown";

/** iOS `CLActivityType` hint — lets Core Location tune power/pausing behaviour. */
export type IOSActivityType =
  | "other"
  | "automotiveNavigation"
  | "fitness"
  | "otherNavigation"
  | "airborne";

// ---------------------------------------------------------------------------
// Location fix
// ---------------------------------------------------------------------------

/**
 * A single location sample. Every optional numeric field is `null` when the
 * platform did not report it (e.g. `speed` on a cold GPS fix). `latitude`,
 * `longitude`, and `timestamp` are always present.
 */
export interface LocationFix {
  /** Stable row id assigned when the fix is written to the SQLite buffer; `null` for live, not-yet-persisted fixes. */
  id: string | null;
  /** Latitude in decimal degrees (WGS-84). */
  latitude: number;
  /** Longitude in decimal degrees (WGS-84). */
  longitude: number;
  /** Estimated horizontal accuracy radius in metres (68% confidence). `null` if unknown. */
  accuracy: number | null;
  /** Altitude in metres above the WGS-84 ellipsoid. `null` if unavailable. */
  altitude: number | null;
  /** Estimated vertical accuracy in metres. `null` if unavailable. */
  altitudeAccuracy: number | null;
  /** Ground speed in metres per second. `null` if unavailable. */
  speed: number | null;
  /** Estimated speed accuracy in metres per second. `null` if unavailable. */
  speedAccuracy: number | null;
  /** Heading / course in degrees (0–360, clockwise from true north). `null` if unavailable. */
  heading: number | null;
  /** Estimated heading accuracy in degrees. `null` if unavailable. */
  headingAccuracy: number | null;
  /** Unix epoch milliseconds (UTC) at which the fix was acquired. */
  timestamp: number;
  /** Whether the motion gate currently considers the device to be moving. */
  isMoving: boolean;
  /** Best-effort motion classification at the time of the fix. */
  activity: MotionActivityType;
  /** Device battery level in `[0, 1]`, or `null` when unavailable. */
  batteryLevel: number | null;
  /** Whether the device is charging, or `null` when unavailable. */
  isCharging: boolean | null;
  /** `true` when the fix originates from a mock / test provider. */
  mocked: boolean;
  /** Underlying provider, e.g. `'fused'`, `'gps'`, `'network'`, `'slc'`, `'visit'`. `null` if unknown. */
  provider: string | null;
}

// ---------------------------------------------------------------------------
// Start options
// ---------------------------------------------------------------------------

/**
 * Android foreground-service notification configuration. A foreground service
 * with a persistent notification is what keeps the process — and therefore the
 * GPS stream — alive after the task is swiped away. iOS ignores this block.
 */
export interface ForegroundServiceOptions {
  /** Notification title. Defaults to `"Location tracking active"`. */
  notificationTitle?: string;
  /** Notification body text. Defaults to `"Your location is being tracked in the background."`. */
  notificationBody?: string;
  /** Android O+ notification channel id. Defaults to `"persistent_background_location"`. */
  notificationChannelId?: string;
  /** User-visible channel name shown in system settings. Defaults to `"Background location"`. */
  notificationChannelName?: string;
  /** Accent colour for the notification, as `#RRGGBB` or `#AARRGGBB`. */
  notificationColor?: string;
  /**
   * Small-icon drawable resource name (without extension), resolved from the
   * host app's `res/drawable` or `res/mipmap`. Defaults to the app icon.
   */
  notificationIcon?: string;
  /** When `true` (default), tapping the notification re-opens the host app. */
  tapToOpenApp?: boolean;
}

/**
 * Offline persistence + HTTP sync configuration. When `persist` is enabled,
 * every fix is written to a native SQLite buffer *before* being delivered to
 * JS, so nothing is lost while the app is killed. When `syncUrl` is set, the
 * buffer is flushed to your backend by the native layer — no JS required.
 */
export interface BufferOptions {
  /** Persist fixes to the native SQLite buffer. Defaults to `true` when `syncUrl` is set, else `false`. */
  persist?: boolean;
  /** HTTPS endpoint that receives batched fixes as a JSON array. Enables native auto-sync. */
  syncUrl?: string;
  /**
   * Allow a non-HTTPS (`http://`) `syncUrl`. Defaults to `false` — `start()`
   * throws on a cleartext URL otherwise, since location data is sensitive PII
   * that should never travel unencrypted. Only set this for local development.
   */
  allowInsecureSync?: boolean;
  /** HTTP method for sync requests. Defaults to `'POST'`. */
  httpMethod?: "POST" | "PUT";
  /** Extra HTTP headers, e.g. an `Authorization` token. */
  headers?: Record<string, string>;
  /** Maximum number of fixes per sync request. Defaults to `50`. */
  batchSize?: number;
  /** Automatically flush the buffer in the background. Defaults to `true` when `syncUrl` is set. */
  autoSync?: boolean;
  /**
   * Hard cap on persisted rows. The oldest rows are dropped once exceeded, so a
   * permanently-offline device cannot fill the disk. Defaults to `10000`.
   */
  maxRecordsToPersist?: number;
}

/** Motion-detection (activity-recognition) gating options. */
export interface MotionOptions {
  /**
   * Enable activity-recognition gating. When the device is detected as
   * stationary, location requests are throttled to save battery and resumed on
   * movement. Defaults to `false`. Requires the `ACTIVITY_RECOGNITION`
   * permission on Android 10+ / motion usage description on iOS.
   */
  enabled?: boolean;
  /** Milliseconds of continuous stillness before throttling kicks in. Defaults to `60000`. */
  stationaryTimeoutMs?: number;
}

/** Options accepted by {@link start}. Every field has a sensible default. */
export interface StartOptions {
  /** Desired accuracy / power trade-off. Defaults to `'high'`. */
  accuracy?: LocationAccuracy;
  /** Minimum movement in metres between delivered fixes. Defaults to `10`. `0` delivers every fix. */
  distanceFilter?: number;
  /** Desired update interval in milliseconds (Android). Defaults to `5000`. */
  interval?: number;
  /** Fastest interval the app can handle, in milliseconds (Android). Defaults to `interval / 2`. */
  fastestInterval?: number;
  /** iOS `CLActivityType` hint. Defaults to `'other'`. */
  activityType?: IOSActivityType;
  /** Show the blue background-location indicator bar (iOS 11+). Defaults to `true`. */
  showsBackgroundLocationIndicator?: boolean;
  /** Allow Core Location to auto-pause updates when stationary (iOS). Defaults to `false`. */
  pausesUpdatesAutomatically?: boolean;
  /**
   * If `true`, tracking ends when the app is terminated and does not restart.
   * Defaults to `false` — i.e. tracking *survives* swipe-to-kill (the whole
   * point of this module).
   */
  stopOnTerminate?: boolean;
  /** Re-arm tracking after device reboot via a boot receiver (Android). Defaults to `true`. */
  restartOnBoot?: boolean;
  /**
   * Use significant-location-change + region monitoring so iOS can relaunch the
   * app in the background after force-quit. Defaults to `true`. Disabling this
   * means iOS tracking stops permanently on force-quit.
   */
  useSignificantChanges?: boolean;
  /** Android foreground-service notification configuration. */
  foregroundService?: ForegroundServiceOptions;
  /** Offline persistence + HTTP sync configuration. */
  buffer?: BufferOptions;
  /** Activity-recognition / motion gating. */
  motion?: MotionOptions;
  /** Emit verbose native logs (`adb logcat` / Xcode console). Defaults to `false`. */
  debug?: boolean;
}

/** Options for {@link getCurrentPosition}. */
export interface CurrentPositionOptions {
  /** Desired accuracy for the one-shot fix. Defaults to `'high'`. */
  accuracy?: LocationAccuracy;
  /** Reject after this many milliseconds without a fix. Defaults to `15000`. */
  timeoutMs?: number;
  /** Accept a cached fix no older than this many milliseconds. Defaults to `0` (force fresh). */
  maximumAgeMs?: number;
}

/** Options for {@link requestPermissions}. */
export interface RequestPermissionsOptions {
  /**
   * Also request background ("Always") authorization. Defaults to `true`.
   * Note: on Android 11+ the OS *requires* a two-step flow — foreground is
   * granted first, then the user is sent to settings for background. This
   * module handles that escalation automatically.
   */
  background?: boolean;
}

// ---------------------------------------------------------------------------
// Status & results
// ---------------------------------------------------------------------------

/** Snapshot of the tracker state, returned by {@link getStatus}. */
export interface TrackingStatus {
  /** Whether the native tracker is currently running. */
  running: boolean;
  /** The most recent fix the native layer holds, or `null` if none yet. */
  lastFix: LocationFix | null;
  /** Number of fixes currently sitting in the SQLite buffer (un-synced + retained). */
  bufferedCount: number;
  /** Resolved authorization status. */
  authorization: LocationAuthorizationStatus;
  /** Whether the device's location services (GPS / network) are switched on. */
  locationServicesEnabled: boolean;
  /** Current motion-gate state. */
  isMoving: boolean;
  /** Epoch ms when the current tracking session began, or `null` if not running. */
  trackingSince: number | null;
}

/** Detailed permission result, returned by {@link requestPermissions} / {@link getPermissionStatus}. */
export interface PermissionResult {
  /** Coarse, combined status — `granted` only when background tracking is permitted. */
  status: LocationAuthorizationStatus;
  /** Foreground ("When In Use") authorization. */
  foreground: LocationAuthorizationStatus;
  /** Background ("Always") authorization. */
  background: LocationAuthorizationStatus;
  /**
   * Whether the OS will still show a permission prompt (vs. requiring a Settings
   * trip). This is the **portable** "should I show an Open Settings CTA?" signal:
   * check `canAskAgain === false`. (Android surfaces the terminal state as
   * `status: 'blocked'`; iOS surfaces it as `status: 'denied'` — but both set
   * `canAskAgain: false`.)
   */
  canAskAgain: boolean;
}

/** Result of a sync attempt, returned by {@link flush} and emitted via `onSync`. */
export interface SyncResult {
  /** Whether the batch was accepted by the server. */
  success: boolean;
  /** Number of fixes included in the batch. */
  count: number;
  /** HTTP status code, when a request was made. `null` if skipped (e.g. nothing to sync, no URL). */
  status: number | null;
  /** Error message when `success` is `false`. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

/** Payload for `onProviderChange`. */
export interface ProviderChangeEvent {
  /** Whether *any* location provider is enabled. */
  enabled: boolean;
  /** GPS provider enabled (Android). Mirrors `enabled` on iOS. */
  gpsEnabled: boolean;
  /** Network provider enabled (Android). Mirrors `enabled` on iOS. */
  networkEnabled: boolean;
  /** Resolved authorization status at the time of the change. */
  authorization: LocationAuthorizationStatus;
}

/** Payload for `onMotionChange`. */
export interface MotionChangeEvent {
  /** Whether the device is now considered moving. */
  isMoving: boolean;
  /** Coarse activity classification. */
  activity: MotionActivityType;
  /** The fix associated with the transition, if one is available. */
  fix: LocationFix | null;
}

/** Payload for `onError`. */
export interface LocationErrorEvent {
  /** Stable machine-readable error code, e.g. `ERR_LOCATION_UNAVAILABLE`. */
  code: string;
  /** Human-readable message. */
  message: string;
  /** `true` when the tracker had to stop as a result of the error. */
  fatal: boolean;
}

/** Strongly-typed map of events emitted by the native module. */
export type ExpoPersistentBackgroundLocationEvents = {
  /** Fires for every delivered location fix (including while the app is backgrounded / killed-then-resumed). */
  onLocation: (fix: LocationFix) => void;
  /** Fires when the device transitions between moving and stationary. */
  onMotionChange: (event: MotionChangeEvent) => void;
  /** Fires when location providers or authorization change. */
  onProviderChange: (event: ProviderChangeEvent) => void;
  /** Fires when the buffer is flushed to `syncUrl`. */
  onSync: (event: SyncResult) => void;
  /** Fires on recoverable and fatal tracker errors. */
  onError: (event: LocationErrorEvent) => void;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when a method is called on a platform that does not support it (e.g. web). */
export class UnsupportedPlatformError extends Error {
  constructor(method: string, platform: string) {
    super(
      `expo-persistent-background-location.${method}() is not available on ${platform}.`,
    );
    this.name = "UnsupportedPlatformError";
  }
}

/** Thrown when tracking is started without the required location authorization. */
export class LocationPermissionError extends Error {
  /** The resolved permission state at the time of the failure. */
  readonly status: LocationAuthorizationStatus;
  constructor(status: LocationAuthorizationStatus, message?: string) {
    super(
      message ??
        `Location permission not granted (status: ${status}). ` +
          `Call requestPermissions() before start().`,
    );
    this.name = "LocationPermissionError";
    this.status = status;
  }
}
