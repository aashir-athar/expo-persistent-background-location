import ExpoModulesCore
import UIKit

/// Auto-registered Expo AppDelegate subscriber (declared in
/// `expo-module.config.json` under `ios.appDelegateSubscribers`).
///
/// When iOS relaunches the app **in the background** after a force-quit because
/// a significant location change fired, `didFinishLaunchingWithOptions` carries
/// the `.location` key. This is the single hook that lets the package resume
/// tracking after termination — there is no equivalent JS lifecycle event early
/// enough to catch it, which is exactly why this lives in native AppDelegate
/// territory.
public final class ExpoPersistentBackgroundLocationAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let launchedForLocation = launchOptions?[.location] != nil
    if launchedForLocation || ConfigStore.wasTracking() {
      LocationController.shared.resumeIfNeeded(launchedForLocation: launchedForLocation)
    }
    return true
  }
}
