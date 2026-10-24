import type { Obj } from "../core/types";
import { backupBanner } from "../backup";
import { ACCESS_IDS, BST, allRules, check, exampleVal, normText, plausible, rnd, rule } from "../core/rules";
import { newDraft } from "../core/state";
import { curObj, db, groups, save } from "../core/storage";
import { byId, esc, fmt, num, uid } from "../core/util";
import { fillImgs, forgetPhoto, tilesHTML } from "../photos";
import { geoLine, hereFill, openPicker } from "../place";
import { exportRows } from "../reports/basic";
import { OTYPES, bindRoute, routeCardHTML, routeState, startRound } from "../route";
import { dueBanner } from "./appeals";
import { ui } from "../core/state";
import { app, bindChips, draftGeoHTML, fixChips, plausHTML, render, resultBox, toast } from "../ui/common";
import { dictate, speechAvailable } from "../voice";

export function renderMeasure() {
  const o = curObj();
  let h = `<div class="card"><label for="objsel">Объект</label>
    <select id="objsel"><option value="">— выберите объект —</option>${db.objects.map(x => `<option value="${x.id}" ${x.id === db.currentObj ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
    <div class="row" style="margin-top:10px"><button id="newobj" class="small">Новый объект</button>${o ? `<button id="editobj" class="small">Изменить</button>` : ""}</div>
    ${o ? `<p class="muted">${esc(o.address || "")}<br>${esc(BST[o.bstatus] || "")}${rnd(o) > 1 ? " · обследование №" + rnd(o) : ""}</p>` : ""}
    ${o && db.records.some(r => r.objId === o.id && (r.round || 1) === rnd(o)) ? `<button id="newround" class="small" type="button">Повторное обследование</button>` : ""}</div>`;
  h = dueBanner() + backupBanner() + h;
  if (!o) {
    h += `<div class="card">Сначала добавьте объект: название, адрес и пометка, существующее ли здание.</div>`;
    app.innerHTML = h;
    bindObj();
    return;
  }
  const gs = groups();
  {
    const badAcc = exportRows(o.id).filter(
      ({ v }) => ACCESS_IDS.has(v.ru.id) && ["bad", "bad2", "old", "relax"].includes(v.k)
    );
    if (badAcc.length)
      h += `<div class="card warn" role="alert"><b>Есть препятствия на пути к объекту или помещениям</b> (ступени без пандуса, нет съезда, нет лифта, нет доступного входа). Отмечено пунктов: ${badAcc.length}. Всё, что за препятствием, недоступно, даже если размеры в норме.<div class="muted">${badAcc.map(({ v }) => esc(v.ru.name)).join("; ")}</div></div>`;
  }
  h += routeCardHTML(o);
  const rs = allRules().filter(r => !ui.draft.group || r.group === ui.draft.group);
  const cur = ui.draft.ruleId ? rule(ui.draft.ruleId) : null;
  const simple = !!db.settings.simple;
  h += simple
    ? `<div class="card">${cur ? `<h2 style="margin-top:0">${esc(cur.name)}</h2>` : `<p>Нажмите «Дальше» в маршруте — приложение покажет, что мерить.</p>`}`
    : `<div class="card"><label for="grp">Раздел</label>
    <select id="grp"><option value="">Все разделы</option>${gs.map(g => `<option ${g === ui.draft.group ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>
    <label for="rul">Параметр</label>
    <select id="rul"><option value="">— выберите параметр —</option>${rs.map(r => `<option value="${r.id}" ${r.id === ui.draft.ruleId ? "selected" : ""}>${esc(r.name)} (${esc(r.unit)})</option>`).join("")}</select>`;
  if (cur) {
    h += `<p class="muted">Норма: ${esc(normText(cur))} · ${esc(cur.clause)}, ${esc(cur.doc)}</p>
    <label for="val">Факт, ${esc(cur.unit)}</label>
    <div class="inline"><input id="val" type="text" inputmode="decimal" autocomplete="off" placeholder="например ${esc(exampleVal(cur))}" value="${esc(ui.draft.value)}">${speechAvailable() ? `<button type="button" class="mic" id="mic" aria-label="Сказать число голосом">🎤</button>` : ""}</div>
    <p class="heard muted" id="heard" aria-live="polite"></p>
    <div id="live"></div>
    ${simple ? `<label>Подтверждающие фото</label>${tilesHTML("draft")}<label for="exp">Как это на коляске (по желанию)</label><textarea id="exp" placeholder="Например: дверь тяжёлая, одному не открыть">${esc(ui.draft.exp)}</textarea><details style="margin-top:8px"><summary>Дополнительно</summary>` : ""}
    <label>Место замера</label><div id="dgeo"></div>
    <div class="row" style="margin-top:6px"><button id="dhere" class="small" type="button">📍 Я здесь</button><button id="dmap" class="small" type="button">На карте</button></div>
    ${simple ? "" : `<label>Подтверждающие фото</label>${tilesHTML("draft")}`}
    <label class="chk"><input type="checkbox" id="stampChk" ${db.settings.stamp ? "checked" : ""}> Подписывать на фото дату и место</label>
    ${simple ? "" : `<label for="exp">Опыт эксперта: как это на коляске</label><textarea id="exp" placeholder="Например: дверь тяжёлая, одному не открыть">${esc(ui.draft.exp)}</textarea>`}
    <label for="fix">Что реально сделать</label><textarea id="fix" placeholder="Что может сделать объект или мэрия">${esc(ui.draft.fix)}</textarea>
    <div class="chips" id="fixchips">${fixChips(cur.group)}</div>
    <label for="cmt">Комментарий</label><textarea id="cmt">${esc(ui.draft.comment)}</textarea>${simple ? "</details>" : ""}
    <div style="margin-top:14px"><button id="saveM" class="primary" style="width:100%">Сохранить замер</button></div>`;
  }
  h += `</div>`;
  app.innerHTML = h;
  bindObj();
  bindRoute(o);
  const nr = byId("newround");
  if (nr) nr.onclick = () => startRound(o);
  const dg = byId("duego");
  if (dg)
    dg.onclick = () => {
      ui.tab = "appeals";
      render();
    };
  const bg = byId("bkgo");
  if (bg)
    bg.onclick = () => {
      ui.tab = "export";
      render();
      window.scrollTo(0, 0);
    };
  if (!simple) {
    document.getElementById("grp").onchange = e => {
      ui.draft.group = e.target.value;
      ui.draft.ruleId = "";
      ui.draft.value = "";
      ui.draft.cond = null;
      renderMeasure();
    };
    document.getElementById("rul").onchange = e => {
      ui.draft.ruleId = e.target.value;
      ui.draft.value = "";
      ui.draft.cond = null;
      renderMeasure();
    };
  }
  if (cur) {
    const val = document.getElementById("val"),
      live = document.getElementById("live");
    const upd = () => {
      ui.draft.value = val.value;
      const v = num(val.value);
      if (v == null) {
        live.innerHTML = "";
        return;
      }
      const k0 = check(cur, v, o);
      let html = resultBox(k0, cur, v, o, ui.draft.cond);
      if (k0 === "relax")
        html += `<p class="muted" style="margin-bottom:4px">Проверьте условие на месте и отметьте:</p><div class="row"><button type="button" class="${ui.draft.cond === true ? "primary" : ""}" data-c="1">Условие выполнено</button><button type="button" class="${ui.draft.cond === false ? "primary" : ""}" data-c="0">Условие не выполнено</button></div>`;
      html += plausHTML(cur, v);
      live.innerHTML = html;
      live.querySelectorAll("[data-fixv]").forEach(
        b =>
          (b.onclick = () => {
            val.value = String(b.dataset.fixv).replace(".", ",");
            val.dispatchEvent(new Event("input", { bubbles: true }));
          })
      );
      live.querySelectorAll("[data-c]").forEach(
        b =>
          (b.onclick = () => {
            ui.draft.cond = b.dataset.c === "1";
            upd();
          })
      );
    };
    val.oninput = upd;
    upd();
    const mic = byId("mic");
    if (mic)
      mic.onclick = () =>
        dictate(
          cur.unit,
          val,
          t => {
            byId("heard").textContent = t;
          },
          cur
        );
    if (ui.focusVal) {
      ui.focusVal = false;
      val.focus({ preventScroll: true });
      val.scrollIntoView({ block: "center" });
    }
    document.getElementById("cmt").oninput = e => {
      ui.draft.comment = e.target.value;
    };
    fillImgs(app);
    const sg = () => {
      byId("dgeo").innerHTML = draftGeoHTML(o);
      const x = byId("dgeox");
      if (x)
        x.onclick = () => {
          ui.draft.geo = null;
          ui.draft.place = "";
          sg();
        };
    };
    sg();
    byId("dhere").onclick = e =>
      hereFill(e.currentTarget, it => {
        ui.draft.geo = it.geo;
        ui.draft.place = it.address;
        sg();
      });
    byId("dmap").onclick = () =>
      openPicker(ui.draft.geo || o.geo, (g, a) => {
        ui.draft.geo = g;
        ui.draft.place = a || "";
        sg();
      });
    byId("stampChk").onchange = e => {
      db.settings.stamp = e.target.checked;
      save();
    };
    byId("exp").oninput = e => {
      ui.draft.exp = e.target.value;
    };
    const fx = byId("fix");
    fx.oninput = e => {
      ui.draft.fix = e.target.value;
    };
    bindChips(byId("fixchips"), fx, t => {
      ui.draft.fix = t;
    });
    byId("saveM").onclick = () => {
      const v = num(val.value);
      if (v == null) {
        alert("Введите число.");
        val.focus();
        return;
      }
      if (
        !plausible(cur, v) &&
        !confirm(
          "Значение " +
            fmt(v) +
            " " +
            cur.unit +
            " выглядит необычно (норма: " +
            normText(cur) +
            "). Сохранить как есть?"
        )
      )
        return;
      if (db.settings.confirmSave && !confirm("Сохранить замер: " + fmt(v) + " " + cur.unit + "?")) return;
      const k = check(cur, v, o),
        slots = Object.assign({}, ui.draft.slots);
      db.records.unshift({
        id: uid(),
        objId: o.id,
        round: rnd(o),
        ruleId: cur.id,
        value: v,
        result: k,
        ts: Date.now(),
        comment: ui.draft.comment.trim(),
        exp: ui.draft.exp.trim(),
        fix: ui.draft.fix.trim(),
        geo: ui.draft.geo,
        place: ui.draft.place,
        slots,
        photos: Object.values(slots).filter(Boolean) as string[],
        cond: k === "relax" ? ui.draft.cond : null,
      });
      save();
      ui.draft = newDraft(ui.draft.group);
      toast("Сохранено");
      if (simple) {
        const nx = routeState(o).next;
        if (nx) {
          ui.draft.group = nx.group;
          ui.draft.ruleId = nx.id;
          ui.focusVal = true;
          toast("Сохранено. Дальше: " + nx.name);
        }
        window.scrollTo(0, 0);
      }
      renderMeasure();
    };
  }
}
export function bindObj() {
  const s = document.getElementById("objsel");
  if (s)
    s.onchange = e => {
      db.currentObj = e.target.value || null;
      save();
      renderMeasure();
    };
  const n = document.getElementById("newobj");
  if (n) n.onclick = () => objForm(null);
  const e = document.getElementById("editobj");
  if (e) e.onclick = () => objForm(curObj());
}
export function objForm(o) {
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">${o ? "Изменить объект" : "Новый объект"}</h2>
    <label for="on">Название</label><input id="on" type="text" data-ac="name" autocomplete="off" value="${esc(o ? o.name : "")}" placeholder="Поликлиника № … — подскажу по карте">
    <label for="oa">Адрес</label><input id="oa" type="text" data-ac="addr" autocomplete="off" value="${esc(o ? o.address : "")}" placeholder="ул. …, дом">
    <div id="ogeo"></div>
    <div class="row" style="margin-top:6px"><button type="button" class="small" id="ohere">📍 Я здесь</button><button type="button" class="small" id="omap">На карте</button></div>
    <label for="ot">Что обследуем</label>
    <select id="ot">${Object.entries(OTYPES)
      .map(
        ([k, t]) =>
          `<option value="${k}" ${((o && o.type) || "bld") === k ? "selected" : ""}>${esc(t)}</option>`
      )
      .join("")}</select>
    <label for="oe">Строительство или реконструкция завершены позже 1 июля 2016 года?</label>
    <select id="oe">${[
      ["new", "Да — новое строительство"],
      ["recon", "Да — реконструкция"],
      ["old", "Нет — раньше, с тех пор не реконструировалось"],
      ["unknown", "Не знаю (уточню)"],
    ]
      .map(
        ([k, t]) =>
          `<option value="${k}" ${(o ? o.bstatus : "unknown") === k ? "selected" : ""}>${t}</option>`
      )
      .join("")}</select>
    <div class="row"><button class="primary" id="osave">Сохранить</button><button id="ocancel">Отмена</button></div>
    ${o ? `<div style="margin-top:12px"><button class="danger small" id="odel">Удалить объект и его замеры</button></div>` : ""}</div>`;
  let fg = o ? o.geo || null : null;
  const og = () => {
    byId("ogeo").innerHTML = fg
      ? geoLine(fg)
      : `<p class="muted" style="margin:4px 0 0">Место не отмечено. Начните вводить название или адрес — подскажу по карте. Или нажмите «Я здесь».</p>`;
  };
  og();
  const onm = byId("on"),
    oad = byId("oa");
  onm._acPick = it => {
    if (it.name) onm.value = it.name;
    if (it.address) oad.value = it.address;
    if (it.geo) {
      fg = it.geo;
      og();
    }
  };
  oad._acPick = it => {
    if (it.address) oad.value = it.address;
    if (it.geo) {
      fg = it.geo;
      og();
    }
  };
  byId("ohere").onclick = e =>
    hereFill(e.currentTarget, it => {
      if (it.address) oad.value = it.address;
      fg = it.geo;
      og();
    });
  byId("omap").onclick = () =>
    openPicker(fg, (g, a) => {
      fg = g;
      if (a) oad.value = a;
      og();
    });
  document.getElementById("ocancel").onclick = () => renderMeasure();
  document.getElementById("osave").onclick = () => {
    const name = document.getElementById("on").value.trim();
    if (!name) {
      alert("Введите название.");
      return;
    }
    const data: Partial<Obj> = {
      name,
      address: document.getElementById("oa").value.trim(),
      bstatus: document.getElementById("oe").value,
      type: byId("ot").value,
      geo: fg,
    };
    data.existing = data.bstatus !== "new";
    if (o) Object.assign(o, data);
    else {
      const n = Object.assign({ id: uid(), round: 1, rounds: [{ n: 1, ts: Date.now() }] }, data) as Obj;
      db.objects.push(n);
      db.currentObj = n.id;
    }
    save();
    renderMeasure();
  };
  const d = document.getElementById("odel");
  if (d)
    d.onclick = () => {
      const na = (db.appeals || []).filter(a => a.objId === o.id).length;
      if (!confirm("Удалить объект и все его замеры" + (na ? " и обращения (" + na + ")" : "") + "?")) return;
      db.appeals = (db.appeals || []).filter(a => a.objId !== o.id);
      db.records.filter(r => r.objId === o.id).forEach(r => (r.photos || []).forEach(forgetPhoto));
      db.records = db.records.filter(r => r.objId !== o.id);
      db.objects = db.objects.filter(x => x.id !== o.id);
      if (db.currentObj === o.id) db.currentObj = null;
      save();
      renderMeasure();
    };
}
