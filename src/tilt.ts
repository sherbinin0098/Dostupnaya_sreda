import { dirAlong, dirCross, ratioTxt, tiltAngles } from "./core/calc";
import { rule } from "./core/rules";
import { curObj } from "./core/storage";
import { byId, fmt } from "./core/util";
import { ui } from "./core/state";
import { render, toast } from "./ui/common";

export const TILT_KEY = "gorynych_tilt_v1";
export let tilt = { on: false, buf: [], got: false, cal: { a: 0, c: 0 }, c1: null, h: null };
export function tiltLoad() {
  try {
    const j = JSON.parse(localStorage.getItem(TILT_KEY) || "null");
    if (j && isFinite(j.a) && isFinite(j.c)) tilt.cal = j;
  } catch (e) {}
}
export function tiltSave() {
  try {
    localStorage.setItem(TILT_KEY, JSON.stringify(tilt.cal));
  } catch (e) {}
}
export function tiltRaw() {
  const b = tilt.buf;
  if (b.length < 5) return null;
  const m = k => b.reduce((s, x) => s + x[k], 0) / b.length;
  const ma = m("a"),
    mc = m("c"),
    sd = Math.sqrt(b.reduce((s, x) => s + (x.a - ma) ** 2, 0) / b.length);
  return { a: ma, c: mc, sd };
}
export function tiltCur() {
  const r = tiltRaw();
  if (!r) return null;
  const pm = rad => Math.round(Math.tan(rad) * 10000) / 10;
  const sa = pm(r.a - tilt.cal.a),
    sc = pm(r.c - tilt.cal.c);
  return { along: Math.abs(sa), cross: Math.abs(sc), sa, sc, still: r.sd < 0.004 };
}
export function tiltOnMotion(e) {
  const g = e.accelerationIncludingGravity;
  if (!g || g.x == null || g.y == null || g.z == null) return;
  tilt.got = true;
  tilt.buf.push(tiltAngles(g));
  if (tilt.buf.length > 30) tilt.buf.shift();
}
export function tiltStart() {
  if (tilt.on) return;
  tilt.on = true;
  tilt.buf = [];
  tilt.got = false;
  window.addEventListener("devicemotion", tiltOnMotion);
  tilt.h = setInterval(tiltDraw, 250);
  setTimeout(() => {
    if (tilt.on && !tilt.got) {
      const el = byId("tiltval");
      if (el)
        el.innerHTML = `<p class="muted">Датчик наклона не отвечает. На этом телефоне уклономер недоступен — используйте рулетку и калькулятор.</p>`;
    }
  }, 2500);
}
export function tiltStop() {
  if (!tilt.on) return;
  tilt.on = false;
  window.removeEventListener("devicemotion", tiltOnMotion);
  clearInterval(tilt.h);
}
export function tiltDraw() {
  const el = byId("tiltval"),
    c = tiltCur();
  if (!el || !c) return;
  el.innerHTML = `<div class="tilt"><div><span class="muted">Вдоль телефона</span><b>${fmt(c.along.toFixed(0))}‰</b><span class="muted">${ratioTxt(c.along)} · ${fmt((c.along / 10).toFixed(1))} %</span><span class="dir">${dirAlong(c.sa)}</span></div>
    <div><span class="muted">Поперёк телефона</span><b>${fmt(c.cross.toFixed(0))}‰</b><span class="muted">${ratioTxt(c.cross)} · ${fmt((c.cross / 10).toFixed(1))} %</span><span class="dir">${dirCross(c.sc)}</span></div></div>
    <p class="muted" style="margin:6px 0 0">${c.still ? "Держится ровно, можно записывать." : "Телефон двигается, подождите."}</p>`;
}
export function tiltCalStep(n) {
  const r = tiltRaw();
  if (!r) {
    toast("Датчик ещё не ответил");
    return;
  }
  if (n === 1) {
    tilt.c1 = { a: r.a, c: r.c };
    toast("Запомнено. Теперь поверните на 180°");
    byId("tcal2").disabled = false;
    return;
  }
  if (!tilt.c1) {
    toast("Сначала шаг 1");
    return;
  }
  tilt.cal = { a: (tilt.c1.a + r.a) / 2, c: (tilt.c1.c + r.c) / 2 };
  tilt.c1 = null;
  tiltSave();
  toast("Калибровка сохранена");
  byId("tcal2").disabled = true;
}
export function tiltToMeasure(which) {
  const c = tiltCur(),
    o = curObj();
  if (!c) return;
  if (!o) {
    toast("Сначала выберите объект на вкладке «Замер»");
    return;
  }
  const r = rule(byId("tpar").value);
  if (!r) return;
  const v = which === "along" ? c.along : c.cross;
  ui.draft.group = r.group;
  ui.draft.ruleId = r.id;
  ui.draft.value = String(Math.round(v));
  ui.draft.cond = null;
  ui.draft.comment =
    "Замер уклономером телефона, ориентировочно: " +
    (which === "along"
      ? "вдоль, " + dirAlong(c.sa).replace(/^[^ ]+ /, "")
      : "поперёк, " + dirCross(c.sc).replace(/^[^ ]+ /, "")) +
    " (верх телефона направлен по ходу движения)";
  ui.tab = "measure";
  ui.focusVal = true;
  render();
}
