package com.palsasafar

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createNotificationChannels()
  }

  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    val defaultSound = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .build()

    val channels = listOf(
      Triple("default", "General", "General PalSafar alerts"),
      Triple("rewards", "Rewards", "Points, offers, and redemptions"),
      Triple("vendor", "Vendor", "Vendor workspace updates"),
      Triple("creator", "Creator", "Creator studio updates"),
      Triple("trips", "Trips", "Trip and itinerary updates"),
      Triple("offers", "Offers", "Nearby offers and deals"),
      Triple("system", "System", "Account and security notices"),
      Triple("marketing", "Marketing", "Promotions and announcements"),
    )

    channels.forEach { (id, name, desc) ->
      val channel = NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
        description = desc
        enableVibration(true)
        setSound(Uri.parse("content://settings/system/notification_sound"), defaultSound)
      }
      manager.createNotificationChannel(channel)
    }
  }
}
