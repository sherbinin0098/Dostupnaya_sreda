import { BADK, BST, NORMS_VERSION, RES, STATUS, normText, relaxText } from "../core/rules";
import { db } from "../core/storage";
import { blobToDataURL, esc, fmt } from "../core/util";
import { getPhoto } from "../photodb";
import { SLOTS, ensureSlots } from "../photos";
import { geoTxt, mapLink } from "../place";
import { condState, exportRows } from "./basic";

export async function buildReport(objId, onlyBad) {
  const o = db.objects.find(x => x.id === objId);
  if (!o) return "";
  const all = exportRows(objId),
    rows = all.filter(({ v }) => !onlyBad || BADK.includes(v.k));
  const cnt = {};
  all.forEach(({ v }) => {
    const k = RES[v.k][0];
    cnt[k] = (cnt[k] || 0) + 1;
  });
  const dt = t => new Date(t).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  let body = "";
  for (const [i, { r, v }] of rows.entries()) {
    const ru = v.ru,
      s = ensureSlots(r),
      g = r.geo || o.geo;
    let ph = "";
    for (const [k, cap] of [...SLOTS, ...(r.extra || []).map((id, j) => ["x" + j, "Фото"])]) {
      const id = k[0] === "x" ? r.extra[+k.slice(1)] : s[k];
      if (!id) continue;
      const b = await getPhoto(id);
      const d = b && (await blobToDataURL(b));
      if (d) ph += `<figure><img src="${d}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`;
    }
    const tr = (a, b) => (b ? `<tr><th>${a}</th><td>${b}</td></tr>` : "");
    body += `<section><h3>${i + 1}. ${esc(ru.name)}</h3><p class="res ${RES[v.k][1]}">${RES[v.k][0]}</p><table>
      ${tr("Факт", fmt(r.value) + " " + esc(ru.unit))}
      ${tr("Требуется", esc(ru.min !== undefined ? normText(ru) : "") + (relaxText(ru) ? " (при реконструкции — " + esc(relaxText(ru)) + ")" : ""))}
      ${tr("Основание", esc(ru.clause) + ", " + esc(ru.doc) + (ru.status && ru.status !== "ok" ? " — " + esc(STATUS[ru.status]) : ""))}
      ${v.baseK === "relax" ? tr("Условие допуска", esc(ru.cond || "—") + " — <b>" + esc(condState(v, r)) + "</b>") : ""}
      ${tr("Опыт эксперта", esc(r.exp))}${tr("Что реально сделать", esc(r.fix))}${tr("Комментарий", esc(r.comment))}
      ${tr("Место и время", [esc(r.place || ""), g ? `<a href="${mapLink(g)}">${geoTxt(g)}</a>` : "", dt(r.ts)].filter(Boolean).join(" · "))}
      </table>${ph ? `<div class="ph">${ph}</div>` : ""}</section>`;
  }
  const og = o.geo ? ` · <a href="${mapLink(o.geo)}">${geoTxt(o.geo)}</a>` : "";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.name)} — обследование доступности</title><style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;max-width:860px;margin:0 auto;padding:16px;color:#14213d;line-height:1.4}
h1{font-size:24px;margin:0 0 4px}h3{margin:0 0 6px;font-size:19px}.muted{color:#5b6678}
section{border:1px solid #d5dbe6;border-radius:12px;padding:12px 14px;margin:14px 0;break-inside:avoid}
table{border-collapse:collapse;width:100%;font-size:15px}th{text-align:left;vertical-align:top;width:34%;color:#5b6678;font-weight:600;padding:4px 8px 4px 0}td{padding:4px 0}
.res{display:inline-block;margin:0 0 8px;padding:3px 10px;border-radius:999px;font-weight:700}.ok{background:#d8f3dc;color:#1b5e20}.bad{background:#ffd9d9;color:#9b1c1c}.relax,.old{background:#fff0c2;color:#7a5200}.nonorm{background:#e5e7eb;color:#374151}
.ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:10px}figure{margin:0}figure img{width:100%;border-radius:8px;display:block}figcaption{font-size:13px;color:#5b6678}
a{color:#1F3864}@media print{body{padding:0}a{color:inherit;text-decoration:none}}
</style></head><body>
<p class="muted">Мастерская Горыныча: Экспертиза на колёсах · Новосибирск</p>
<h1>${esc(o.name)}</h1>
<p>Адрес: ${esc(o.address || "—")}${og}<br>Здание: ${esc(BST[o.bstatus] || "—")}<br>Дата отчёта: ${new Date().toLocaleDateString("ru-RU")}</p>
<p class="muted">Метод «тройственный взгляд»: опыт эксперта с инвалидностью, нормы (своды правил и закон) и реализуемость — что реально может сделать объект или мэрия.</p>
${o.bstatus === "old" ? "<p><b>Примечание:</b> здание введено до 01.07.2016 и не реконструировалось; отклонения — несоответствие современным требованиям, просим принять меры по приспособлению.</p>" : ""}
<p><b>${onlyBad ? "Выявленные несоответствия" : "Результаты замеров"}:</b> ${rows.length}${
    onlyBad
      ? ""
      : " · " +
        Object.entries(cnt)
          .map(([k, n]) => esc(k) + ": " + n)
          .join(" · ")
  }</p>
${body || "<p>—</p>"}
<p class="muted">Нормы: ${esc(NORMS_VERSION)}. Значения норм должны быть сверены с действующей редакцией свода правил. Результат — рабочая подсказка, а не юридическое заключение.</p>
</body></html>`;
}
export async function buildBackup() {
  const photos: Record<string, string> = {},
    ids = new Set<string>();
  db.records.forEach(r => (r.photos || []).forEach(id => ids.add(id)));
  for (const id of ids) {
    const b = await getPhoto(id);
    const d = b && (await blobToDataURL(b));
    if (d) photos[id] = d;
  }
  return {
    text: JSON.stringify({ app: "gorynych-dostup", v: 2, saved: new Date().toISOString(), db, photos }),
    n: Object.keys(photos).length,
  };
}
