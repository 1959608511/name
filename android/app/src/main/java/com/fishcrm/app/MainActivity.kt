package com.fishcrm.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity

/**
 * MainActivity
 *
 * 在 Capacitor 容器中注入 window.FishNativeBridge 原生接口，供前端 nativeBridge.ts 调用：
 * - pullPendingCaptures(): 取走并清空无障碍服务写入的抓屏队列（JSON 字符串）
 * - openAccessibilitySettings(): 一键跳转系统无障碍设置页
 * - isAccessibilityEnabled(): 查询本服务是否已被用户开启
 *
 * 同时监听 ScreenScraperService 的抓屏完成广播，向 WebView 派发 `fishcrm:capture-ready` 事件，
 * 让前端在收到广播时立即拉取入库。
 */
class MainActivity : BridgeActivity() {

    private var captureReceiver: BroadcastReceiver? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        injectNativeBridge()
        registerCaptureReceiver()
    }

    override fun onResume() {
        super.onResume()
        notifyWebViewCaptureReady()
    }

    override fun onDestroy() {
        captureReceiver?.let { receiver -> runCatching { unregisterReceiver(receiver) } }
        captureReceiver = null
        super.onDestroy()
    }

    /** 把原生能力挂到 window.FishNativeBridge 上 */
    private fun injectNativeBridge() {
        val webView = bridge?.webView ?: return
        webView.addJavascriptInterface(FishNativeBridge(this), "FishNativeBridge")
    }

    private fun registerCaptureReceiver() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                notifyWebViewCaptureReady()
            }
        }
        captureReceiver = receiver
        val filter = IntentFilter(ScreenScraperService.ACTION_CAPTURE_READY)
        runCatching {
            ContextCompat.registerReceiver(
                this,
                receiver,
                filter,
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
        }
    }

    private fun notifyWebViewCaptureReady() {
        val webView = bridge?.webView ?: return
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new Event('fishcrm:capture-ready'));",
                null
            )
        }
    }
}

/**
 * 暴露给前端 JavaScript 的原生桥对象（window.FishNativeBridge）。
 */
class FishNativeBridge(private val activity: MainActivity) {

    /** 取走待处理的抓屏队列：读出后立即清空，防止重复入库 */
    @JavascriptInterface
    fun pullPendingCaptures(): String {
        val prefs = activity.getSharedPreferences(ScreenScraperService.PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(ScreenScraperService.KEY_QUEUE, "[]") ?: "[]"
        prefs.edit().putString(ScreenScraperService.KEY_QUEUE, "[]").apply()
        return raw
    }

    /** 跳转系统「无障碍」设置页，用户在其中开启「我是鱼人际」 */
    @JavascriptInterface
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.runOnUiThread { activity.startActivity(intent) }
    }

    /** 查询 ScreenScraperService 是否已在系统无障碍列表中被开启 */
    @JavascriptInterface
    fun isAccessibilityEnabled(): Boolean {
        val expected = "${activity.packageName}/${ScreenScraperService::class.java.name}"
        val enabled = Settings.Secure.getString(
            activity.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }
}
