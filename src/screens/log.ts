import type { Rec } from "../core/types";
import { unknownRule, check, effKind, normText, rnd, rule } from "../core/rules";
import { db, save } from "../core/storage";
import { byId, esc, fmt, num } from "../core/util";
import { isNative, nativeShareBlob } from "../native";
import { getPhoto } from "../photodb";
import {
  SLOTN,
  annotatePhoto,
  fillImgs,
  forgetPhoto,
  removeSlotPhoto,
  setSlotPhoto,
  tilesHTML,
} from "../photos";
import { geoLine, hereFill, openMapAll, openPicker } from "../place";
import { cmpCardHTML } from "../reports/compare";
import { ui } from "../core/state";
import { app, bindChips, fixChips, resultBadge, toast } from "../ui/common";

export function recView(r: Rec) {
  const known = rule(r.ruleId);
  const ru = known || unknownRule(r.ruleId);
  const ob = db.objects.find(o => o.id === r.objId);
  const baseK = known && ob ? check(ru, r.value, ob) : r.result;
  return { ru, ob, baseK, k: effKind(baseK, r.cond) };
}
// Журнал показываем порциями: 600 замеров разом — это ~17 000 элементов и секунды ожидания на телефоне
const LOG_PAGE = 50;
let logShown = LOG_PAGE;

