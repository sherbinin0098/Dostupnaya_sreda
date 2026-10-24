import { RES, check, normText, plausible, rule } from "../core/rules";
import { curObj } from "../core/storage";
import { byId, esc, fmt, num } from "../core/util";
import { VFILL, VK, parseMulti, parseSpoken, vNorm } from "../core/voice-parse";
import { routeState } from "../route";
import { vsRecord } from "./dictation";
import { render, toast } from "../ui/common";
import { listenOnce, speechAvailable } from "../voice";

export let vm = null;
export function vmClose() {
  const e = byId("vmx");
  if (e) e.remove();
  vm = null;
  document.body.style.overflow = "";
}
export function vmOpen() {
  const o = curObj();
  if (!o) {
    toast("Сначала выберите объект");
    return;
  }
  const st = routeState(o);
  if (!st.gs.length) {
    toast("Для этого объекта нет пунктов маршрута");
    return;
  }
  vm = { group: (st.next && st.next.group) || st.gs[0].g, rows: [], bad: [], busy: "", say: "" };
  document.body.style.overflow = "hidden";
  vmRender();
}
export function vmRowHTML(x, o) {
  const r = rule(x.id),
    v = num(x.value),
    k = v == null ? null : check(r, v, o),
    res = k ? RES[k] : null,
    odd = v != null && !plausible(r, v);
  return `<div class="card vmrow" data-vid="${x.id}"><label class="chk" style="margin:0"><input type="checkbox" data-von="${x.id}" ${x.on ? "checked" : ""}> <b>${esc(r.name)}</b></label>
    <div class="inline"><input type="text" inputmode="decimal" data-vval="${x.id}" value="${esc(fmt(x.value))}" aria-label="Значение, ${esc(r.unit)}"><span class="muted" style="align-self:center">${esc(r.unit)}</span></div>
    ${res ? `<span class="badge ${res[1]}">${esc(res[0])}</span>` : ""}<span class="muted"> норма: ${esc(normText(r))}</span>
    ${odd ? `<div class="warn" role="alert">Похоже на опечатку — проверьте число.</div>` : ""}
    <div class="muted" style="font-size:14px">Услышано: «${esc(x.heard)}»${x.note ? " · принято как " + esc(x.note) : ""}</div></div>`;
}
export function vmRender() {
  const o = curObj();
  if (!vm || !o) return;
  const st = routeState(o),
    gi = st.gs.find(x => x.g === vm.group) || st.gs[0];
  vm.group = gi.g;
  const items = gi.items.filter(i => !i.skip && VK[i.r.id]),
    mic = speechAvailable(),
    n = vm.rows.filter(x => x.on && num(x.value) != null).length;
  let e = byId("vmx");
  if (!e) {
    e = document.createElement("div");
    e.id = "vmx";
    e.className = "vmx";
    e.setAttribute("role", "dialog");
    e.setAttribute("aria-label", "Диктовка списком");
    document.body.appendChild(e);
  }
  const scroll = e.scrollTop;
  e.innerHTML = `<div class="vmhead"><b>Голос списком</b><button type="button" class="small" id="vmclose">Закрыть</button></div>
    <div class="card"><b>Как говорить.</b> Назовите фразу с экрана и сразу число, можно несколько подряд. Например: <span class="vph">«${esc(VK.R01)}» девяносто пять сантиметров, «${esc(VK.R50)}» пять миллиметров</span>
      <div class="muted" style="margin-top:6px">Единицу можно не называть: приложение выберет мм, см или метры по норме и покажет, как поняло. Телефон слушает до паузы — продолжайте нажатием кнопки ещё раз.</div></div>
    ${vm.say ? `<div class="card" aria-live="polite">${esc(vm.say)}</div>` : ""}
    ${vm.bad.length ? `<div class="card warn" role="alert"><b>Не понял:</b> ${vm.bad.map(esc).join("; ")}<div class="muted">Скажите фразу с экрана и число. Фразы ниже.</div></div>` : ""}
    ${vm.rows.length ? `<h2 style="margin:8px 0">Понято — проверьте (${vm.rows.length})</h2>${vm.rows.map(x => vmRowHTML(x, o)).join("")}` : ""}
    <h2 style="margin:12px 0 6px">Что говорить</h2>
    <div class="chips vmchips">${st.gs.map(x => `<button type="button" class="small ${x.g === vm.group ? "primary" : ""}" data-vg="${esc(x.g)}">${esc(x.g)}</button>`).join("")}</div>
    ${items.map(i => `<div class="card vmph"><div><div class="vph">«${esc(VK[i.r.id])}»</div><div>${i.done ? "✓ " : ""}${esc(i.r.name)}</div><div class="muted">норма: ${esc(normText(i.r))}</div></div>${mic ? `<button type="button" class="small" data-vone="${i.r.id}" aria-label="Сказать только число: ${esc(i.r.name)}">🎤 число</button>` : ""}</div>`).join("") || `<p class="muted">В этом разделе нет пунктов для голоса.</p>`}
    <div class="vmbar">${mic ? `<button type="button" class="primary" id="vmmic" ${vm.busy ? "disabled" : ""}>${vm.busy ? "Слушаю…" : "🎤 Говорить"}</button>` : `<div class="warn">Голосовой ввод недоступен на этом телефоне.</div>`}<button type="button" id="vmsave" ${n ? "" : "disabled"}>Сохранить (${n})</button></div>`;
  e.scrollTop = scroll;
  byId("vmclose").onclick = () => {
    if (vm.rows.length && !confirm("Закрыть? Несохранённые числа пропадут.")) return;
    vmClose();
  };
  e.querySelectorAll("[data-vg]").forEach(
    b =>
      (b.onclick = () => {
        vm.group = b.dataset.vg;
        vmRender();
        e.scrollTop = 0;
      })
  );
  e.querySelectorAll("[data-von]").forEach(
    b =>
      (b.onchange = () => {
        vm.rows.find(x => x.id === b.dataset.von).on = b.checked;
        vmRender();
      })
  );
  e.querySelectorAll("[data-vval]").forEach(
    b =>
      (b.onchange = () => {
        const x = vm.rows.find(x => x.id === b.dataset.vval);
        x.value = b.value;
        x.note = "";
        x.on = num(b.value) != null && plausible(rule(x.id), num(b.value));
        vmRender();
      })
  );
  const mb = byId("vmmic");
  if (mb) mb.onclick = () => vmListen("");
  e.querySelectorAll("[data-vone]").forEach(b => (b.onclick = () => vmListen(b.dataset.vone)));
  byId("vmsave").onclick = vmSave;
}
export function vmAdd(items) {
  items.forEach(it => {
    const r = rule(it.id),
      row = {
        id: it.id,
        value: String(it.value).replace(".", ","),
        note: it.note || "",
        heard: it.heard,
        on: plausible(r, it.value),
      },
      k = vm.rows.findIndex(x => x.id === it.id);
    if (k >= 0) vm.rows[k] = row;
    else vm.rows.push(row);
  });
}
export async function vmListen(only) {
  if (vm.busy) return;
  vm.busy = "1";
  vm.say = "Слушаю…";
  vmRender();
  let list: string[] = [];
  try {
    list = await listenOnce();
  } catch (e) {
    const m = String((e && e.message) || e);
    vm.say = /not.*implemented|unavailable|no_recognizer|UNIMPLEMENTED/i.test(m)
      ? "Голосовой ввод недоступен на этом телефоне."
      : "Не получилось записать голос.";
    vm.busy = "";
    vmRender();
    return;
  }
  vm.busy = "";
  vm.bad = [];
  if (!list.length) {
    vm.say = "Ничего не услышал. Нажмите ещё раз.";
    vmRender();
    return;
  }
  if (only) {
    const r = rule(only);
    let p = null;
    for (const t of list) {
      p = parseSpoken(
        vNorm(t)
          .split(" ")
          .filter(w => !VFILL.has(w))
          .join(" "),
        r.unit,
        r
      );
      if (p) {
        p.heard = VK[only] + " " + t;
        break;
      }
    }
    if (p) {
      vmAdd([{ id: only, value: p.value, note: p.note, heard: p.heard }]);
      vm.say = "Понял: " + r.name + " — " + fmt(p.value) + " " + r.unit;
    } else {
      vm.say = "Число не услышано. Услышал: «" + list[0] + "»";
    }
    vmRender();
    return;
  }
  let best = null;
  for (const t of list) {
    const p = parseMulti(t);
    if (p.items.length && (!best || p.items.length > best.items.length)) best = p;
  }
  if (best) {
    vmAdd(best.items);
    vm.bad = best.bad;
    vm.say = "Услышал: «" + list[0] + "». Понято пунктов: " + best.items.length + ".";
  } else {
    vm.say = "Услышал: «" + list[0] + "». Не нашёл фразу из списка.";
    vm.bad = [list[0]];
  }
  vmRender();
}
export function vmSave() {
  const o = curObj();
  if (!o || !vm) return;
  let n = 0;
  vm.rows
    .filter(x => x.on)
    .forEach(x => {
      const v = num(x.value);
      if (v == null) return;
      vsRecord(o, x.id, v, x.heard);
      n++;
    });
  if (!n) return;
  toast("Сохранено замеров: " + n);
  vmClose();
  render();
}
