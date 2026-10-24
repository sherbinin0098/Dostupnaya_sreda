package __PKG__

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Уклономер: вектор силы тяжести прямо из датчика телефона.
 * Берём TYPE_GRAVITY (его уже очистили от тряски и ускорения руки, используя гироскоп), а если его нет —
 * обычный акселерометр с мягким сглаживанием. Страница опрашивает read() и получает среднее за промежуток.
 * Через браузерное событие devicemotion данные приходят реже и грубее, поэтому тут точнее.
 */
@CapacitorPlugin(name = "Tilt")
class TiltPlugin : Plugin(), SensorEventListener {
    private var manager: SensorManager? = null
    private var usesGravity = false
    private var running = false
    private val lock = Any()
    private var sx = 0.0
    private var sy = 0.0
    private var sz = 0.0
    private var count = 0
    private var fx = 0.0
    private var fy = 0.0
    private var fz = 0.0
    private var filterReady = false

    @PluginMethod
    fun start(call: PluginCall) {
        if (running) {
            call.resolve(info())
            return
        }
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val gravity = sm?.getDefaultSensor(Sensor.TYPE_GRAVITY)
        val sensor = gravity ?: sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        if (sm == null || sensor == null) {
            call.reject("unavailable")
            return
        }
        usesGravity = gravity != null
        synchronized(lock) { reset() }
        filterReady = false
        if (!sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)) {
            call.reject("unavailable")
            return
        }
        manager = sm
        running = true
        call.resolve(info())
    }

    @PluginMethod
    fun read(call: PluginCall) {
        val out = JSObject()
        synchronized(lock) {
            if (count > 0) {
                out.put("x", sx / count)
                out.put("y", sy / count)
                out.put("z", sz / count)
            }
            out.put("n", count)
            reset()
        }
        call.resolve(out)
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        halt()
        call.resolve()
    }

    override fun onSensorChanged(event: SensorEvent) {
        var x = event.values[0].toDouble()
        var y = event.values[1].toDouble()
        var z = event.values[2].toDouble()
        if (!usesGravity) {
            // запасной вариант: сглаживаем акселерометр, чтобы убрать дрожание
            if (!filterReady) {
                fx = x
                fy = y
                fz = z
                filterReady = true
            } else {
                fx += ALPHA * (x - fx)
                fy += ALPHA * (y - fy)
                fz += ALPHA * (z - fz)
            }
            x = fx
            y = fy
            z = fz
        }
        synchronized(lock) {
            sx += x
            sy += y
            sz += z
            count++
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun handleOnDestroy() {
        halt()
    }

    private fun halt() {
        try {
            manager?.unregisterListener(this)
        } catch (ignored: Exception) {
        }
        running = false
    }

    private fun reset() {
        sx = 0.0
        sy = 0.0
        sz = 0.0
        count = 0
    }

    private fun info(): JSObject {
        val o = JSObject()
        o.put("source", if (usesGravity) "gravity" else "accelerometer")
        return o
    }

    companion object {
        private const val ALPHA = 0.15
    }
}
