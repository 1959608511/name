package com.fishcrm.app

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject

/**
 * 安卓无障碍抓屏服务（方案 B 核心）
 *
 * 1. 在屏幕右缘绘制一个半透明「🐟」悬浮球（TYPE_ACCESSIBILITY_OVERLAY，无需 SYSTEM_ALERT_WINDOW，
 *    由系统无障碍通道保活，不会被普通的后台清理杀死）；
 * 2. 悬浮球支持上下拖动，轻点后延迟 0.1s 递归遍历 rootInActiveWindow 的全部可见文本，
 *    以 `[Y:top, X:left] 文本` 的形式整理成行；
 * 3. 抓取结果以 JSON 数组存入 SharedPreferences("fish_crm_queue")，随后发送广播并弹 Toast，
 *    前端通过 MainActivity 注入的 window.FishNativeBridge.pullPendingCaptures() 取走并清空队列。
 */
class ScreenScraperService : AccessibilityService() {

    companion object {
        /** 抓屏队列的 SharedPreferences 文件名（与前端约定，勿改） */
        const val PREFS_NAME = "fish_crm_queue"
        /** 队列 JSON 的 key */
        const val KEY_QUEUE = "capture_queue"
        /** 抓取完成的广播 action */
        const val ACTION_CAPTURE_READY = "com.fishcrm.app.ACTION_CAPTURE_READY"

        /** 队列最多保留的抓屏条数，防止无限增长 */
        private const val MAX_QUEUE_SIZE = 50
        /** 点击判定阈值（dp），拖动超过该距离视为拖拽而非点击 */
        private const val TAP_SLOP_DP = 6
        /** 点击后延迟遍历时间（毫秒），等待悬浮球触摸状态复位 */
        private const val SCRAPE_DELAY_MS = 100L
        /** 递归遍历的最大深度，避免异常节点树导致栈溢出 */
        private const val MAX_TREE_DEPTH = 60
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var windowManager: WindowManager? = null
    private var floatingBall: TextView? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var lastTapAt = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        if (floatingBall == null) {
            addFloatingBall()
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 抓屏由用户点击「🐟」主动触发，这里无需处理事件，避免无谓遍历。
    }

    override fun onInterrupt() {
        // 服务被中断时保留悬浮球，等待系统重新连接。
    }

    override fun onDestroy() {
        removeFloatingBall()
        super.onDestroy()
    }

    // ---------- 悬浮球 ----------

    private fun addFloatingBall() {
        val wm = windowManager ?: return
        val ball = TextView(this).apply {
            text = "🐟"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            setTextColor(0xFFFFFFFF.toInt())
            gravity = Gravity.CENTER
            val size = dp(48)
            val padding = dp(6)
            setPadding(padding, padding, padding, padding)
            minWidth = size
            minHeight = size
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0xCC0EA5E9.toInt()) // 半透明青蓝
                setStroke(dp(1), 0x66FFFFFF)
            }
            elevation = dp(6).toFloat()
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            x = dp(4)
            y = 0
        }

        ball.setOnTouchListener(object : View.OnTouchListener {
            private var downRawY = 0f
            private var startY = 0
            private var dragging = false

            override fun onTouch(v: View, event: MotionEvent): Boolean {
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        downRawY = event.rawY
                        startY = params.y
                        dragging = false
                        return true
                    }

                    MotionEvent.ACTION_MOVE -> {
                        val delta = (event.rawY - downRawY).toInt()
                        if (!dragging && kotlin.math.abs(delta) > dp(TAP_SLOP_DP)) dragging = true
                        if (dragging) {
                            params.y = clampVerticalY(startY + delta)
                            runCatching { wm.updateViewLayout(ball, params) }
                        }
                        return true
                    }

                    MotionEvent.ACTION_UP -> {
                        if (!dragging) {
                            val now = System.currentTimeMillis()
                            if (now - lastTapAt > 600L) {
                                lastTapAt = now
                                scheduleScrape()
                            }
                        }
                        return true
                    }
                }
                return false
            }
        })

        val paramsFinal = params
        runCatching {
            wm.addView(ball, paramsFinal)
            floatingBall = ball
            layoutParams = paramsFinal
        }.onFailure {
            Toast.makeText(this, "🐟 悬浮球添加失败：${it.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun removeFloatingBall() {
        val ball = floatingBall ?: return
        runCatching { windowManager?.removeView(ball) }
        floatingBall = null
        layoutParams = null
    }

    /** 竖直方向限位：以屏幕中心为原点，避免拖出屏幕 */
    private fun clampVerticalY(y: Int): Int {
        val screenHeight = resources.displayMetrics.heightPixels
        val limit = screenHeight / 2 - dp(64)
        return y.coerceIn(-limit, limit)
    }

    // ---------- 抓屏 ----------

    /** 点击「🐟」后延迟 0.1s，确保窗口状态稳定再遍历 */
    private fun scheduleScrape() {
        mainHandler.postDelayed({ scrapeCurrentScreen() }, SCRAPE_DELAY_MS)
    }

    private fun scrapeCurrentScreen() {
        val root: AccessibilityNodeInfo? = rootInActiveWindow
        if (root == null) {
            Toast.makeText(this, "🐟 未获取到当前界面内容", Toast.LENGTH_SHORT).show()
            return
        }
        root.refresh()
        val lines = LinkedHashSet<String>()
        collectVisibleTexts(root, lines, 0)
        val result = lines.toList()
        if (result.isEmpty()) {
            Toast.makeText(this, "🐟 当前界面没有可抓取的文本", Toast.LENGTH_SHORT).show()
            return
        }
        saveCapture(result)
        sendBroadcast(Intent(ACTION_CAPTURE_READY).setPackage(packageName))
        Toast.makeText(this, "🐟 已抓取 ${result.size} 行文本，返回 App 自动入库", Toast.LENGTH_SHORT).show()
    }

    /** 深度优先递归遍历，仅收集可见节点的文本 / 内容描述，并附上屏幕坐标 */
    private fun collectVisibleTexts(
        node: AccessibilityNodeInfo?,
        out: MutableSet<String>,
        depth: Int
    ) {
        if (node == null || depth > MAX_TREE_DEPTH) return
        if (!node.isVisibleToUser) return

        val raw = node.text?.toString()?.trim().orEmpty()
            .ifEmpty { node.contentDescription?.toString()?.trim().orEmpty() }
        if (raw.isNotEmpty()) {
            val label = raw.replace("\n", " ").trim()
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (label.isNotEmpty()) {
                out.add("[Y:${rect.top}, X:${rect.left}] $label")
            }
        }

        for (index in 0 until node.childCount) {
            collectVisibleTexts(node.getChild(index), out, depth + 1)
        }
    }

    /** 写入 SharedPreferences 队列（JSON 数组，保留最近 MAX_QUEUE_SIZE 条） */
    private fun saveCapture(lines: List<String>) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val queue = try {
            JSONArray(prefs.getString(KEY_QUEUE, "[]") ?: "[]")
        } catch (_: Exception) {
            JSONArray()
        }
        val entry = JSONObject().apply {
            put("id", "cap_${System.currentTimeMillis()}")
            put("packageName", rootInActiveWindow?.packageName?.toString().orEmpty())
            put("capturedAt", System.currentTimeMillis())
            put("texts", JSONArray(lines))
        }
        queue.put(entry)
        while (queue.length() > MAX_QUEUE_SIZE) {
            queue.remove(0)
        }
        prefs.edit().putString(KEY_QUEUE, queue.toString()).apply()
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }
}
