import { allRules, hasNorm, rnd, rule, skipKey } from "./core/rules";
import { newDraft } from "./core/state";
import { db, groups, save } from "./core/storage";
import { byId, esc } from "./core/util";
import { vsOpen } from "./screens/dictation";
import { renderMeasure } from "./screens/measure";
import { vmOpen } from "./screens/voice-list";
import { ui } from "./core/state";
import { toast } from "./ui/common";
import { speechAvailable } from "./voice";

export const OTYPES = {
  bld: "Здание (поликлиника, школа, магазин, офис…)",
  street: "Улица, тротуары, переходы",
  other: "Всё подряд (все разделы)",
};
export const ROUTES = {
  bld: [
    "Парковка для МГН",
    "Пути движения",
    "Места отдыха",
    "Пандус",
    "Лестницы",
    "Бордюрный съезд",
    "Входная группа",
    "Тамбур",
    "Двери",
    "Информация",
    "Коридор",
    "Внутри помещений",
    "Лифт",
    "Места обслуживания",
    "Туалет (универсальная кабина)",
    "Доступ к помещениям",
  ],
  street: [
    "Парковка для МГН",
    "Пути движения",
    "Места отдыха",
    "Бордюрный съезд",
    "Пандус",
    "Лестницы",
    "Улица / покрытие",
    "Улица / переходы",
    "Улица / зона отдыха",
    "Улица / маршрут",
  ],
  other: null,
};
export function routeGroups(o) {
  return ROUTES[(o && o.type) || "other"] || groups();
}
export function routeState(o) {
  const done = new Set(
    db.records.filter(r => r.objId === o.id && (r.round || 1) === rnd(o)).map(r => r.ruleId)
  );
  const skip = o.skip || {},
    all = allRules();
  const gs = routeGroups(o)
    .map(g => ({
      g,
      items: all
        .filter(r => r.group === g && hasNorm(r))
        .map(r => ({ r, done: done.has(r.id), skip: !!skip[skipKey(o, r.id)] })),
    }))
    .filter(x => x.items.length);
  let total = 0,
    fin = 0,
    next = null;
  gs.forEach(x =>
    x.items.forEach(i => {
      if (i.skip) return;
      total++;
      if (i.done) fin++;
      else if (!next) next = i.r;
    })
  );
  return { gs, total, fin, next };
}
export let routeOpen = false;
export function routeCardHTML(o) {
  const st = routeState(o),
    pct = st.total ? Math.round((st.fin / st.total) * 100) : 0;
  const list = st.gs
    .map(x => {
      const d = x.items.filter(i => i.done && !i.skip).length,
        n = x.items.filter(i => !i.skip).length;
      return (
        `<div class="rgrp"><b>${esc(x.g)}</b> <span class="muted">${d} из ${n}</span>` +
        x.items
          .map(
            i =>
              `<div class="rrow"><button type="button" class="rt ${i.done ? "done" : ""} ${i.skip ? "skip" : ""}" data-rule="${i.r.id}">${i.done ? "✓ " : i.skip ? "– " : ""}${esc(i.r.name)}</button><button type="button" class="small rskip" data-skip="${i.r.id}" aria-label="${i.skip ? "Вернуть пункт" : "Не применимо"}">${i.skip ? "вернуть" : "нет такого"}</button></div>`
          )
          .join("") +
        `</div>`
      );
    })
    .join("");
  return `<div class="card"><div class="row" style="align-items:center;justify-content:space-between"><b>Маршрут обследования</b><span class="muted">${esc(OTYPES[o.type || "other"].split(" (")[0])}</span></div>
    <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
    <p class="muted" style="margin:4px 0 8px">Проверено ${st.fin} из ${st.total}${rnd(o) > 1 ? " · обследование №" + rnd(o) : ""}</p>
    ${st.next ? `<button type="button" class="primary" id="rnext" style="width:100%">Дальше: ${esc(st.next.name)}</button>` : `<div class="result ok" style="margin:0">Маршрут пройден</div>`}
    ${speechAvailable() ? `<button type="button" id="vsopen" class="primary" style="width:100%;margin-top:8px">🎤 Диктовка: телефон лежит, говорю числа</button><button type="button" id="vmopen" style="width:100%;margin-top:8px">Диктовать списком (с подсказками)</button>` : ""}
    <details id="rdet" ${routeOpen ? "open" : ""} style="margin-top:8px"><summary>Весь маршрут и пропуск пунктов</summary>${list}</details></div>`;
}
export function bindRoute(o) {
  const pick = id => {
    const r = rule(id);
    ui.draft.group = r.group;
    ui.draft.ruleId = r.id;
    ui.draft.value = "";
    ui.draft.cond = null;
    ui.focusVal = true;
    renderMeasure();
  };
  const nx = byId("rnext");
  if (nx) nx.onclick = () => pick(routeState(o).next.id);
  const vo = byId("vmopen");
  if (vo) vo.onclick = vmOpen;
  const vso = byId("vsopen");
  if (vso) vso.onclick = vsOpen;
  const det = byId("rdet");
  if (det)
    det.ontoggle = () => {
      routeOpen = det.open;
    };
  document.querySelectorAll("[data-rule]").forEach(b => (b.onclick = () => pick(b.dataset.rule)));
  document.querySelectorAll("[data-skip]").forEach(
    b =>
      (b.onclick = () => {
        o.skip = o.skip || {};
        const k = skipKey(o, b.dataset.skip);
        if (o.skip[k]) delete o.skip[k];
        else o.skip[k] = true;
        save();
        routeOpen = true;
        renderMeasure();
      })
  );
}
export function startRound(o) {
  if (
    !confirm(
      "Начать повторное обследование №" +
        (rnd(o) + 1) +
        "? Прежние замеры останутся как «до», маршрут начнётся заново."
    )
  )
    return;
  o.round = rnd(o) + 1;
  (o.rounds = o.rounds || [{ n: 1, ts: 0 }]).push({ n: o.round, ts: Date.now() });
  ui.draft = newDraft(ui.draft.group);
  routeOpen = false;
  save();
  toast("Обследование №" + o.round);
  renderMeasure();
}
