/**
 * Web no-op fallback. The package targets Android + iOS; on web every method
 * resolves to a sane default or rejects with `UnsupportedPlatformError`, so a
 * cross-platform app can `import` the package and call it behind a
 * `Platform.OS` check without bundler errors.
 */

import { NativeModule } from "expo";

import type {
  ExpoPersistentBackgroundLocationEvents,
  LocationFix,
  PermissionResult,
  SyncResult,
  TrackingStatus,
} from "./ExpoPersistentBackgroundLocation.types";

const DENIED: PermissionResult = {
  status: "denied",
  foreground: "denied",
  background: "denied",
  canAskAgain: false,
};

const IDLE_STATUS: TrackingStatus = {
  running: false,
  lastFix: null,
  bufferedCount: 0,
  authorization: "denied",
  locationServicesEnabled: false,
  isMoving: false,
  trackingSince: null,
};

const UNSUPPORTED = new Error(
  "expo-persistent-background-location is not supported on web — background " +
    "GPS requires a native runtime.",
);
UNSUPPORTED.name = "UnsupportedPlatformError";

class ExpoPersistentBackgroundLocationModuleStub extends NativeModule<ExpoPersistentBackgroundLocationEvents> {
  async start(): Promise<void> {
    throw UNSUPPORTED;
  }
  async stop(): Promise<void> {
    /* no-op */
  }
  isRunning(): boolean {
    return false;
  }
  async getStatusAsync(): Promise<TrackingStatus> {
    return IDLE_STATUS;
  }
  async getCurrentPosition(): Promise<LocationFix> {
    throw UNSUPPORTED;
  }
  async getBufferedLocations(): Promise<LocationFix[]> {
    return [];
  }
  async clearBuffer(): Promise<number> {
    return 0;
  }
  async flush(): Promise<SyncResult> {
    return {
      success: false,
      count: 0,
      status: null,
      error: "unsupported-platform",
    };
  }
  async getPermissionStatusAsync(): Promise<PermissionResult> {
    return DENIED;
  }
  async requestPermissionsAsync(): Promise<PermissionResult> {
    return DENIED;
  }
  openSettings(): void {
    /* no-op */
  }
}

export default new ExpoPersistentBackgroundLocationModuleStub();
