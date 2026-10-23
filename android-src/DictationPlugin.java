package __PKG__;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;

/** Голосовой ввод через системное распознавание речи (без отдельных разрешений). */
@CapacitorPlugin(name = "Dictation")
public class DictationPlugin extends Plugin {

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
