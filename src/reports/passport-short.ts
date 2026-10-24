import { BST, NORMS_VERSION, RES, kindOf, normText, rnd } from "../core/rules";
import { db } from "../core/storage";
import { DAY, blobToDataURL, esc, fmt } from "../core/util";
import { getPhoto } from "../photodb";
import { SLOTS, ensureSlots } from "../photos";
import { geoTxt, mapLink } from "../place";
import { exportRows } from "./basic";
import { OTYPES, routeGroups } from "../route";

export const REPORT_CSS = `body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;max-width:860px;margin:0 auto;padding:16px;color:#14213d;line-height:1.4}
h1{font-size:24px;margin:0 0 4px}h2{font-size:20px;margin:20px 0 6px}h3{margin:0 0 6px;font-size:18px}.muted{color:#5b6678}
section{border:1px solid #d5dbe6;border-radius:12px;padding:12px 14px;margin:12px 0;break-inside:avoid}
table{border-collapse:collapse;width:100%;font-size:15px}th{text-align:left;vertical-align:top;color:#5b6678;font-weight:600;padding:4px 8px 4px 0;width:34%}td{padding:4px 0}
.zt th,.zt td{border-bottom:1px solid #e3e7ef;padding:6px 8px 6px 0;width:auto}.zt th{color:#14213d}
.res{display:inline-block;margin:0 0 8px;padding:3px 10px;border-radius:999px;font-weight:700}.ok{background:#d8f3dc;color:#1b5e20}.bad{background:#ffd9d9;color:#9b1c1c}.relax,.old{background:#fff0c2;color:#7a5200}.nonorm{background:#e5e7eb;color:#374151}
.ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:10px}.ph img,figure img{width:100%;border-radius:8px;display:block}figure{margin:0}figcaption{font-size:13px;color:#5b6678}
a{color:#1F3864}@media print{body{padding:0}a{color:inherit;text-decoration:none}}`;
export function zoneStatus(c) {
  const n = (c.good || 0) + (c.cond || 0) + (c.old || 0) + (c.bad || 0);
  if (!n) return ["Не обследовано", "nonorm"];
  if (c.bad) return ["Выявлены нарушения", "bad"];
  if (c.cond || c.old) return ["Доступно условно или ниже современной нормы", "relax"];
  return ["Соответствует по обследованным параметрам", "ok"];
}
export async function buildPassport(objId) {
  const o = db.objects.find(x => x.id === objId);
  if (!o) return "";
  const rows = exportRows(objId),
    dt = t => new Date(t).toLocaleDateString("ru-RU");
  const zones = routeGroups(o)
    .map(g => {
      const rs = rows.filter(({ v }) => v.ru.group === g),
        c = {};
      rs.forEach(({ v }) => {
        const k = kindOf(v.k);
        c[k] = (c[k] || 0) + 1;
      });
      return { g, rs, c };
    })
    .concat(
      Object.values(
        rows.reduce((m, x) => {
          const g = x.v.ru.group;
          if (!routeGroups(o).includes(g)) {
            (m[g] = m[g] || { g, rs: [], c: {} }).rs.push(x);
            const k = kindOf(x.v.k);
            m[g].c[k] = (m[g].c[k] || 0) + 1;
          }
          return m;
        }, {})
      )
    );
  const bad = rows.filter(({ v }) => ["bad", "bad2", "old", "relax"].includes(v.k));
  const ds = rows.map(x => x.r.ts),
    d1 = ds.length ? Math.min(...ds) : Date.now(),
    d2 = ds.length ? Math.max(...ds) : Date.now();
  const zt = zones
    .map(z => {
      const [t, c] = zoneStatus(z.c);
      return `<tr><th>${esc(z.g)}</th><td>${z.rs.length ? z.rs.length + " замеров" : "—"}</td><td><span class="res ${c}" style="margin:0">${t}</span></td></tr>`;
    })
    .join("");
  let viol = "";
  let i = 0;
  for (const { r, v } of bad) {
    i++;
    const ru = v.ru;
    let ph = "";
    const s = ensureSlots(r);
    for (const [k, cap] of [...SLOTS, ...(r.extra || []).map((id, j) => ["x" + j, "Фото"])]) {
      const id = k[0] === "x" ? r.extra[+k.slice(1)] : s[k];
      if (!id) continue;
      const b = await getPhoto(id),
        d = b && (await blobToDataURL(b));
      if (d) ph += `<figure><img src="${d}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`;
    }
    viol += `<section><h3>${i}. ${esc(ru.name)}</h3><p class="res ${RES[v.k][1]}">${RES[v.k][0]}</p><table>
      <tr><th>Факт / требуется</th><td>${fmt(r.value)} ${esc(ru.unit)} / ${esc(normText(ru))}</td></tr><tr><th>Основание</th><td>${esc(ru.clause)}, ${esc(ru.doc)}</td></tr>
      ${r.exp ? `<tr><th>Опыт эксперта</th><td>${esc(r.exp)}</td></tr>` : ""}${r.fix ? `<tr><th>Что сделать</th><td>${esc(r.fix)}</td></tr>` : ""}${r.comment ? `<tr><th>Комментарий</th><td>${esc(r.comment)}</td></tr>` : ""}</table>${ph ? `<div class="ph">${ph}</div>` : ""}</section>`;
  }
  const docs = [...new Set(rows.map(x => x.v.ru.doc).filter(Boolean))];
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(o.name)} — справка о доступности</title><style>${REPORT_CSS}</style></head><body>
<p class="muted">Мастерская Горыныча: Экспертиза на колёсах · Новосибирск</p><h1>Справка о доступности объекта</h1>
<p class="muted">Основа для паспорта доступности. Это не официальная форма: данные переносятся в форму, утверждённую действующим приказом.</p>
<h2>1. Общие сведения</h2><table><tr><th>Объект</th><td>${esc(o.name)}</td></tr><tr><th>Адрес</th><td>${esc(o.address || "—")}${o.geo ? ` · <a href="${mapLink(o.geo)}">${geoTxt(o.geo)}</a>` : ""}</td></tr>
<tr><th>Вид объекта</th><td>${esc(OTYPES[o.type || "other"])}</td></tr><tr><th>Здание</th><td>${esc(BST[o.bstatus] || "—")}</td></tr>
<tr><th>Обследование</th><td>№${rnd(o)}, ${dt(d1)}${d2 - d1 > DAY ? " — " + dt(d2) : ""}</td></tr>${db.settings.author ? `<tr><th>Обследовал</th><td>${esc(db.settings.author)}</td></tr>` : ""}</table>
<h2>2. Состояние доступности по зонам</h2><table class="zt">${zt}</table>
<h2>3. Выявленные несоответствия (${bad.length})</h2>${viol || "<p>Несоответствий не выявлено.</p>"}
<h2>4. Нормативная база</h2><p>${esc(docs.join("; ") || "—")}. Справка норм: ${esc(NORMS_VERSION)}.</p>
<p class="muted">Результат — рабочая подсказка, а не юридическое заключение. Значения норм со статусом «требует сверки» нужно проверить по полному тексту.</p>
<p>Дата: ${dt(Date.now())} ${db.settings.author ? " · " + esc(db.settings.author) : ""}</p></body></html>`;
}
