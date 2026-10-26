package __PKG__

import android.os.Handler
import android.os.Looper
import android.print.PdfPrinter
import android.webkit.WebView
import android.webkit.WebViewClient
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * Печать готовой страницы (паспорта доступности и т. п.) в PDF родным движком телефона, как «Печать → Сохранить в PDF».
 * Файл кладётся в кэш приложения; страница затем отправляет его через «Поделиться».
 */
@CapacitorPlugin(name = "Pdf")
class PdfPlugin : Plugin() {
    private val ui = Handler(Looper.getMainLooper())
    private var busy = false

    @PluginMethod
    fun fromHtml(call: PluginCall) {
        val html = call.getString("html")
        val name = (call.getString("name") ?: "document.pdf").replace(Regex("[^A-Za-z0-9._-]"), "_")
        if (html.isNullOrEmpty()) {
            call.reject("empty")
            return
        }
        if (busy) {
            call.reject("busy")
            return
        }
        busy = true
        activity.runOnUiThread {
            val web = WebView(context)
            var finished = false
            val fail = { msg: String ->
                if (!finished) {
                    finished = true
                    busy = false
                    try {
                        web.destroy()
                    } catch (ignored: Exception) {
                    }
                    call.reject(msg)
                }
            }
            try {
                web.settings.javaScriptEnabled = true // скрипт на странице подставляет число листов
                web.settings.allowFileAccess = false
                web.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        waitReady(view, 0, call, name, fail) { finished = true }
                    }
                }
                web.loadDataWithBaseURL("https://localhost/", html, "text/html", "utf-8", null)
            } catch (e: Exception) {
                fail("error_" + e.message)
            }
            // страховка: не висеть дольше минуты
            ui.postDelayed({ fail("timeout") }, 60000)
        }
    }

    // ждём, пока скрипт страницы закончит подсчёт листов (до ~8 секунд), затем печатаем
    private fun waitReady(web: WebView, tries: Int, call: PluginCall, name: String, failCb: (String) -> Unit, mark: () -> Unit) {
        web.evaluateJavascript("(window.__pagesReady===true)") { r ->
            if (r == "true" || tries >= 40) {
                val out = File(context.cacheDir, name)
                try {
                    PdfPrinter.print(web.createPrintDocumentAdapter(name), out, object : PdfPrinter.Done {
                        override fun ok(pages: Int) {
                            mark()
                            busy = false
                            val o = JSObject()
                            o.put("name", name)
                            o.put("pages", pages)
                            o.put("size", out.length())
                            call.resolve(o)
                            try {
                                web.destroy()
                            } catch (ignored: Exception) {
                            }
                        }

                        override fun fail(message: String?) {
                            failCb("print_" + message)
                        }
                    })
                } catch (e: Exception) {
                    failCb("print_" + e.message)
                }
            } else {
                ui.postDelayed({ waitReady(web, tries + 1, call, name, failCb, mark) }, 200)
            }
        }
    }
}
