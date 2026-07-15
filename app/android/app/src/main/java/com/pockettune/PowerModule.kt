package com.pockettune

import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * The one native capability JS cannot reach any other way: instantaneous
 * battery current via the official BatteryManager API (sysfs is hidden from
 * app processes by SELinux on modern Android). Voltage comes from the sticky
 * ACTION_BATTERY_CHANGED intent. All normalization (µA vs mA quirks, sign
 * conventions, sanity bounds) stays in TypeScript — this module only reports
 * raw values, or nulls when the device doesn't support the property.
 */
class PowerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "PocketTunePower"

  @ReactMethod
  fun read(promise: Promise) {
    try {
      val map = Arguments.createMap()

      val bm = reactApplicationContext.getSystemService(BatteryManager::class.java)
      val currentUa = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
      // Integer.MIN_VALUE is the documented "not supported" sentinel; 0 on
      // some devices means the same thing, but let JS decide that.
      if (currentUa != null && currentUa != Int.MIN_VALUE) {
        map.putDouble("currentUa", currentUa.toDouble())
      } else {
        map.putNull("currentUa")
      }

      val intent: Intent? =
        reactApplicationContext.registerReceiver(
          null,
          IntentFilter(Intent.ACTION_BATTERY_CHANGED),
        )
      val voltageMv = intent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1) ?: -1
      if (voltageMv > 0) map.putDouble("voltageMv", voltageMv.toDouble())
      else map.putNull("voltageMv")

      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("power_read_failed", e)
    }
  }
}

class PowerPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(PowerModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
