import { parkNeed } from "../core/calc";
import { allRules } from "../core/rules";
import { db, save } from "../core/storage";
import { byId, esc, fmt, num } from "../core/util";
import { tiltCalStep, tiltLoad, tiltStart, tiltToMeasure } from "../tilt";
import { ui } from "../core/state";
import { app, applyBig, render } from "../ui/common";

export function renderTools() {
  tiltLoad();
  const slopeRules = allRules().filter(r => r.unit === "‰");
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">Калькулятор уклона пандуса</h2>
   <label for="rh">Перепад высот, мм</label><input id="rh" type="text" inputmode="decimal" placeholder="например 450">
   <label for="rl">Длина пандуса по горизонтали, мм</label><input id="rl" type="text" inputmode="decimal" placeholder="например 9000">
   <div id="rout"></div>
   <p class="muted">Длина одного марша (СП 59.13330.2020, п. 5.1.14, табл. 5.1): до 40‰ — 15 м, 40–50‰ — 12 м, 50–60‰ — 9 м, 61–80‰ — 6 м. Уклон больше 80‰ — только в стеснённых условиях, до 100‰ при длине наклонной плоскости до 5 м и с сопровождающим (прим. 2 к табл. 5.1). Сверено с текстом СП.</p></div>
   <div class="card"><h2 style="margin-top:0">Уклономер: телефон как уровень</h2>
   <p class="muted">Положите телефон экраном вверх на пандус или тротуар. Верх телефона (где камера) направьте по ходу движения: «вдоль» — продольный уклон, «поперёк» — поперечный. Стрелка показывает, куда поднимается поверхность: «↑ подъём» — впереди выше, «↓ спуск» — впереди ниже, «→» — справа выше, «←» — слева выше. Точность после калибровки примерно ±5‰, поэтому у самой границы нормы проверьте рулеткой.</p>
   <div id="tiltval"><p class="muted">Жду датчик…</p></div>
   <label for="tpar">Записать в замер как</label><select id="tpar">${slopeRules.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select>
   <div class="row" style="margin-top:8px"><button id="talong" type="button">Вдоль → в замер</button><button id="tcross" type="button">Поперёк → в замер</button></div>
   <details style="margin-top:10px"><summary>Калибровка (1 минута, один раз)</summary><p class="muted">1) Положите телефон на заведомо ровное место (стол, пол) и нажмите «Шаг 1». 2) Не сдвигая место, поверните телефон на 180° и нажмите «Шаг 2».</p>
   <div class="row"><button id="tcal1" type="button" class="small">Шаг 1</button><button id="tcal2" type="button" class="small" disabled>Шаг 2</button></div></details></div>
   <div class="card"><h2 style="margin-top:0">Парковка для инвалидов: сколько мест нужно</h2>
   <label for="pn">Всего мест на стоянке</label><input id="pn" type="text" inputmode="numeric" placeholder="например 120">
   <label for="pm">Сколько мест для инвалидов сейчас (необязательно)</label><input id="pm" type="text" inputmode="numeric">
   <div id="pout"></div><p class="muted">СП 59.13330.2020, п. 5.2.1: не менее 10% мест (но не менее одного) для людей с инвалидностью; из них специализированных (6000 × 3600 мм, для колясочников) — до 100 мест 5%, 101–200: 5 + 3% свыше 100, 201–500: 8 + 2% свыше 200, от 501: 14 + 1% свыше 500. Округление вверх.</p></div>`;
  const h = byId("rh"),
    l = byId("rl"),
    out = byId("rout");
  const upd = () => {
    const hh = num(h.value),
      ll = num(l.value);
    if (hh == null || ll == null || ll <= 0) {
      out.innerHTML = "";
      return;
    }
    const pm = (hh / ll) * 1000;
    const maxLen = pm <= 40 ? 15 : pm <= 50 ? 12 : pm <= 60 ? 9 : pm <= 80 ? 6 : null;
    let a, k;
    if (pm > 100) {
      a = "Уклон выше 100‰ — не соответствует.";
      k = "bad";
    } else if (pm > 80 && ll > 5000) {
      a =
        "Выше 80‰ допускается только при длине наклонной плоскости до 5 м, а здесь " +
        fmt((ll / 1000).toFixed(1)) +
        " м — не соответствует.";
      k = "bad";
    } else if (pm > 80) {
      a =
        "Выше 80‰: допустимо только в стеснённых условиях, длина до 5 м, передвижение с сопровождающим (до 100‰).";
      k = "relax";
    } else if (ll / 1000 <= maxLen) {
      a = "Уклон и длина марша в пределах нормы.";
      k = "ok";
    } else {
      a = "Марш длиннее допустимого (" + fmt(maxLen) + " м): нужна промежуточная площадка.";
      k = "bad";
    }
    out.innerHTML = `<div class="result ${k}">${esc(a)}<small>Уклон ${fmt(pm.toFixed(1))}‰ (${fmt((pm / 10).toFixed(1))} %), 1:${fmt((ll / hh).toFixed(1))}${maxLen ? `, макс. длина марша ${fmt(maxLen)} м` : ""}</small></div>`;
  };
  h.oninput = upd;
  l.oninput = upd;
  const pn = byId("pn"),
    pm = byId("pm"),
    po = byId("pout");
  const pupd = () => {
    const n = parseInt(pn.value, 10);
    if (!(n > 0)) {
      po.innerHTML = "";
      return;
    }
    const need = parkNeed(n),
      m = parseInt(pm.value, 10);
    po.innerHTML = `<div class="result ok">Нужно: ${need.all} мест для инвалидов, из них специализированных (6000 × 3600 мм) — ${need.spec}${isFinite(m) ? `<small>${m >= need.all ? "Мест для инвалидов достаточно. Проверьте, что специализированных (6000 × 3600 мм) среди них не меньше " + need.spec + "." : "Не хватает мест для инвалидов: " + (need.all - m) + "."}</small>` : ""}</div>`;
  };
  pn.oninput = pupd;
  pm.oninput = pupd;
  byId("tcal1").onclick = () => tiltCalStep(1);
  byId("tcal2").onclick = () => tiltCalStep(2);
  byId("talong").onclick = () => tiltToMeasure("along");
  byId("tcross").onclick = () => tiltToMeasure("cross");
  tiltStart();
}
export function renderMore() {
  const ver = (byId("appver") || {}).textContent || "";
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">Ещё</h2><div class="menu">
    <button type="button" data-go="export">Экспорт и отчёты</button><button type="button" data-go="stats">Сводка</button><button type="button" data-go="norms">Нормы (справка)</button></div></div>
    <div class="card"><label class="chk"><input type="checkbox" id="asimple"> <b>Простой режим</b> — для обхода объекта: только то, что нужно для замера, и сразу следующий пункт маршрута</label>${db.settings.simple ? `<button type="button" data-go="appeals" style="margin-top:8px">Обращения</button>` : ""}</div>
    <div class="card"><label for="abig">Размер кнопок и текста</label><select id="abig"><option value="0">Обычный</option><option value="1">Крупный</option><option value="2">Очень крупный</option></select>
    <label class="chk"><input type="checkbox" id="acs"> Спрашивать подтверждение перед сохранением замера</label></div>
    <div class="card"><label for="aname">Ваше имя в отчётах</label><input id="aname" type="text" autocomplete="off" value="${esc(db.settings.author || "")}" placeholder="Например: Витя"><p class="muted">${esc(ver)}</p></div>`;
  app.querySelectorAll("[data-go]").forEach(
    b =>
      (b.onclick = () => {
        ui.tab = b.dataset.go;
        render();
        window.scrollTo(0, 0);
      })
  );
  byId("asimple").checked = !!db.settings.simple;
  byId("asimple").onchange = e => {
    db.settings.simple = e.target.checked;
    if (e.target.checked && !db.settings.big) {
      db.settings.big = 1;
    }
    save();
    render();
  };
  byId("aname").oninput = e => {
    db.settings.author = e.target.value.trim();
    save();
  };
  byId("abig").value = String(db.settings.big || 0);
  byId("abig").onchange = e => {
    db.settings.big = +e.target.value as 0 | 1 | 2;
    save();
    applyBig();
  };
  byId("acs").checked = !!db.settings.confirmSave;
  byId("acs").onchange = e => {
    db.settings.confirmSave = e.target.checked;
    save();
  };
}
