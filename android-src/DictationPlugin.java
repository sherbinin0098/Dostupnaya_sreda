package __PKG__;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Голосовой ввод.
 * listenQuiet — распознавание речи без системного окна и без сигналов (нужен микрофон), для диктовки при занятых руках.
 * listen — запасной вариант: системное окно «Говорите» (микрофон не нужен).
 */
@CapacitorPlugin(
    name = "Dictation",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") }
)
public class DictationPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private PluginCall pending;
    private AudioManager audio;
    private final ArrayList<Integer> mutedStreams = new ArrayList<>();

    // ---------- тихий режим (без окна) ----------

    @PluginMethod
    public void listenQuiet(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("unavailable");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermission");
            return;
        }
        start(call);
    }

    @PermissionCallback
    private void micPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            start(call);
        } else {
            call.reject("no_permission");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            finish(new ArrayList<String>(), null);
            call.resolve();
        });
    }

    private void start(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pending != null) {
                call.reject("busy");
                return;
            }
            pending = call;
            bridge.saveCall(call);
            muteBeep();
            try {
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) { }
                    @Override public void onBeginningOfSpeech() { }
                    @Override public void onRmsChanged(float rmsdB) { }
                    @Override public void onBufferReceived(byte[] buffer) { }
                    @Override public void onEndOfSpeech() { }
                    @Override public void onPartialResults(Bundle partialResults) { }
                    @Override public void onEvent(int eventType, Bundle params) { }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> heard = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        finish(heard == null ? new ArrayList<String>() : heard, null);
                    }

                    @Override
                    public void onError(int error) {
                        if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                            finish(new ArrayList<String>(), null); // тишина или не разобрал — не ошибка
                        } else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                            finish(null, "no_permission");
                        } else {
                            finish(null, "error_" + error);
                        }
                    }
                });
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "ru-RU"));
                i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
                i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
                i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1400L);
                recognizer.startListening(i);
            } catch (Exception e) {
                finish(null, "unavailable");
            }
        });
    }

    private void finish(ArrayList<String> heard, String error) {
        final PluginCall call = pending;
        pending = null;
        if (recognizer != null) {
            try {
                recognizer.cancel();
                recognizer.destroy();
            } catch (Exception ignored) { }
            recognizer = null;
        }
        unmuteBeep();
        if (call == null) {
            return;
        }
        if (error != null) {
            call.reject(error);
        } else {
            JSObject out = new JSObject();
            JSArray list = new JSArray();
            if (heard != null) {
                for (String s : heard) {
                    list.put(s);
                }
            }
            out.put("matches", list);
            call.resolve(out);
        }
        bridge.releaseCall(call);
    }

    // Сигналы начала и конца записи: на время прослушивания приглушаем звуковые потоки и возвращаем обратно.
    private void muteBeep() {
        try {
            audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audio == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                return;
            }
            int[] streams = { AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_SYSTEM, AudioManager.STREAM_MUSIC };
            for (int s : streams) {
                try {
                    if (!audio.isStreamMute(s)) {
                        audio.adjustStreamVolume(s, AudioManager.ADJUST_MUTE, 0);
                        mutedStreams.add(s);
                    }
                } catch (Exception ignored) { } // режим «Не беспокоить» может не разрешить
            }
        } catch (Exception ignored) { }
    }

    private void unmuteBeep() {
        try {
            if (audio != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                for (int s : mutedStreams) {
                    try {
                        audio.adjustStreamVolume(s, AudioManager.ADJUST_UNMUTE, 0);
                    } catch (Exception ignored) { }
                }
            }
        } catch (Exception ignored) { }
        mutedStreams.clear();
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (recognizer != null) {
                recognizer.destroy();
                recognizer = null;
            }
        } catch (Exception ignored) { }
        unmuteBeep();
    }

    // ---------- запасной вариант: системное окно ----------

    @PluginMethod
    public void listen(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "ru-RU"));
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Скажите число");
        try {
            startActivityForResult(call, i, "onSpeech");
        } catch (ActivityNotFoundException e) {
            call.reject("no_recognizer");
        }
    }

    @ActivityCallback
    private void onSpeech(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        JSObject out = new JSObject();
        JSArray list = new JSArray();
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> heard = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (heard != null) {
                for (String s : heard) {
                    list.put(s);
                }
            }
        }
        out.put("matches", list);
        call.resolve(out);
    }
}
