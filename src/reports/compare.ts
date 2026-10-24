import { NORMS_VERSION, RES, isGood, normText, rnd } from "../core/rules";
import { db } from "../core/storage";
import { blobToDataURL, esc, fmt } from "../core/util";
import { getPhoto } from "../photodb";
import { REPORT_CSS } from "./passport-short";
import { recView } from "../screens/log";

export function cmpData(o) {
  const last = rnd(o);
  if (last < 2) return null;
  const by = {};
  db.records
    .filter(r => r.objId === o.id)
    .forEach(r => {
      const n = r.round || 1,
        m = by[r.ruleId] || (by[r.ruleId] = {});
      if (!m[n] || m[n].ts < r.ts) m[n] = r;
    });
  const rows = [];
  Object.keys(by).forEach(id => {
    const m = by[id],
      prevN = Object.keys(m)
        .map(Number)
        .filter(n => n < last)
        .sort((a, b) => b - a)[0];
    const b = prevN ? m[prevN] : null,
      a = m[last] || null;
    if (!b && !a) return;
    const bv = b ? recView(b) : null,
      av = a ? recView(a) : null,
      ru = (av || bv).ru;
    if ((bv && bv.k === "nonorm") || (av && av.k === "nonorm")) return;
    let cat;
    const bg = bv ? isGood(bv.k) : null,
      ag = av ? isGood(av.k) : null;
    if (!b) cat = "new";
    else if (!a) cat = bg ? "ok" : "wait";
    else if (!bg && ag) cat = "fixed";
    else if (!bg && !ag) cat = "still";
    else if (bg && !ag) cat = "worse";
    else cat = "ok";
    rows.push({ ru, b, a, bv, av, cat });
  });
  const cnt = { fixed: 0, still: 0, wait: 0, worse: 0, new: 0, ok: 0 };
  rows.forEach(x => {
    if (x.cat === "new" && x.av && isGood(x.av.k)) x.cat = "ok";
    cnt[x.cat]++;
  });
  return {
    last,
    rows,
    cnt,
    prevBad: cnt.fixed + cnt.still + cnt.wait,
    ts: (o.rounds || []).find(x => x.n === last),
  };
}
export const CMPN = {
  fixed: "Устранено",
  still: "Не устранено",
  wait: "Не проверено повторно",
  worse: "Появилось нарушение",
  new: "Новый замер",
  ok: "Было и осталось в норме",
};
export const CMPC = { fixed: "ok", still: "bad", wait: "relax", worse: "bad", new: "nonorm", ok: "ok" };
export function cmpValTxt(x, w) {
  const r = w === "b" ? x.b : x.a,
    v = w === "b" ? x.bv : x.av;
  return r ? `${fmt(r.value)} ${x.ru.unit} — ${RES[v.k][0]}` : "—";
}
export function cmpSummary(c) {
  return `Ранее выявлено нарушений: ${c.prevBad}. Устранено: ${c.cnt.fixed}. Не устранено: ${c.cnt.still}. Не проверено повторно: ${c.cnt.wait}. Появилось новых нарушений: ${c.cnt.worse}.`;
}
export function cmpCardHTML(o) {
  const c = cmpData(o);
  if (!c) return "";
  const rows = c.rows.filter(x => ["still", "fixed", "worse", "wait"].includes(x.cat));
  return (
    `<div class="card"><h3 style="margin:0 0 6px">До и после: ${esc(o.name)}</h3>
    <div class="stat"><span class="badge ok">устранено: ${c.cnt.fixed}</span><span class="badge bad">не устранено: ${c.cnt.still}</span><span class="badge relax">не проверено: ${c.cnt.wait}</span><span class="badge bad">новые: ${c.cnt.worse}</span></div>
    <p class="muted">${esc(cmpSummary(c))}</p>` +
    rows
      .map(
        x =>
          `<div class="item"><b>${esc(x.ru.name)}</b><div class="muted">${esc(CMPN[x.cat])}</div><div>Было: ${esc(cmpValTxt(x, "b"))}</div><div>Стало: ${esc(cmpValTxt(x, "a"))}</div></div>`
      )
      .join("") +
    `</div>`
  );
}
export function cmpText(o) {
  const c = cmpData(o);
  if (!c) return "";
  let t = `Повторное обследование объекта «${o.name}»${o.address ? ", " + o.address : ""}.\nДата: ${new Date().toLocaleDateString("ru-RU")}.\n\n${cmpSummary(c)}\n`;
  const part = (cat, title) => {
    const rs = c.rows.filter(x => x.cat === cat);
    if (!rs.length) return;
    t += `\n${title}:\n`;
    rs.forEach((x, i) => {
      t += `${i + 1}. ${x.ru.name}: было ${cmpValTxt(x, "b")}; стало ${cmpValTxt(x, "a")}; требуется ${normText(x.ru)} (${x.ru.clause}, ${x.ru.doc}).\n`;
    });
  };
  part("still", "Не устранено");
  part("worse", "Появились нарушения");
  part("wait", "Не проверено повторно");
  part("fixed", "Устранено");
  return t + "\nЗначения норм должны быть сверены с действующей редакцией свода правил.\n";
}
export async function cmpReport(o) {
  const c = cmpData(o);
  if (!c) return "";
  const dt = t => (t ? new Date(t).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "");
  let body = "";
  for (const x of c.rows.filter(x => x.cat !== "ok")) {
    const ph = async r => {
      const id = r && (r.photos || []).find(Boolean);
      const b = id && (await getPhoto(id));
      const d = b && (await blobToDataURL(b));
      return d ? `<img src="${d}" alt="">` : "";
    };
    body += `<section><h3>${esc(x.ru.name)}</h3><p class="res ${CMPC[x.cat]}">${esc(CMPN[x.cat])}</p>
      <table><tr><th>Требуется</th><td>${esc(normText(x.ru))} (${esc(x.ru.clause)}, ${esc(x.ru.doc)})</td></tr>
      <tr><th>Было</th><td>${esc(cmpValTxt(x, "b"))}${x.b ? " · " + dt(x.b.ts) : ""}</td></tr><tr><th>Стало</th><td>${esc(cmpValTxt(x, "a"))}${x.a ? " · " + dt(x.a.ts) : ""}</td></tr></table>
      <div class="ph">${await ph(x.b)}${await ph(x.a)}</div></section>`;
  }
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(o.name)} — до и после</title><style>${REPORT_CSS}</style></head><body>
<p class="muted">Мастерская Горыныча: Экспертиза на колёсах · Новосибирск</p><h1>${esc(o.name)}: повторное обследование</h1>
<p>Адрес: ${esc(o.address || "—")}<br>Обследование №${c.last}${c.ts && c.ts.ts ? " от " + dt(c.ts.ts) : ""}</p><p><b>${esc(cmpSummary(c))}</b></p>${body || "<p>—</p>"}
<p class="muted">Нормы: ${esc(NORMS_VERSION)}. Результат — рабочая подсказка, а не юридическое заключение.</p></body></html>`;
}