export function renderLog() {
  const list = db.records.filter(r => ui.logFilter === "all" || r.objId === ui.logFilter);
  const cnt = { ok: 0, bad: 0, relax: 0, relaxok: 0, old: 0, nonorm: 0 };
  const items = list.map(r => {
    const v = recView(r);
    cnt[v.k === "bad2" ? "bad" : v.k]++;
    return { r, v };
  });
  let h = `<div class="card"><label for="lf">Показать</label><select id="lf"><option value="all">Все объекты</option>${db.objects.map(o => `<option value="${o.id}" ${ui.logFilter === o.id ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>
  <div class="stat"><span class="badge ok">соотв.: ${cnt.ok}</span><span class="badge bad">не соотв.: ${cnt.bad}</span><span class="badge relax">ждут проверки условия: ${cnt.relax}</span><span class="badge relax">допустимо: ${cnt.relaxok}</span><span class="badge old">до 2016: ${cnt.old}</span><span class="badge nonorm">нет нормы: ${cnt.nonorm}</span></div>
  ${items.length ? `<button id="lmapall" class="small" style="width:100%">🗺 Замеры на карте</button>` : ""}</div>`;
  {
    const fo = ui.logFilter !== "all" ? db.objects.find(x => x.id === ui.logFilter) : null;
    if (fo) h += cmpCardHTML(fo);
  }
  if (!items.length) h += `<div class="card muted">Замеров пока нет.</div>`;
  else
    h +=
      `<div class="card">` +
      items
        .slice(0, logShown)
        .map(
          ({ r, v }) => `<div class="item" data-id="${r.id}">
    <div><b>${esc(v.ru.name)}</b></div>
    <div class="muted">${esc(v.ob ? v.ob.name : "?")} · ${new Date(r.ts).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}${v.ob && rnd(v.ob) > 1 ? " · обследование №" + (r.round || 1) : ""}</div>
    <div>Факт: <b>${fmt(r.value)} ${esc(v.ru.unit)}</b> · ${resultBadge(v.k)}</div>
    <div class="muted">Норма: ${esc(v.ru.min !== undefined ? normText(v.ru) : "")} · ${esc(v.ru.clause)}, ${esc(v.ru.doc)}</div>
    ${v.baseK === "relax" ? `<div class="warn"><b>Условие допуска:</b> ${esc(v.ru.cond || "не указано")}</div><div class="row" style="margin-top:6px"><button class="small ${r.cond === true ? "primary" : ""}" data-cond="1" data-rid="${r.id}">Условие выполнено</button><button class="small ${r.cond === false ? "primary" : ""}" data-cond="0" data-rid="${r.id}">Не выполнено</button></div>` : ""}
    ${geoLine(r.geo, r.place)}
    ${r.exp ? `<div><b>Опыт эксперта:</b> ${esc(r.exp)}</div>` : ""}
    ${r.fix ? `<div><b>Что сделать:</b> ${esc(r.fix)}</div>` : ""}
    ${r.comment ? `<div>${esc(r.comment)}</div>` : ""}
    ${tilesHTML(r.id)}
    <div class="row" style="margin-top:6px"><button class="small" data-edit="${r.id}">Изменить</button><button class="small danger" data-del="${r.id}">Удалить</button></div></div>`
        )
        .join("") +
      (items.length > logShown
        ? `<button id="logmore" style="width:100%;margin-top:10px">Показать ещё (осталось ${items.length - logShown})</button>`
        : "") +
      `</div>`;
  app.innerHTML = h;
  const more = byId("logmore");
  if (more)
    more.onclick = () => {
      logShown += LOG_PAGE;
      renderLog();
    };
  document.getElementById("lf").onchange = e => {
    ui.logFilter = e.target.value;
    logShown = LOG_PAGE;
    renderLog();
  };
  app.querySelectorAll("[data-cond]").forEach(
    b =>
      (b.onclick = () => {
        const r = db.records.find(x => x.id === b.dataset.rid);
        if (r) {
          r.cond = b.dataset.cond === "1";
          save();
          renderLog();
        }
      })
  );
  app.querySelectorAll("[data-del]").forEach(
    b =>
      (b.onclick = () => {
        if (!confirm("Удалить замер?")) return;
        const r = db.records.find(x => x.id === b.dataset.del);
        if (r) (r.photos || []).forEach(forgetPhoto);
        db.records = db.records.filter(x => x.id !== b.dataset.del);
        save();
        renderLog();
      })
  );
  fillImgs(app);
  app.querySelectorAll("[data-edit]").forEach(
    b =>
      (b.onclick = () => {
        editRec(b.dataset.edit);
        window.scrollTo(0, 0);
      })
  );
  const lm = byId("lmapall");
  if (lm) lm.onclick = () => openMapAll(items);
}
export function editRec(id) {
  const r = db.records.find(x => x.id === id);
  if (!r) return;
  const v = recView(r);
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">${esc(v.ru.name)}</h2><p class="muted">${esc(v.ob ? v.ob.name : "")} · ${new Date(r.ts).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</p>
   <label for="rv">Факт, ${esc(v.ru.unit)}</label><input id="rv" type="text" inputmode="decimal" autocomplete="off" value="${fmt(r.value)}">
   <label>Место замера</label><div id="rgeo"></div>
   <div class="row" style="margin-top:6px"><button type="button" class="small" id="rhere">📍 Я здесь</button><button type="button" class="small" id="rmap">На карте</button></div>
   <label>Подтверждающие фото</label>${tilesHTML(r.id)}
   <label for="rexp">Опыт эксперта: как это на коляске</label><textarea id="rexp">${esc(r.exp || "")}</textarea>
   <label for="rfix">Что реально сделать</label><textarea id="rfix">${esc(r.fix || "")}</textarea><div class="chips" id="rchips">${fixChips(v.ru.group || "")}</div>
   <label for="rcmt">Комментарий</label><textarea id="rcmt">${esc(r.comment || "")}</textarea>
   <p class="muted">Фото сохраняются сразу. Остальное — кнопкой «Сохранить».</p>
   <div class="row" style="margin-top:12px"><button class="primary" id="rsv">Сохранить</button><button id="rcn">Назад</button></div></div>`;
  fillImgs(app);
  let g = r.geo || null,
    pl = r.place || "";
  const sg = () => {
    byId("rgeo").innerHTML =
      g || pl
        ? geoLine(g, pl) +
          `<button type="button" class="small" id="rgeox" style="margin-top:6px">Убрать место</button>`
        : `<p class="muted" style="margin:4px 0 0">Не отмечено${v.ob && v.ob.geo ? " — в отчёте будет место объекта" : ""}.</p>`;
    const x = byId("rgeox");
    if (x)
      x.onclick = () => {
        g = null;
        pl = "";
        sg();
      };
  };
  sg();
  byId("rhere").onclick = e =>
    hereFill(e.currentTarget, it => {
      g = it.geo;
      pl = it.address;
      sg();
    });
  byId("rmap").onclick = () =>
    openPicker(g || (v.ob && v.ob.geo), (gg, a) => {
      g = gg;
      pl = a || "";
      sg();
    });
  const fx = byId("rfix");
  bindChips(byId("rchips"), fx, () => {});
  byId("rcn").onclick = renderLog;
  byId("rsv").onclick = () => {
    const val = num(byId("rv").value);
    if (val == null) {
      alert("Введите число.");
      return;
    }
    r.value = val;
    if (v.ob && v.ru.min !== undefined) r.result = check(v.ru, val, v.ob);
    if (r.result !== "relax") r.cond = null;
    r.geo = g;
    r.place = pl;
    r.exp = byId("rexp").value.trim();
    r.fix = fx.value.trim();
    r.comment = byId("rcmt").value.trim();
    save();
    toast("Сохранено");
    renderLog();
  };
}
export async function showPhoto(id, ctx) {
  const b = await getPhoto(id);
  if (!b) return;
  const u = URL.createObjectURL(b);
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.setAttribute("role", "dialog");
  ov.innerHTML = `${ctx ? `<div class="vcap">${esc(SLOTN[ctx.slot] || "Фото")}</div>` : ""}<img src="${u}" alt="Фото">
   ${ctx ? `<div class="row" style="width:100%;max-width:520px"><label class="btnlike"><input type="file" accept="image/*" capture="environment" class="vh" data-vrep="1">Переснять</label><label class="btnlike"><input type="file" accept="image/*" class="vh" data-vrep="1">Из галереи</label></div>` : ""}
   <div class="row" style="width:100%;max-width:520px"><button id="psh" class="primary">Поделиться</button>${ctx ? `<button id="pann">Пометить</button><button id="prm" class="danger">Убрать</button>` : ""}<button id="pcl">Закрыть</button></div>`;
  document.body.appendChild(ov);
  const close = () => {
    URL.revokeObjectURL(u);
    ov.remove();
  };
  ov.querySelector("#pcl").onclick = close;
  ov.querySelector("#psh").onclick = async () => {
    const f = new File([b], "foto.jpg", { type: "image/jpeg" });
    try {
      if (isNative) {
        await nativeShareBlob("foto.jpg", b);
        return;
      }
      if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] });
      else {
        const a = document.createElement("a");
        a.href = u;
        a.download = "foto.jpg";
        a.click();
      }
    } catch (e) {}
  };
  if (ctx) {
    ov.querySelectorAll("[data-vrep]").forEach(
      inp =>
        (inp.onchange = e => {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          close();
          setSlotPhoto(ctx.scope, ctx.slot, f);
        })
    );
    ov.querySelector("#pann").onclick = () => {
      close();
      annotatePhoto(id, ctx);
    };
    ov.querySelector("#prm").onclick = () => {
      if (!confirm("Убрать это фото?")) return;
      close();
      removeSlotPhoto(ctx.scope, ctx.slot);
    };
  }
}
