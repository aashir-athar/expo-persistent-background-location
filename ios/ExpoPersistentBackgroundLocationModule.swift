import CoreLocation
import ExpoModulesCore
import UIKit

/// JS ↔ Swift bridge. Thin by design: every method configures the long-lived
/// ``LocationController`` singleton or delegates to ``LocationPermissions`` /
/// ``LocationBufferStore``. The controller outlives this module (and the JS
/// runtime), which is what lets tracking resume headlessly after a force-quit.
///
/// Surface and event names are the contract in
/// `src/ExpoPersistentBackgroundLocation.types.ts`; keep them in sync.
public final class ExpoPersistentBackgroundLocationModule: Module {
  public func definition() -> ModuleDefinition {
    Name(PBLConstants.moduleName)

    Events(
      PBLConstants.eventLocation,
      PBLConstants.eventMotionChange,
      PBLConstants.eventProviderChange,
      PBLConstants.eventSync,
      PBLConstants.eventError
    )

    OnCreate {
      LocationController.shared.eventEmitter = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    OnDestroy {
      LocationController.shared.eventEmitter = nil
    }

    // ─────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    AsyncFunction("start") { (config: StartConfigRecord, promise: Promise) in
      guard Self.isAuthorized() else {
        promise.reject(
          PBLConstants.errPermissionDenied,
          "Location permission not granted. Call requestPermissions() before start()."
        )
        return
      }
      LocationController.shared.start(config.toConfig(), restarted: false)
      promise.resolve(nil)
    }

    AsyncFunction("stop") {
      LocationController.shared.stop()
    }

    Function("isRunning") {
      LocationController.shared.running
    }

    AsyncFunction("getStatusAsync") { () -> [String: Any?] in
      LocationController.shared.statusDictionary()
    }

    AsyncFunction("getCurrentPosition") { (options: CurrentPositionRecord, promise: Promise) in
      guard Self.isAuthorized() else {
        promise.reject(PBLConstants.errPermissionDenied, "Location permission not granted.")
        return
      }
      LocationController.shared.currentPosition(
        accuracy: options.accuracy,
        timeoutMs: options.timeoutMs,
        maximumAgeMs: options.maximumAgeMs
      ) { fix in
        if let fix = fix {
          promise.resolve(fix.toDictionary())
        } else {
          promise.reject(PBLConstants.errTimeout, "Timed out acquiring a location fix.")
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Buffer & sync
    // ─────────────────────────────────────────────────────────────────────

    AsyncFunction("getBufferedLocations") { (limit: Int) -> [[String: Any?]] in
      LocationBufferStore.shared.recent(limit).map { $0.toDictionary() }
    }

    AsyncFunction("clearBuffer") { () -> Int in
      LocationBufferStore.shared.clear()
    }

    AsyncFunction("flush") { (promise: Promise) in
      LocationController.shared.flush { dict in promise.resolve(dict) }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Permissions
    // ─────────────────────────────────────────────────────────────────────

    AsyncFunction("getPermissionStatusAsync") { () -> [String: Any?] in
      LocationPermissions.shared.currentStatusDictionary()
    }

    AsyncFunction("requestPermissionsAsync") { (background: Bool, promise: Promise) in
      LocationPermissions.shared.request(background: background) { dict in
        promise.resolve(dict)
      }
    }

    Function("openSettings") {
      guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
      DispatchQueue.main.async {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
      }
    }
  }

  private static func isAuthorized() -> Bool {
    let status = LocationPermissions.shared.currentStatus()
    return status == .authorizedAlways || status == .authorizedWhenInUse
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Argument records (bound from JS by the Expo Modules runtime)
// ───────────────────────────────────────────────────────────────────────────

struct StartConfigRecord: Record {
  @Field var accuracy: String = "high"
  @Field var distanceFilter: Double = 10
  @Field var interval: Double = 5000
  @Field var fastestInterval: Double = 2500
  @Field var activityType: String = "other"
  @Field var showsBackgroundLocationIndicator: Bool = true
  @Field var pausesUpdatesAutomatically: Bool = false
  @Field var stopOnTerminate: Bool = false
  @Field var restartOnBoot: Bool = true
  @Field var useSignificantChanges: Bool = true
  @Field var debug: Bool = false
  @Field var notificationTitle: String = "Location tracking active"
  @Field var notificationBody: String = "Your location is being tracked in the background."
  @Field var notificationChannelId: String = "persistent_background_location"
  @Field var notificationChannelName: String = "Background location"
  @Field var notificationColor: String?
  @Field var notificationIcon: String?
  @Field var tapToOpenApp: Bool = true
  @Field var persist: Bool = false
  @Field var syncUrl: String?
  @Field var httpMethod: String = "POST"
  @Field var headers: [String: String] = [:]
  @Field var batchSize: Int = 50
  @Field var autoSync: Bool = false
  @Field var maxRecordsToPersist: Int = 10000
  @Field var motionEnabled: Bool = false
  @Field var stationaryTimeoutMs: Double = 60000

  func toConfig() -> LocationConfig {
    return LocationConfig(
      accuracy: accuracy,
      distanceFilter: distanceFilter,
      interval: interval,
      fastestInterval: fastestInterval,
      activityType: activityType,
      showsBackgroundLocationIndicator: showsBackgroundLocationIndicator,
      pausesUpdatesAutomatically: pausesUpdatesAutomatically,
      stopOnTerminate: stopOnTerminate,
      restartOnBoot: restartOnBoot,
      useSignificantChanges: useSignificantChanges,
      debug: debug,
      notificationTitle: notificationTitle,
      notificationBody: notificationBody,
      notificationChannelId: notificationChannelId,
      notificationChannelName: notificationChannelName,
      notificationColor: notificationColor,
      notificationIcon: notificationIcon,
      tapToOpenApp: tapToOpenApp,
      persist: persist,
      syncUrl: syncUrl,
      httpMethod: httpMethod,
      headers: headers,
      batchSize: batchSize,
      autoSync: autoSync,
      maxRecordsToPersist: maxRecordsToPersist,
      motionEnabled: motionEnabled,
      stationaryTimeoutMs: stationaryTimeoutMs
    )
  }
}

struct CurrentPositionRecord: Record {
  @Field var accuracy: String = "high"
  @Field var timeoutMs: Double = 15000
  @Field var maximumAgeMs: Double = 0
}
