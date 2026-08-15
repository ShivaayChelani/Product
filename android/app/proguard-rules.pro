# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# React Navigation
-keep class com.facebook.react.turbomodule.** { *; }

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# react-native-gesture-handler
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.reanimated.** { *; }

# react-native-safe-area-context
-keep class com.th3rdwave.safeareacontext.** { *; }

# react-native-screens
-keep class com.swmansion.rnscreens.** { *; }

# react-native-video
-keep class com.brentvatne.react.** { *; }

# react-native-linear-gradient
-keep class com.BV.LinearGradient.** { *; }

# react-native-vector-icons
-keep class com.oblador.vectoricons.** { *; }

# react-native-webview
-keep class com.reactnativecommunity.webview.** { *; }

# react-native-image-picker
-keep class com.imagepicker.** { *; }

# react-native-geolocation-service
-keep class com.agontuk.RNFusedLocation.** { *; }

# react-native-compressor
-keep class com.humazed.reactnativecompressor.** { *; }

# Keep JavaScript interface methods used by native modules
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
    @com.facebook.react.bridge.CatalystInstance *;
}

# Keep annotations
-keep @interface com.facebook.proguard.annotations.DoNotStrip
-keep @interface com.facebook.proguard.annotations.KeepGettersAndSetters

# Sentry
-keepattributes SourceFile,LineNumberTable
-dontwarn io.sentry.**
-keep class io.sentry.** { *; }

# Keep React Native modules
-keep @com.facebook.react.common.annotations.DeprecatedInNewArchitecture class *
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * implements com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
