# ────────────────────────────────────────────────────────────────
# Smart Ark — ProGuard / R8 rules
# ────────────────────────────────────────────────────────────────
# This Capacitor app uses a WebView + JS bridge. Any class reflected
# from JavaScript MUST be kept or the runtime bridge breaks silently
# (messages delivered, but handlers not found).
# ────────────────────────────────────────────────────────────────

# Preserve line numbers in crash stacktraces; hide original source file name.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ─── Capacitor bridge ────────────────────────────────────────────
# Plugins are discovered at runtime via reflection from capacitor.plugins.json
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugin.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.PluginMethod class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}

# Preserve every @JavascriptInterface entry point
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ─── Cordova (used by capacitor-cordova-android-plugins) ─────────
-keep class org.apache.cordova.** { *; }
-keep class org.apache.cordova.CordovaPlugin { *; }
-dontwarn org.apache.cordova.**

# ─── AndroidX + Material ─────────────────────────────────────────
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**

# ─── App ─────────────────────────────────────────────────────────
-keep class com.example.app.MainActivity { *; }

# ─── Misc: quiet known library warnings ──────────────────────────
-dontwarn org.xmlpull.v1.**
-dontwarn org.json.**
