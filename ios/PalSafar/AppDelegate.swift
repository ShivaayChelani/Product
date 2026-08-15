import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UserNotifications

#if canImport(React_RCTLinking)
import React_RCTLinking
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if canImport(FirebaseCore)
    // Configure Firebase only when a real GoogleService-Info.plist is bundled.
    if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil,
       FirebaseApp.app() == nil {
      FirebaseApp.configure()
#if canImport(FirebaseMessaging)
      Messaging.messaging().delegate = self
#endif
    }
#endif

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "PalSafar",
      in: window,
      launchOptions: launchOptions
    )

    UNUserNotificationCenter.current().delegate = self
    registerNotificationCategories()

    return true
  }

  private func registerNotificationCategories() {
    let open = UNNotificationAction(
      identifier: "OPEN",
      title: "Open",
      options: [.foreground]
    )
    let dismiss = UNNotificationAction(
      identifier: "DISMISS",
      title: "Dismiss",
      options: []
    )

    let ids = [
      "rewards", "vendor", "creator", "trips", "offers",
      "system", "marketing", "admin", "points_earned", "reel_comment",
    ]
    let categories = ids.map { id in
      UNNotificationCategory(
        identifier: id,
        actions: [open, dismiss],
        intentIdentifiers: [],
        options: []
      )
    }
    UNUserNotificationCenter.current().setNotificationCategories(Set(categories))
  }

  // Suppress system banner in foreground — JS in-app banner handles UX.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }

  // MARK: - APNs → FCM

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
#if canImport(FirebaseCore) && canImport(FirebaseMessaging)
    guard FirebaseApp.app() != nil else { return }
    Messaging.messaging().apnsToken = deviceToken
#endif
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    #if DEBUG
    print("[PalSafar] APNs registration failed: \(error.localizedDescription)")
    #endif
  }

  // MARK: - Deep links (palsafar:// and universal links)

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return RCTLinkingManager.application(app, open: url, options: options)
  }

  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }
}

#if canImport(FirebaseMessaging)
extension AppDelegate: MessagingDelegate {
  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    #if DEBUG
    print("[PalSafar] FCM registration token: \(fcmToken ?? "nil")")
    #endif
  }
}
#endif

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
