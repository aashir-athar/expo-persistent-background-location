package expo.modules.persistentbackgroundlocation

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.exception.CodedException
import kotlinx.coroutines.CompletableDeferred

/** Resolved permission snapshot mirroring `PermissionResult` in TypeScript. */
internal data class PermissionState(
  val status: String,
  val foreground: String,
  val background: String,
  val canAskAgain: Boolean
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "status" to status,
    "foreground" to foreground,
    "background" to background,
    "canAskAgain" to canAskAgain
  )
}

/**
 * Owns the messy Android location-permission state machine:
 *
 *  - foreground = `ACCESS_FINE_LOCATION` OR `ACCESS_COARSE_LOCATION`
 *  - background = `ACCESS_BACKGROUND_LOCATION` (API 29+), implicit before that
 *  - `BLOCKED` detection via `shouldShowRequestPermissionRationale`
 *  - the **mandatory two-step escalation** on Android 11+: foreground must be
 *    granted before the OS will even consider a background request.
 */
internal object PermissionHelper {

  private const val PREFS_KEY_PROMPTED = "location_prompt_shown"

  private val FOREGROUND_PERMISSIONS = arrayOf(
    Manifest.permission.ACCESS_FINE_LOCATION,
    Manifest.permission.ACCESS_COARSE_LOCATION
  )

  fun hasForeground(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED

  fun hasBackground(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return hasForeground(context)
    return ContextCompat.checkSelfPermission(
      context, Manifest.permission.ACCESS_BACKGROUND_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
  }

  /** Pure read of the current state (no activity needed for the basics). */
  fun currentState(appContext: AppContext): PermissionState {
    val context = appContext.reactContext
      ?: return PermissionState("undetermined", "undetermined", "undetermined", true)
    val activity = appContext.activityProvider?.currentActivity

    val foregroundGranted = hasForeground(context)
    val backgroundGranted = hasBackground(context)
    val prompted = wasPrompted(context)

    val foreground = when {
      foregroundGranted -> "granted"
      !prompted -> "undetermined"
      activity != null && canStillAsk(activity, FOREGROUND_PERMISSIONS) -> "denied"
      activity != null -> "blocked"
      else -> "denied"
    }

    val background = when {
      backgroundGranted -> "granted"
      !foregroundGranted -> "denied"
      Build.VERSION.SDK_INT < Build.VERSION_CODES.Q -> "granted"
      else -> "denied"
    }

    return PermissionState(
      status = combinedStatus(foreground, background),
      foreground = foreground,
      background = background,
      canAskAgain = foreground != "blocked"
    )
  }

  /**
   * Drive the request flow: foreground first, then (optionally) background. On
   * Android 11+ the background ask is a separate prompt that the OS routes
   * through "Allow all the time" / Settings — we surface whatever the user picks.
   */
  suspend fun request(appContext: AppContext, requestBackground: Boolean): PermissionState {
    val context = appContext.reactContext
      ?: throw CodedException(Constants.ERR_NO_CONTEXT, "Android context unavailable.", null)
    val activity = appContext.activityProvider?.currentActivity
      ?: throw CodedException(Constants.ERR_NO_ACTIVITY, "An Activity is required to request permissions.", null)
    val permissionsManager = appContext.permissions
      ?: throw CodedException(Constants.ERR_NO_CONTEXT, "Expo permissions manager unavailable.", null)

    markPrompted(context)

    // Step 1 — foreground.
    awaitPermissions(permissionsManager, *FOREGROUND_PERMISSIONS)
    val foregroundGranted = hasForeground(context)

    // Step 2 — background, only when asked for, granted foreground, and API 29+.
    if (foregroundGranted && requestBackground &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackground(context)
    ) {
      awaitPermissions(permissionsManager, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    }

    val state = currentState(appContext)
    // Recompute `canAskAgain` against the post-prompt activity rationale.
    val canAsk = canStillAsk(activity, FOREGROUND_PERMISSIONS) || state.foreground == "granted"
    return state.copy(canAskAgain = canAsk && state.foreground != "blocked")
  }

  fun openSettings(context: Context) {
    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
      data = Uri.fromParts("package", context.packageName, null)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
  }

  private fun combinedStatus(foreground: String, background: String): String = when {
    background == "granted" -> "granted"
    foreground == "granted" -> "whenInUse"
    else -> foreground // denied / undetermined / blocked
  }

  private suspend fun awaitPermissions(
    permissionsManager: expo.modules.interfaces.permissions.Permissions,
    vararg permissions: String
  ) {
    val deferred = CompletableDeferred<Unit>()
    permissionsManager.askForPermissions({ deferred.complete(Unit) }, *permissions)
    deferred.await()
  }

  private fun canStillAsk(activity: Activity, permissions: Array<String>): Boolean =
    permissions.any { ActivityCompat.shouldShowRequestPermissionRationale(activity, it) }

  private fun wasPrompted(context: Context): Boolean =
    context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
      .getBoolean(PREFS_KEY_PROMPTED, false)

  private fun markPrompted(context: Context) {
    context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
      .edit().putBoolean(PREFS_KEY_PROMPTED, true).apply()
  }

  /** Whether *any* of GPS/network providers are enabled. */
  fun locationServicesEnabled(context: Context): Boolean {
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager
      ?: return false
    val gps = runCatching { lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) }.getOrDefault(false)
    val net = runCatching { lm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER) }.getOrDefault(false)
    return gps || net
  }
}
