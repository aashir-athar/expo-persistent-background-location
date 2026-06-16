import { NativeModule, requireNativeModule } from "expo";

import type {
  ExpoPersistentBackgroundLocationEvents,
  LocationFix,
  PermissionResult,
  SyncResult,
  TrackingStatus,
} from "./ExpoPersistentBackgroundLocation.types";

/**
 * Fully-resolved, flat configuration handed from JS to the native layer.
 *
 * The public {@link StartOptions} object is normalized into this record by
 * `index.ts` so the native side never has to reason about `undefined` — every
 * default lives in one place (`normalizeStartOptions`). The shape is flat (no
 * nested objects) so the Kotlin / Swift `Record` binding stays trivial and
 * allocation-free on the hot path.
 */
export interface NativeStartConfig {
  // Positioning
  accuracy: string;
  distanceFilter: number;
  interval: number;
  fastestInterval: number;
  activityType: string;
  showsBackgroundLocationIndicator: boolean;
  pausesUpdatesAutomatically: boolean;

  // Lifecycle / survival
  stopOnTerminate: boolean;
  restartOnBoot: boolean;
  useSignificantChanges: boolean;
  debug: boolean;

  // Android foreground-service notification
  notificationTitle: string;
  notificationBody: string;
  notificationChannelId: string;
  notificationChannelName: string;
  notificationColor: string | null;
  notificationIcon: string | null;
  tapToOpenApp: boolean;

  // Persistence + sync
  persist: boolean;
  syncUrl: string | null;
  httpMethod: string;
  headers: Record<string, string>;
  batchSize: number;
  autoSync: boolean;
  maxRecordsToPersist: number;

  // Motion gating
  motionEnabled: boolean;
  stationaryTimeoutMs: number;
}

/** Options for the native one-shot fix. */
export interface NativeCurrentPositionOptions {
  accuracy: string;
  timeoutMs: number;
  maximumAgeMs: number;
}

/**
 * Thin TypeScript declaration of the native module. Do **not** export this
 * directly — `index.ts` wraps it with normalization, ref-counted listeners,
 * and platform guards.
 */
declare class ExpoPersistentBackgroundLocationModule extends NativeModule<ExpoPersistentBackgroundLocationEvents> {
  /** Start (or reconfigure) the background tracker. Idempotent — calling twice reconfigures. */
  start(config: NativeStartConfig): Promise<void>;

  /** Stop the tracker, the foreground service, and disarm boot restart. */
  stop(): Promise<void>;

  /** Whether the native tracker is currently running. */
  isRunning(): boolean;

  /** Snapshot of tracker state. */
  getStatusAsync(): Promise<TrackingStatus>;

  /** Resolve a single fresh fix without starting continuous tracking. */
  getCurrentPosition(
    options: NativeCurrentPositionOptions,
  ): Promise<LocationFix>;

  /** Read up to `limit` buffered fixes (newest first). `0` = all. */
  getBufferedLocations(limit: number): Promise<LocationFix[]>;

  /** Delete every buffered fix. Resolves with the number of rows removed. */
  clearBuffer(): Promise<number>;

  /** Force an immediate sync of the buffer to `syncUrl`. */
  flush(): Promise<SyncResult>;

  /** Current location authorization, foreground + background. */
  getPermissionStatusAsync(): Promise<PermissionResult>;

  /** Prompt for location authorization. `background` requests "Always" / background access. */
  requestPermissionsAsync(background: boolean): Promise<PermissionResult>;

  /** Open the host app's system settings page (for the "blocked" case). */
  openSettings(): void;
}

// On web, Metro's platform-extension resolution maps imports of this module to
// `ExpoPersistentBackgroundLocationModule.web.ts` (the stub) instead of this
// file, so `requireNativeModule` only ever runs on Android / iOS where the
// native module is registered.
export default requireNativeModule<ExpoPersistentBackgroundLocationModule>(
  "ExpoPersistentBackgroundLocation",
);
