package com.fishcrm.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
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

    /** SAF「另存为」待写入内容（Base64），onResult 后清空 */
    var pendingExportBase64: String? = null

    /** SAF 导出：用户选定位置与文件名后，把 Base64 内容写入该 Uri */
    val exportLauncher =
        registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
            val b64 = pendingExportBase64
            pendingExportBase64 = null
            val ok = if (uri != null && b64 != null) {
                runCatching {
                    val bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
                    contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                        ?: error("openOutputStream null")
                }.isSuccess
            } else false
            notifyWebViewEvent("fishcrm:file-exported", "{\"ok\":$ok}")
        }

    /** SAF 导入：用户选定文件后读出内容，以 Base64 回传 Web 端 */
    val importLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val detail = if (uri == null) "{}" else runCatching {
                val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: error("openInputStream null")
                val name = org.json.JSONObject.quote(queryDisplayName(uri) ?: "import")
                val b64 = org.json.JSONObject.quote(
                    android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                )
                "{\"name\":$name,\"contentBase64\":$b64}"
            }.getOrDefault("{}")
            notifyWebViewEvent("fishcrm:file-imported", detail)
        }

    /** 向 WebView 派发 CustomEvent（detail 为已序列化好的 JSON 字面量） */
    fun notifyWebViewEvent(event: String, detailJson: String) {
        val webView = bridge?.webView ?: return
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('$event',{detail:$detailJson}));",
                null
            )
        }
    }

    private fun queryDisplayName(uri: android.net.Uri): String? = runCatching {
        contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
        }
    }.getOrNull()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        injectNativeBridge()
        registerCaptureReceiver()
        registerBackGestureInterceptor()
    }

    /**
     * 全面屏手势 / 物理返回键拦截：
     * 不直接退出 App，而是向 WebView 派发 `fishcrm:back-pressed` 事件，
     * 由前端 App.vue 按优先级处理（关闭弹窗 → 切回首页 → 再按一次退出）。
     * 前端确认退出时会调用 FishNativeBridge.exitApp()。
     */
    private fun registerBackGestureInterceptor() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView = bridge?.webView
                if (webView == null) {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    return
                }
                webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('fishcrm:back-pressed'));",
                    null
                )
            }
        })
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

    /** 前端「再按一次退出」确认后真正退出 App */
    @JavascriptInterface
    fun exitApp() {
        activity.runOnUiThread { activity.finish() }
    }

    /** 唤起系统 SAF「另存为」：用户指定目录与文件名，结果经 fishcrm:file-exported 回传 */
    @JavascriptInterface
    fun exportToUserFile(fileName: String, contentBase64: String) {
        activity.pendingExportBase64 = contentBase64
        activity.runOnUiThread {
            runCatching { activity.exportLauncher.launch(fileName) }
                .onFailure {
                    activity.pendingExportBase64 = null
                    activity.notifyWebViewEvent("fishcrm:file-exported", "{\"ok\":false}")
                }
        }
    }

    /** 唤起系统 SAF 文件选择器：用户指定文件，内容经 fishcrm:file-imported 回传 */
    @JavascriptInterface
    fun importFromUserFile() {
        activity.runOnUiThread {
            runCatching {
                activity.importLauncher.launch(
                    arrayOf("application/json", "text/csv", "text/*", "application/octet-stream")
                )
            }.onFailure {
                activity.notifyWebViewEvent("fishcrm:file-imported", "{}")
            }
        }
    }
}
