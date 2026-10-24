package __PKG__

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Голосовой ввод (версия на Kotlin; прежняя на Java лежит рядом в DictationPlugin.java).
 *  - listenQuiet: распознавание речи без системного окна и без сигналов (нужен микрофон), для диктовки при занятых руках.
 *  - listen: запасной вариант — системное окно «Говорите» (микрофон не нужен).
 */
@CapacitorPlugin(
    name = "Dictation",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")]
)
class DictationPlugin : Plugin() {
    private var recognizer: SpeechRecognizer? = null
    private var pending: PluginCall? = null
    private var audio: AudioManager? = null
    private val mutedStreams = ArrayList<Int>()

    // ---------- тихий режим (без окна) ----------

    @PluginMethod
    fun listenQuiet(call: PluginCall) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            call.reject("unavailable")
            return
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermission")
            return
        }
        start(call)
    }

    @PermissionCallback
    private fun micPermission(call: PluginCall) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            start(call)
        } else {
            call.reject("no_permission")
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        activity.runOnUiThread {
            finish(ArrayList(), null)
            call.resolve()
        }
    }

    private fun start(call: PluginCall) {
        activity.runOnUiThread {
            if (pending != null) {
                call.reject("busy")
                return@runOnUiThread
            }
            pending = call
            bridge.saveCall(call)
            muteBeep()
            try {
                val sr = SpeechRecognizer.createSpeechRecognizer(context)
                recognizer = sr
                sr.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {}
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {}
                    override fun onPartialResults(partialResults: Bundle?) {}
                    override fun onEvent(eventType: Int, params: Bundle?) {}

                    override fun onResults(results: Bundle?) {
                        val heard = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        finish(heard ?: ArrayList(), null)
                    }

                    override fun onError(error: Int) {
                        when (error) {
                            // тишина или не разобрал — это не ошибка
                            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
                                finish(ArrayList(), null)
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> finish(null, "no_permission")
                            else -> finish(null, "error_$error")
                        }
                    }
                })
                val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "ru-RU"))
                i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
                i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1400L)
                sr.startListening(i)
            } catch (e: Exception) {
                finish(null, "unavailable")
            }
        }
    }

    private fun finish(heard: ArrayList<String>?, error: String?) {
        val call = pending
        pending = null
        recognizer?.let {
            try {
                it.cancel()
                it.destroy()
            } catch (ignored: Exception) {
            }
        }
        recognizer = null
        unmuteBeep()
        if (call == null) return
        if (error != null) {
            call.reject(error)
        } else {
            val list = JSArray()
            heard?.forEach { list.put(it) }
            val out = JSObject()
            out.put("matches", list)
            call.resolve(out)
        }
        bridge.releaseCall(call)
    }

    // Сигналы начала и конца записи: на время прослушивания приглушаем звуковые потоки и возвращаем обратно.
    private fun muteBeep() {
        try {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            audio = am
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
            for (s in intArrayOf(AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_SYSTEM, AudioManager.STREAM_MUSIC)) {
                try {
                    if (!am.isStreamMute(s)) {
                        am.adjustStreamVolume(s, AudioManager.ADJUST_MUTE, 0)
                        mutedStreams.add(s)
                    }
                } catch (ignored: Exception) {
                    // режим «Не беспокоить» может не разрешить
                }
            }
        } catch (ignored: Exception) {
        }
    }

    private fun unmuteBeep() {
        try {
            val am = audio
            if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                for (s in mutedStreams) {
                    try {
                        am.adjustStreamVolume(s, AudioManager.ADJUST_UNMUTE, 0)
                    } catch (ignored: Exception) {
                    }
                }
            }
        } catch (ignored: Exception) {
        }
        mutedStreams.clear()
    }

    override fun handleOnDestroy() {
        try {
            recognizer?.destroy()
        } catch (ignored: Exception) {
        }
        recognizer = null
        unmuteBeep()
    }

    // ---------- запасной вариант: системное окно ----------

    @PluginMethod
    fun listen(call: PluginCall) {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "ru-RU"))
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Скажите число")
        try {
            startActivityForResult(call, i, "onSpeech")
        } catch (e: ActivityNotFoundException) {
            call.reject("no_recognizer")
        }
    }

    @ActivityCallback
    private fun onSpeech(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val list = JSArray()
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.forEach { list.put(it) }
        }
        val out = JSObject()
        out.put("matches", list)
        call.resolve(out)
    }
}
