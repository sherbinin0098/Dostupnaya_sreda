import { RES, check, normText, plausible, rnd, rule, skipKey } from "../core/rules";
import { curObj, db, save } from "../core/storage";
import { byId, esc, fmt, uid } from "../core/util";
import { VFILL, VK, VSAY, parseMulti, parseSpoken, vNorm } from "../core/voice-parse";
import { routeState } from "../route";
import { render, toast } from "../ui/common";
import { listenOnce, speechAvailable } from "../voice";

export let vs = null,
  vsWake = null;
export function vsClose() {
  if (vs) vs.stop = true;
  try {
    window.speechSynthesis && speechSynthesis.cancel();
  } catch (e) {}
  try {
    vsWake && vsWake.release();
  } catch (e) {}
  vsWake = null;
  const e = byId("vsx");
  if (e) e.remove();
  vs = null;
  document.body.style.overflow = "";
  render();
}
export function vsTTS(text, done) {
  // читает вслух и вызывает done, когда договорил (или сразу, если озвучка выключена или недоступна)
  let fired = false;
  const fin = () => {
    if (fired) return;
    fired = true;
    if (done) done();
  };
  try {
    if (db.settings.vsSpeak === false || !window.speechSynthesis) {
      setTimeout(fin, 500);
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    u.rate = 1;
    u.onend = fin;
    u.onerror = fin;
    speechSynthesis.speak(u);
    setTimeout(fin, 7000);
  } catch (e) {
    setTimeout(fin, 500);
  }
}
export function vsNext(o) {
  const st = routeState(o);
  for (const g of st.gs)
    for (const i of g.items) {
      if (!i.done && !i.skip && !vs.later.has(i.r.id)) return i.r;
    }
  for (const g of st.gs)
    for (const i of g.items) {
      if (!i.done && !i.skip) return i.r;
    }
  return null;
}
export function vsOpen() {
  const o = curObj();
  if (!o) {
    toast("Сначала выберите объект");
    return;
  }
  vs = {
    cur: null,
    later: new Set(),
    last: [],
    say: "",
    ok: "",
    busy: false,
    paused: false,
    stop: false,
    fail: 0,
    tok: 0,
    wait: false,
    grp: "",
    from: "",
  };
  vs.cur = vsNext(o);
  vs.grp = vs.cur ? vs.cur.group : "";
  document.body.style.overflow = "hidden";
  try {
    if (navigator.wakeLock)
      navigator.wakeLock
        .request("screen")
        .then(w => {
          vsWake = w;
        })
        .catch(() => {});
  } catch (e) {}
  vsRender();
  vsAnnounce("");
}
export function vsRecord(o, id, v, heard) {
  const r = rule(id),
    k = check(r, v, o),
    rec = {
      id: uid(),
      objId: o.id,
      round: rnd(o),
      ruleId: r.id,
      value: v,
      result: k,
      ts: Date.now(),
      comment:
        (plausible(r, v) ? "" : "[Необычное значение — проверьте] ") + "Голосовой ввод: «" + heard + "»",
      exp: "",
      fix: "",
      geo: null,
      place: "",
      slots: {},
      photos: [],
      cond: null,
    };
  db.records.unshift(rec);
  save();
  return rec;
}
export function vsAnnounce(prefix) {
  if (!vs) return;
  const tok = ++vs.tok,
    r = vs.cur;
  const go = () => {
    if (vs && vs.tok === tok && !vs.paused && !vs.busy && !vs.stop && vs.cur) vsListen();
  };
  if (!r) {
    vsTTS("Маршрут пройден.", () => {});
    return;
  }
  if (vs.wait) {
    vsTTS(
      (prefix ? prefix + " " : "") +
        "Блок «" +
        vs.from +
        "» закончен. Следующий блок: «" +
        r.group +
        "». Когда будете готовы, скажите «дальше».",
      go
    );
    return;
  }
  vsTTS((prefix ? prefix + " " : "") + (VSAY[r.id] || VK[r.id]), go);
}
export function vsStep(o, say, ok, prefix) {
  vs.say = say;
  vs.ok = ok || "";
  vs.fail = 0;
  vs.cur = vsNext(o);
  // блок соседних измерений (раздел) закончился — остановка: человеку нужно перейти к другому месту
  if (vs.cur && vs.grp && vs.cur.group !== vs.grp) {
    vs.wait = true;
    vs.from = vs.grp;
  }
  if (vs.cur) vs.grp = vs.cur.group;
  vsRender();
  vsAnnounce(prefix || "");
}
export function vsTake(o, items) {
  const recs = items.map(it => vsRecord(o, it.id, it.value, it.heard));
  vs.last = recs.map(r => r.id);
  const sum = items.map(it => {
    const r = rule(it.id),
      k = check(r, it.value, o);
    return (
      `${r.name}: ${fmt(it.value)} ${r.unit} — ${RES[k][0]}` +
      (it.note ? " (принято как " + it.note + ")" : "")
    );
  });
  const k0 = check(rule(items[0].id), items[0].value, o),
    odd = items.some(it => !plausible(rule(it.id), it.value)),
    lastV = fmt(items[items.length - 1].value);
  vsStep(
    o,
    (odd ? "Необычное число — проверьте позже, отмечено в журнале. " : "Записано. ") + sum.join("; "),
    odd ? "relax" : RES[k0][1],
    odd ? lastV + ". Необычное число, скажите «отмена», если ошиблись." : lastV + "."
  );
}
export function vsRender() {
  const o = curObj();
  if (!vs || !o) return;
  const st = routeState(o),
    r = vs.cur ? rule(vs.cur.id) : null;
  let e = byId("vsx");
  if (!e) {
    e = document.createElement("div");
    e.id = "vsx";
    e.className = "vmx";
    e.setAttribute("role", "dialog");
    e.setAttribute("aria-label", "Диктовка");
    document.body.appendChild(e);
  }
  const pct = st.total ? Math.round((st.fin / st.total) * 100) : 0,
    status = vs.wait
      ? "⏹ Блок закончен"
      : vs.busy
        ? "🎤 Слушаю…"
        : vs.paused
          ? "⏸ Пауза"
          : r
            ? "Говорите число"
            : "";
  e.innerHTML = `<div class="vmhead"><b>Диктовка</b><button type="button" class="small" id="vsclose">Закрыть</button></div>
    <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><p class="muted" style="margin:4px 0 10px">Проверено ${st.fin} из ${st.total}</p>
    ${r && vs.wait ? `<div class="card vsmain warn"><div class="vsstat" aria-live="polite">${status}</div><div style="font-size:20px">Блок «${esc(vs.from)}» закончен.</div><div class="vsphr" style="font-size:30px">Дальше: «${esc(r.group)}»</div><div class="muted">Перейдите к следующему месту и скажите «дальше».</div></div>` : ""}
    ${
      r && !vs.wait
        ? `<div class="card vsmain"><div class="vsstat" aria-live="polite">${status}</div><div class="vsphr">«${esc(VK[r.id])}»</div><div style="font-size:19px;font-weight:700">${esc(r.name)}</div><div class="muted">Норма: ${esc(normText(r))}. Число можно говорить без единицы.</div></div>`
        : ""
    }
    ${!r ? `<div class="card ok"><b>Маршрут пройден.</b> Все пункты этого объекта записаны или пропущены.</div>` : ""}
    ${vs.say ? `<div class="card ${vs.ok || ""}" aria-live="polite">${esc(vs.say)}</div>` : ""}
    ${r ? `<div class="row"><button type="button" class="small" id="vsskip">Пропустить пока</button><button type="button" class="small" id="vsnone">Нет такого</button>${vs.last.length ? `<button type="button" class="small" id="vsundo">Отменить последнее</button>` : ""}</div>` : ""}
    <div class="muted" style="margin:12px 0 4px">Вместо числа можно сказать: «отмена», «пропустить», «нет такого», «повтори», «пауза». Телефон ничего не спрашивает, нажимать не нужно.</div>
    <label class="chk"><input type="checkbox" id="vsspk" ${db.settings.vsSpeak !== false ? "checked" : ""}> Озвучивать фразы и повторять число вслух</label>
    <div class="vmbar">${speechAvailable() ? (vs.wait ? `<button type="button" class="primary" id="vsgo">▶ Дальше</button>` : `<button type="button" class="primary" id="vspause">${vs.paused ? "▶ Продолжить" : "⏸ Пауза"}</button>`) : `<div class="warn">Голосовой ввод недоступен на этом телефоне.</div>`}</div>`;
  byId("vsclose").onclick = vsClose;
  const pb = byId("vspause");
  if (pb)
    pb.onclick = () => {
      if (vs.paused) {
        vs.paused = false;
        vs.fail = 0;
        vs.say = "";
        vsRender();
        vsAnnounce("Продолжаем.");
      } else {
        vs.paused = true;
        vs.tok++;
        try {
          speechSynthesis.cancel();
        } catch (e) {}
        vsRender();
      }
    };
  const go = byId("vsgo");
  if (go) go.onclick = () => vsResume();
  const sk = byId("vsskip");
  if (sk) sk.onclick = () => vsSkip(o);
  const nn = byId("vsnone");
  if (nn) nn.onclick = () => vsNone(o);
  const un = byId("vsundo");
  if (un) un.onclick = () => vsUndo(o);
  byId("vsspk").onchange = ev => {
    db.settings.vsSpeak = ev.target.checked;
    save();
  };
}
export function vsResume() {
  if (!vs || !vs.wait) return;
  vs.wait = false;
  vs.fail = 0;
  vs.say = "";
  vs.ok = "";
  vsRender();
  vsAnnounce("Поехали.");
}
export function vsSkip(o) {
  vs.later.add(vs.cur.id);
  const n = rule(vs.cur.id).name;
  vsStep(o, "Пропущено на потом: " + n, "", "");
}
export function vsNone(o) {
  o.skip = o.skip || {};
  o.skip[skipKey(o, vs.cur.id)] = true;
  save();
  vsStep(o, "Отмечено «нет такого»: " + rule(vs.cur.id).name, "", "");
}
export function vsUndo(o) {
  const ids = new Set(vs.last),
    first = db.records.find(x => ids.has(x.id));
  db.records = db.records.filter(x => !ids.has(x.id));
  save();
  vs.last = [];
  const c = first ? rule(first.ruleId) : null;
  if (c) vs.later.delete(c.id);
  vs.cur = c || vsNext(o);
  vs.wait = false;
  if (vs.cur) vs.grp = vs.cur.group;
  vs.say = "Последнее записанное отменено.";
  vs.ok = "";
  vsRender();
  vsAnnounce("Отмена.");
}
export const VCMD: [string, RegExp][] = [
  ["undo", /^(отмена|отменить|назад|ошибся|ошибка|не так)$/],
  ["skip", /^(пропустить|пропусти|потом|позже)$/],
  ["none", /^(нет такого|нету|нет такой|нет такое|отсутствует)$/],
  ["again", /^(повтори|повторить|еще раз|снова)$/],
  ["pause", /^(пауза|стоп|подожди|хватит)$/],
  ["go", /^(дальше|далее|продолжить|продолжай|поехали|готово|готов|вперед|погнали)$/],
];
export function vsCmd(t) {
  const w = vNorm(t);
  for (const [k, re] of VCMD) if (re.test(w)) return k;
  return null;
}
export async function vsListen() {
  const o = curObj();
  if (!vs || vs.busy || vs.paused || !o || !vs.cur) return;
  vs.busy = true;
  vsRender();
  let list: string[] = [];
  try {
    list = await listenOnce();
  } catch (e) {
    if (!vs) return;
    const m = String((e && e.message) || e);
    vs.busy = false;
    vs.paused = true;
    vs.say = /not.*implemented|unavailable|no_recognizer|UNIMPLEMENTED/i.test(m)
      ? "Голосовой ввод недоступен на этом телефоне."
      : "Не получилось записать голос. Нажмите «Продолжить».";
    vs.ok = "";
    vsRender();
    return;
  }
  if (!vs) return;
  vs.busy = false;
  if (vs.paused || vs.stop) {
    vsRender();
    return;
  }
  if (vs.wait) {
    if (list.map(vsCmd).includes("go")) vsResume();
    else
      setTimeout(() => {
        if (vs && vs.wait && !vs.paused && !vs.busy) vsListen();
      }, 1200);
    return;
  } // на остановке слушаем только «дальше»
  const retry = msg => {
    vs.fail++;
    vs.say = msg;
    vs.ok = "";
    vsRender();
    const again = () => {
      if (vs && !vs.paused && !vs.busy) vsListen();
    };
    if (vs.fail <= 2) vsTTS(vs.fail === 1 ? "Повторите." : "Не расслышал. Повторите число.", again);
    else setTimeout(again, 4000);
  }; // дальше слушаем тихо, без речи: человек может быть занят измерением
  if (!list.length) {
    retry("Ничего не услышал.");
    return;
  }
  const cmd = list.map(vsCmd).find(Boolean);
  if (cmd) {
    vs.fail = 0;
    if (cmd === "undo") {
      if (vs.last.length) vsUndo(o);
      else {
        vs.say = "Отменять нечего.";
        vsRender();
        vsAnnounce("");
      }
      return;
    }
    if (cmd === "skip") {
      vsSkip(o);
      return;
    }
    if (cmd === "none") {
      vsNone(o);
      return;
    }
    if (cmd === "again") {
      vs.say = "";
      vsRender();
      vsAnnounce("");
      return;
    }
    if (cmd === "go") {
      vs.say = "";
      vsRender();
      vsAnnounce("");
      return;
    }
    if (cmd === "pause") {
      vs.paused = true;
      vs.say = "Пауза.";
      vs.ok = "";
      vsRender();
      return;
    }
  }
  const r = rule(vs.cur.id);
  let multi = null;
  for (const t of list) {
    const p = parseMulti(t);
    if (p.items.length && (!multi || p.items.length > multi.items.length)) multi = p;
  }
  if (multi) {
    vsTake(o, multi.items);
    return;
  }
  for (const t of list) {
    const w = vNorm(t)
        .split(" ")
        .filter(x => !VFILL.has(x))
        .join(" "),
      p = w ? parseSpoken(w, r.unit, r) : null;
    if (p) {
      vsTake(o, [{ id: r.id, value: p.value, note: p.note, heard: t }]);
      return;
    }
  }
  retry("Не понял число. Услышал: «" + list[0] + "».");
}
