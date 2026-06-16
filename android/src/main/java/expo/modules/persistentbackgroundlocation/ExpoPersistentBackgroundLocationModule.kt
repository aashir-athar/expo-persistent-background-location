package expo.modules.persistentbackgroundlocation

import android.content.Context
import android.os.Looper
import android.util.Log
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

/**
 * JS ↔ Kotlin bridge. Thin by design: every method either configures the
 * long-lived [BackgroundLocationService], reads the [LocationEventBus] /
 * [LocationBufferStore] snapshot, or delegates to [PermissionHelper]. The heavy
 * lifting (the actual GPS stream + survival) lives in the service so it can keep
 * running after this module — and the whole JS runtime — is gone.
 *
 * Surface and event names are the contract in
 * `src/ExpoPersistentBackgroundLocation.types.ts`; keep them in sync.
 */
class ExpoPersistentBackgroundLocationModule : Module() {

  private val context: Context
    get() = appContext.reactContext
      ?: throw CodedException(Constants.ERR_NO_CONTEXT, "Android context is unavailable.", null)

  /** Forwards bus events to JS. Registered for the lifetime of the JS runtime. */
  private val busListener = object : LocationEventBus.Listener {
    override fun onLocation(fix: LocationFixModel) {
      runCatching { sendEvent(Constants.EVENT_LOCATION, fix.toMap()) }
    }

    override fun onMotionChange(isMoving: Boolean, activity: String, fix: LocationFixModel?) {
      runCatching {
        sendEvent(
          Constants.EVENT_MOTION_CHANGE,
          mapOf("isMoving" to isMoving, "activity" to activity, "fix" to fix?.toMap())
        )
      }
    }

    override fun onProviderChange(enabled: Boolean, gpsEnabled: Boolean, networkEnabled: Boolean) {
      runCatching {
        sendEvent(
          Constants.EVENT_PROVIDER_CHANGE,
          mapOf(
            "enabled" to enabled,
            "gpsEnabled" to gpsEnabled,
            "networkEnabled" to networkEnabled,
            "authorization" to PermissionHelper.currentState(appContext).status
          )
        )
      }
    }

    override fun onSync(result: SyncResult) {
      runCatching { sendEvent(Constants.EVENT_SYNC, result.toMap()) }
    }

    override fun onError(code: String, message: String, fatal: Boolean) {
      runCatching {
        sendEvent(Constants.EVENT_ERROR, mapOf("code" to code, "message" to message, "fatal" to fatal))
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name(Constants.MODULE_NAME)

    Events(
      Constants.EVENT_LOCATION,
      Constants.EVENT_MOTION_CHANGE,
      Constants.EVENT_PROVIDER_CHANGE,
      Constants.EVENT_SYNC,
      Constants.EVENT_ERROR
    )

    OnCreate {
      LocationEventBus.register(busListener)
    }

    OnDestroy {
      LocationEventBus.unregister(busListener)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    AsyncFunction("start") { config: StartConfigRecord ->
      val ctx = context
      if (!PermissionHelper.hasForeground(ctx)) {
        throw CodedException(
          Constants.ERR_PERMISSION_DENIED,
          "Location permission not granted. Call requestPermissions() before start().",
          null
        )
      }
      BackgroundLocationService.start(ctx, config.toConfig())
    }

    AsyncFunction("stop") {
      BackgroundLocationService.stop(context)
    }

    Function("isRunning") {
      BackgroundLocationService.isRunning()
    }

    AsyncFunction("getStatusAsync") Coroutine { ->
      val ctx = context
      val perm = PermissionHelper.currentState(appContext)
      val bufferedCount = withContext(Dispatchers.IO) {
        runCatching { LocationBufferStore.get(ctx).count() }.getOrDefault(0)
      }
      mapOf(
        "running" to BackgroundLocationService.isRunning(),
        "lastFix" to LocationEventBus.lastFix?.toMap(),
        "bufferedCount" to bufferedCount,
        "authorization" to perm.status,
        "locationServicesEnabled" to PermissionHelper.locationServicesEnabled(ctx),
        "isMoving" to LocationEventBus.isMoving,
        "trackingSince" to LocationEventBus.trackingSince.takeIf { it > 0L }?.toDouble()
      )
    }

    AsyncFunction("getCurrentPosition") Coroutine { options: CurrentPositionRecord ->
      val ctx = context
      if (!PermissionHelper.hasForeground(ctx)) {
        throw CodedException(
          Constants.ERR_PERMISSION_DENIED,
          "Location permission not granted.",
          null
        )
      }
      val engine = LocationEngineFactory.create(ctx)
      val location = suspendCancellableCoroutine { cont ->
        engine.getCurrentLocation(
          accuracy = options.accuracy,
          timeoutMs = options.timeoutMs,
          maxAgeMs = options.maximumAgeMs,
          looper = Looper.getMainLooper()
        ) { result ->
          runCatching { engine.stop() }
          if (cont.isActive) cont.resume(result)
        }
        cont.invokeOnCancellation { runCatching { engine.stop() } }
      } ?: throw CodedException(Constants.ERR_TIMEOUT, "Timed out acquiring a location fix.", null)

      val (battery, charging) = BatteryHelper.snapshot(ctx)
      LocationFixModel
        .fromLocation(location, isMoving = false, activity = "unknown", batteryLevel = battery, isCharging = charging)
        .toMap()
    }

    // ─────────────────────────────────────────────────────────────────────
    // Buffer & sync
    // ─────────────────────────────────────────────────────────────────────

    AsyncFunction("getBufferedLocations") Coroutine { limit: Int ->
      val ctx = context
      withContext(Dispatchers.IO) {
        LocationBufferStore.get(ctx).recent(limit).map { it.toMap() }
      }
    }

    AsyncFunction("clearBuffer") Coroutine { ->
      val ctx = context
      withContext(Dispatchers.IO) { LocationBufferStore.get(ctx).clear() }
    }

    AsyncFunction("flush") Coroutine { ->
      val ctx = context
      val config = ConfigStore.load(ctx)
        ?: return@Coroutine SyncResult(false, 0, null, "not-configured").toMap()
      if (config.syncUrl.isNullOrEmpty()) {
        return@Coroutine SyncResult(false, 0, null, "no-sync-url").toMap()
      }
      val result = LocationSyncer(LocationBufferStore.get(ctx), config.debug).flush(config)
      LocationEventBus.emitSync(result)
      result.toMap()
    }

    // ─────────────────────────────────────────────────────────────────────
    // Permissions
    // ─────────────────────────────────────────────────────────────────────

    AsyncFunction("getPermissionStatusAsync") {
      PermissionHelper.currentState(appContext).toMap()
    }

    AsyncFunction("requestPermissionsAsync") Coroutine { background: Boolean ->
      PermissionHelper.request(appContext, background).toMap()
    }

    Function("openSettings") {
      try {
        PermissionHelper.openSettings(context)
      } catch (t: Throwable) {
        Log.w(Constants.TAG, "openSettings failed", t)
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Argument records (bound from JS by the Expo Modules runtime)
  // ───────────────────────────────────────────────────────────────────────

  internal class StartConfigRecord : Record {
    @Field var accuracy: String = "high"
    @Field var distanceFilter: Double = 10.0
    @Field var interval: Long = 5_000L
    @Field var fastestInterval: Long = 2_500L
    @Field var activityType: String = "other"
    @Field var showsBackgroundLocationIndicator: Boolean = true
    @Field var pausesUpdatesAutomatically: Boolean = false
    @Field var stopOnTerminate: Boolean = false
    @Field var restartOnBoot: Boolean = true
    @Field var useSignificantChanges: Boolean = true
    @Field var debug: Boolean = false
    @Field var notificationTitle: String = "Location tracking active"
    @Field var notificationBody: String = "Your location is being tracked in the background."
    @Field var notificationChannelId: String = "persistent_background_location"
    @Field var notificationChannelName: String = "Background location"
    @Field var notificationColor: String? = null
    @Field var notificationIcon: String? = null
    @Field var tapToOpenApp: Boolean = true
    @Field var persist: Boolean = false
    @Field var syncUrl: String? = null
    @Field var httpMethod: String = "POST"
    @Field var headers: Map<String, String> = emptyMap()
    @Field var batchSize: Int = 50
    @Field var autoSync: Boolean = false
    @Field var maxRecordsToPersist: Int = 10_000
    @Field var motionEnabled: Boolean = false
    @Field var stationaryTimeoutMs: Long = 60_000L

    fun toConfig(): LocationConfig = LocationConfig(
      accuracy = accuracy,
      distanceFilter = distanceFilter,
      interval = interval,
      fastestInterval = fastestInterval,
      activityType = activityType,
      showsBackgroundLocationIndicator = showsBackgroundLocationIndicator,
      pausesUpdatesAutomatically = pausesUpdatesAutomatically,
      stopOnTerminate = stopOnTerminate,
      restartOnBoot = restartOnBoot,
      useSignificantChanges = useSignificantChanges,
      debug = debug,
      notificationTitle = notificationTitle,
      notificationBody = notificationBody,
      notificationChannelId = notificationChannelId,
      notificationChannelName = notificationChannelName,
      notificationColor = notificationColor,
      notificationIcon = notificationIcon,
      tapToOpenApp = tapToOpenApp,
      persist = persist,
      syncUrl = syncUrl,
      httpMethod = httpMethod,
      headers = headers,
      batchSize = batchSize,
      autoSync = autoSync,
      maxRecordsToPersist = maxRecordsToPersist,
      motionEnabled = motionEnabled,
      stationaryTimeoutMs = stationaryTimeoutMs
    )
  }

  internal class CurrentPositionRecord : Record {
    @Field var accuracy: String = "high"
    @Field var timeoutMs: Long = 15_000L
    @Field var maximumAgeMs: Long = 0L
  }
}
