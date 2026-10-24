import { NORMS_VERSION, STATUS, allRules, normText, relaxText, rule } from "../core/rules";
import { db, save } from "../core/storage";
import { esc, fmt, num } from "../core/util";
import { backBtn, bindBack } from "./stats";
import { app, toast } from "../ui/common";

export function renderNorms() {
  const rs = allRules();
  let h = `<div class="card">${backBtn()}<h2 style="margin-top:0">Нормы (справка)</h2>
   <p class="muted">${esc(NORMS_VERSION)}. Если значения нет — впишите его здесь, и проверка сразу заработает. Правки хранятся на этом телефоне.</p>
   <input type="search" id="nq" placeholder="Поиск параметра"></div><div id="nlist"></div>`;
  app.innerHTML = h;
  const draw = () => {
    const q = document.getElementById("nq").value.toLowerCase();
    document.getElementById("nlist").innerHTML =
      `<div class="card">` +
      rs
        .filter(r => !q || (r.name + r.group + r.id).toLowerCase().includes(q))
        .map(
          r => `<div class="item">
      <div><b>${esc(r.name)}</b> <span class="muted">${esc(r.id)}</span></div>
      <div class="muted">${esc(r.group)} · ${esc(r.clause)}, ${esc(r.doc)}</div>
      <div>Норма: ${esc(normText(r))}${relaxText(r) ? ` · при реконструкции: ${esc(relaxText(r))}` : ""}</div>
      <div class="muted">${esc(STATUS[r.status] || "")}${db.overrides[r.id] ? " · изменено на телефоне" : ""}</div>
      ${r.note ? `<div class="muted">${esc(r.note)}</div>` : ""}
      ${r.cond ? `<div class="muted"><b>Условие допуска:</b> ${esc(r.cond)}</div>` : ""}
      <button class="small" data-edit="${r.id}" style="margin-top:6px">Изменить норму</button></div>`
        )
        .join("") +
      `</div>`;
    app.querySelectorAll("[data-edit]").forEach(b => (b.onclick = () => editRule(b.dataset.edit)));
  };
  document.getElementById("nq").oninput = draw;
  draw();
  bindBack();
}
export function editRule(id) {
  const r = rule(id);
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">${esc(r.name)}</h2><p class="muted">Единица: ${esc(r.unit)}. Пустое поле — без ограничения.</p>
   <div class="row"><div><label for="emin">Не менее</label><input id="emin" type="text" inputmode="decimal" value="${fmt(r.min)}"></div>
   <div><label for="emax">Не более</label><input id="emax" type="text" inputmode="decimal" value="${fmt(r.max)}"></div></div>
   <div class="row"><div><label for="eamin">Допуск: не менее (реконструкция)</label><input id="eamin" type="text" inputmode="decimal" value="${fmt(r.amin)}"></div>
   <div><label for="eamax">Допуск: не более (реконструкция)</label><input id="eamax" type="text" inputmode="decimal" value="${fmt(r.amax)}"></div></div>
   <label for="ecl">Пункт</label><input id="ecl" type="text" value="${esc(r.clause)}">
   <label for="ecnd">Условие допуска (для смягчения при реконструкции)</label><textarea id="ecnd">${esc(r.cond || "")}</textarea>
   <label for="est">Статус</label><select id="est">${Object.keys(STATUS)
     .map(k => `<option value="${k}" ${r.status === k ? "selected" : ""}>${STATUS[k]}</option>`)
     .join("")}</select>
   <div class="row" style="margin-top:12px"><button class="primary" id="esv">Сохранить</button><button id="ecn">Отмена</button></div>
   ${db.overrides[id] ? `<div style="margin-top:12px"><button class="small danger" id="ers">Вернуть исходное значение</button></div>` : ""}</div>`;
  document.getElementById("ecn").onclick = renderNorms;
  document.getElementById("esv").onclick = () => {
    const g = i => {
      const s = document.getElementById(i).value.trim();
      return s === "" ? null : num(s);
    };
    const o2 = {
      min: g("emin"),
      max: g("emax"),
      amin: g("eamin"),
      amax: g("eamax"),
      clause: document.getElementById("ecl").value.trim() || r.clause,
      status: document.getElementById("est").value,
      cond: document.getElementById("ecnd").value.trim(),
    };
    if (o2.status === "empty" && (o2.min != null || o2.max != null)) o2.status = "chk";
    db.overrides[id] = o2;
    save();
    toast("Норма сохранена");
    renderNorms();
  };
  const rs = document.getElementById("ers");
  if (rs)
    rs.onclick = () => {
      delete db.overrides[id];
      save();
      renderNorms();
    };
}
