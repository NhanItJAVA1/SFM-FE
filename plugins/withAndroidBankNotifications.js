const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MODULE_PACKAGE_SEGMENT = 'banknotifications';
const SERVICE_NAME = '.banknotifications.BankNotificationListenerService';
const PACKAGE_NAME = 'BankNotificationPackage';

function withAndroidBankNotifications(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    mainApplication.service ??= [];

    const hasService = mainApplication.service.some((service) => service.$?.['android:name'] === SERVICE_NAME);

    if (!hasService) {
      mainApplication.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:exported': 'true',
          'android:label': '@string/app_name',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.service.notification.NotificationListenerService',
                },
              },
            ],
          },
        ],
      });
    }

    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const androidPackage = modConfig.android?.package;

      if (!androidPackage) {
        throw new Error('Missing expo.android.package. Bank notification native files need an Android package name.');
      }

      const androidRoot = modConfig.modRequest.platformProjectRoot;
      const sourceDir = path.join(androidRoot, 'app', 'src', 'main', 'java', ...androidPackage.split('.'));
      const moduleDir = path.join(sourceDir, MODULE_PACKAGE_SEGMENT);

      fs.mkdirSync(moduleDir, { recursive: true });
      fs.writeFileSync(
        path.join(moduleDir, 'BankNotificationEventBus.kt'),
        createEventBusKotlin(androidPackage),
      );
      fs.writeFileSync(
        path.join(moduleDir, 'BankNotificationListenerService.kt'),
        createListenerServiceKotlin(androidPackage),
      );
      fs.writeFileSync(
        path.join(moduleDir, 'BankNotificationModule.kt'),
        createModuleKotlin(androidPackage),
      );
      fs.writeFileSync(
        path.join(moduleDir, 'BankNotificationPackage.kt'),
        createPackageKotlin(androidPackage),
      );

      patchMainApplication(sourceDir, androidPackage);

      return modConfig;
    },
  ]);
}

function patchMainApplication(sourceDir, androidPackage) {
  const kotlinPath = path.join(sourceDir, 'MainApplication.kt');
  const javaPath = path.join(sourceDir, 'MainApplication.java');

  if (fs.existsSync(kotlinPath)) {
    patchKotlinMainApplication(kotlinPath, androidPackage);
    return;
  }

  if (fs.existsSync(javaPath)) {
    patchJavaMainApplication(javaPath, androidPackage);
    return;
  }

  throw new Error(`Cannot find MainApplication.kt or MainApplication.java in ${sourceDir}`);
}

function patchKotlinMainApplication(filePath, androidPackage) {
  let contents = fs.readFileSync(filePath, 'utf8');
  const importLine = `import ${androidPackage}.${MODULE_PACKAGE_SEGMENT}.${PACKAGE_NAME}\n`;

  if (!contents.includes(importLine.trim())) {
    contents = contents.replace(/^(package .+\n)/m, `$1\n${importLine}`);
  }

  if (!contents.includes(`${PACKAGE_NAME}()`)) {
    contents = contents.replace(
      /(\s*)return packages/m,
      `$1packages.add(${PACKAGE_NAME}())\n$1return packages`,
    );
  }

  fs.writeFileSync(filePath, contents);
}

function patchJavaMainApplication(filePath, androidPackage) {
  let contents = fs.readFileSync(filePath, 'utf8');
  const importLine = `import ${androidPackage}.${MODULE_PACKAGE_SEGMENT}.${PACKAGE_NAME};\n`;

  if (!contents.includes(importLine.trim())) {
    contents = contents.replace(/^(package .+;\n)/m, `$1\n${importLine}`);
  }

  if (!contents.includes(`new ${PACKAGE_NAME}()`)) {
    contents = contents.replace(
      /(\s*)return packages;/m,
      `$1packages.add(new ${PACKAGE_NAME}());\n$1return packages;`,
    );
  }

  fs.writeFileSync(filePath, contents);
}

function createEventBusKotlin(androidPackage) {
  return `package ${androidPackage}.${MODULE_PACKAGE_SEGMENT}

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

object BankNotificationEventBus {
  private const val EVENT_NAME = "onBankNotification"
  private var reactContext: ReactApplicationContext? = null
  private val pendingEvents = mutableListOf<WritableMap>()

  @Synchronized
  fun setReactContext(context: ReactApplicationContext) {
    reactContext = context
    flushPendingEvents()
  }

  @Synchronized
  fun clearReactContext(context: ReactApplicationContext) {
    if (reactContext == context) {
      reactContext = null
    }
  }

  @Synchronized
  fun emit(payload: WritableMap) {
    val context = reactContext

    if (context == null) {
      pendingEvents.add(payload)
      return
    }

    if (!emitToReact(context, payload)) {
      pendingEvents.add(payload)
    }
  }

  private fun flushPendingEvents() {
    val context = reactContext ?: return
    val iterator = pendingEvents.iterator()

    while (iterator.hasNext()) {
      if (emitToReact(context, iterator.next())) {
        iterator.remove()
      }
    }
  }

  private fun emitToReact(context: ReactApplicationContext, payload: WritableMap): Boolean {
    return try {
      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_NAME, payload)
      true
    } catch (_: RuntimeException) {
      false
    }
  }
}
`;
}

function createListenerServiceKotlin(androidPackage) {
  return `package ${androidPackage}.${MODULE_PACKAGE_SEGMENT}

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.bridge.Arguments

class BankNotificationListenerService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val extras = sbn.notification.extras
    val payload = Arguments.createMap().apply {
      putString("packageName", sbn.packageName)
      putString("title", extras.getCharSequence(Notification.EXTRA_TITLE)?.toString())
      putString("text", extras.getCharSequence(Notification.EXTRA_TEXT)?.toString())
      putString("bigText", extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString())
      putString("subText", extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString())
      putDouble("postedAt", sbn.postTime.toDouble())
    }

    BankNotificationEventBus.emit(payload)
  }
}
`;
}

function createModuleKotlin(androidPackage) {
  return `package ${androidPackage}.${MODULE_PACKAGE_SEGMENT}

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BankNotificationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  init {
    BankNotificationEventBus.setReactContext(reactContext)
  }

  override fun getName(): String = "BankNotificationModule"

  override fun invalidate() {
    BankNotificationEventBus.clearReactContext(reactContext)
    super.invalidate()
  }

  @ReactMethod
  fun openNotificationAccessSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("ERR_OPEN_NOTIFICATION_ACCESS_SETTINGS", error)
    }
  }

  @ReactMethod
  fun isNotificationAccessEnabled(promise: Promise) {
    try {
      val enabledListeners = Settings.Secure.getString(
        reactContext.contentResolver,
        "enabled_notification_listeners",
      )
      val listener = ComponentName(reactContext, BankNotificationListenerService::class.java)
      val isEnabled = enabledListeners
        ?.split(":")
        ?.any { ComponentName.unflattenFromString(it) == listener }
        ?: false

      promise.resolve(isEnabled)
    } catch (error: Exception) {
      promise.reject("ERR_CHECK_NOTIFICATION_ACCESS", error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter.
  }
}
`;
}

function createPackageKotlin(androidPackage) {
  return `package ${androidPackage}.${MODULE_PACKAGE_SEGMENT}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class BankNotificationPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(BankNotificationModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

module.exports = withAndroidBankNotifications;
