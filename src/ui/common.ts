import { NORMS_VERSION, RES, effKind, normText, plausFix, plausible, relaxText } from "../core/rules";
import { db } from "../core/storage";
import { esc, fmt } from "../core/util";
import { geoLine } from "../place";
import { renderAppeals } from "../screens/appeals";
import { renderExport } from "../screens/export";
import { renderLog } from "../screens/log";
import { renderMeasure } from "../screens/measure";
import { renderNorms } from "../screens/norms";
import { renderStats } from "../screens/stats";
import { renderMore, renderTools } from "../screens/tools";
import { tiltStop } from "../tilt";
import { ui } from "../core/state";

export function resultBadge(k) {
  return `<span class="badge ${RES[k][1]}">${RES[k][0]}</span>`;
}
export function resultBox(k0, r, v, o, cond) {
  const k = effKind(k0, cond);
  let extra = "";
  if (k0 === "relax")
    extra = `<div class="cond"><b>Условие допуска:</b> ${esc(r.cond || r.note || "условие не указано — уточните по тексту СП")}<br>Допустимое отклонение для реконструкции: ${esc(relaxText(r))}.</div>`;
  if (k === "bad2") extra += `<small>Допуск возможен только при выполнении условия.</small>`;
  if (k === "old")
    extra = `<small>Здание введено до 01.07.2016 и не реконструировалось: отклонение — не нарушение размеров, а повод рекомендовать приспособление (ст. 15 закона № 181-ФЗ, «разумное приспособление»).</small>`;
  if (k === "bad" && o && o.bstatus === "new" && (r.amin != null || r.amax != null))
    extra = `<small>Для нового строительства смягчения не применяются. Если это была реконструкция, измените статус здания.</small>`;
  if (k === "nonorm") extra = `<small>Найдите норму и впишите её на вкладке «Нормы».</small>`;
  let w =
    r.status !== "ok"
      ? `<div class="warn">${r.status === "chk" ? "Норма требует сверки с полным текстом СП." : "Значение нормы не внесено."}</div>`
      : "";
  if (o && o.bstatus === "unknown")
    w += `<div class="warn">Статус здания не уточнён: проверка идёт как для реконструкции. Уточните, когда построено или реконструировано здание.</div>`;
  return `<div class="result ${RES[k][1]}">${RES[k][0]}<small>Факт: ${fmt(v)} ${esc(r.unit)}. Требуется: ${esc(normText(r))}.<br>${esc(r.clause)}, ${esc(r.doc)}</small>${extra}${w}</div>`;
}
export const app = document.getElementById("app");
export const TABS = [
  ["measure", "Замер"],
  ["log", "Журнал"],
  ["appeals", "Обращения"],
  ["tools", "Расчёты"],
  ["more", "Ещё"],
];
export const MORE = ["export", "stats", "norms"];
export const FIXES = {
  "Входная группа": [
    "Установить пандус или подъёмную платформу",
    "Убрать порог или сделать скос",
    "Заменить дверь на более широкую",
    "Установить кнопку вызова персонала",
  ],
  Тамбур: [
    "Изменить направление открывания двери",
    "Установить автоматическую дверь",
    "Установить кнопку вызова персонала",
  ],
  Коридор: ["Освободить проход от мебели и оборудования", "Сделать карман для разъезда"],
  "Пути движения": ["Освободить проход от препятствий", "Выровнять покрытие", "Сделать карман для разъезда"],
  Пандус: [
    "Переделать пандус с меньшим уклоном",
    "Добавить промежуточную площадку",
    "Установить поручни с двух сторон",
    "Установить бортики",
  ],
  "Бордюрный съезд": ["Понизить бордюр до уровня проезжей части", "Переделать съезд с меньшим уклоном"],
  Двери: [
    "Установить доводчик с задержкой закрывания",
    "Отрегулировать усилие доводчика",
    "Перенести кнопку на высоту 850–1100 мм",
  ],
  Информация: ["Установить тактильную табличку со стороны ручки"],
  "Туалет (универсальная кабина)": [
    "Установить опорные поручни",
    "Переоборудовать кабину под универсальную",
    "Установить кнопку тревожной сигнализации",
  ],
  Лестницы: [
    "Установить поручни с двух сторон",
    "Нанести контрастные противоскользящие полосы на края ступеней",
    "Выровнять ступени по высоте и ширине",
  ],
  "Внутри помещений": ["Освободить проход от мебели", "Перенести розетки и устройства в зону досягаемости"],
  "Места обслуживания": ["Опустить часть стойки до 850 мм", "Освободить проём для ног под столом"],
  "Места отдыха": ["Установить скамью с опорой для спины и подлокотниками", "Улучшить освещение"],
  Лифт: [
    "Перенести кнопки на доступную высоту",
    "Отрегулировать точность остановки",
    "Установить подъёмную платформу",
  ],
  Улица: ["Выровнять покрытие, заделать швы", "Установить освещение", "Обустроить место отдыха"],
};
export function fixChips(group) {
  const list = [
    ...(FIXES[group] || (group.indexOf("Улица") === 0 ? FIXES["Улица"] : [])),
    "Помощь персонала (разумное приспособление)",
  ];
  return list.map(t => `<button type="button" class="chip" data-fix="${esc(t)}">${esc(t)}</button>`).join("");
}
export function bindChips(box, ta, set) {
  box.querySelectorAll("[data-fix]").forEach(
    b =>
      (b.onclick = () => {
        const t = b.dataset.fix,
          v = ta.value.trim();
        if (v.includes(t)) return;
        ta.value = v ? v + "; " + t : t;
        set(ta.value);
      })
  );
}
export function draftGeoHTML(o) {
  return ui.draft.geo || ui.draft.place
    ? geoLine(ui.draft.geo, ui.draft.place) +
        `<button type="button" class="small" id="dgeox" style="margin-top:6px">Убрать место</button>`
    : `<p class="muted" style="margin:4px 0 0">Не отмечено${o.geo ? " — в отчёте будет место объекта" : ""}.</p>`;
}
export function renderNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = TABS.filter(([k]) => !(db.settings.simple && k === "appeals"))
    .map(
      ([k, t]) =>
        `<button data-tab="${k}" ${ui.tab === k || (k === "more" && MORE.includes(ui.tab)) ? 'aria-current="true"' : ""}>${t}</button>`
    )
    .join("");
  nav.querySelectorAll("button").forEach(
    b =>
      (b.onclick = () => {
        ui.tab = b.dataset.tab;
        render();
        window.scrollTo(0, 0);
      })
  );
}
export function render() {
  document.getElementById("normsub").textContent = "Нормы: " + NORMS_VERSION;
  applyBig();
  renderNav();
  tiltStop();
  ({
    measure: renderMeasure,
    log: renderLog,
    appeals: renderAppeals,
    tools: renderTools,
    more: renderMore,
    export: renderExport,
    stats: renderStats,
    norms: renderNorms,
  })[ui.tab]();
}
export function toast(t) {
  const d = document.createElement("div");
  d.textContent = t;
  d.setAttribute("role", "status");
  d.style.cssText =
    "position:fixed;left:50%;transform:translateX(-50%);bottom:96px;background:#14213d;color:#fff;padding:12px 18px;border-radius:12px;z-index:30;font-weight:700";
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1800);
}
export function plausHTML(r, v) {
  if (plausible(r, v)) return "";
  const fx = plausFix(r, v);
  return `<div class="warn" role="alert"><b>Похоже на опечатку.</b> ${fmt(v)} ${esc(r.unit)} для этого параметра необычно (норма: ${esc(normText(r))}).${fx != null ? ` <button type="button" class="small" data-fixv="${fx}" style="margin-top:6px">Исправить на ${fmt(fx)} ${esc(r.unit)}</button>` : ""}</div>`;
}
export function applyBig() {
  const k = (db.settings && db.settings.big) || 0;
  document.documentElement.classList.remove("big1", "big2");
  if (k) document.documentElement.classList.add("big" + k);
}
