import { BST, RES, kindOf, normText, rnd } from "../core/rules";
import { db } from "../core/storage";
import { byId } from "../core/util";
import { exportRows } from "./basic";
import { OTYPES } from "../route";
import { toast } from "../ui/common";

export function pubStatus(c) {
  return c.bad ? "bad" : c.cond || c.old ? "cond" : c.good ? "good" : "none";
}
export function publicData() {
  const out = [],
    skipped = [];
  db.objects.forEach(o => {
    const rows = exportRows(o.id);
    if (!rows.length) return;
    if (!o.geo) {
      skipped.push(o.name);
      return;
    }
    const c = {};
    rows.forEach(({ v }) => {
      const k = kindOf(v.k);
      c[k] = (c[k] || 0) + 1;
    });
    const viol = rows
      .filter(({ v }) => ["bad", "bad2", "old", "relax"].includes(v.k))
      .map(({ r, v }) => ({
        name: v.ru.name,
        fact: r.value,
        unit: v.ru.unit,
        norm: normText(v.ru),
        clause: v.ru.clause,
        doc: v.ru.doc,
        result: RES[v.k][0],
        fix: r.fix || "",
      }));
    const ap = (db.appeals || []).filter(a => a.objId === o.id).sort((a, b) => b.sentTs - a.sentTs)[0];
    out.push({
      id: o.id,
      name: o.name,
      address: o.address || "",
      lat: +(+o.geo.lat).toFixed(6),
      lon: +(+o.geo.lon).toFixed(6),
      type: OTYPES[o.type || "other"].split(" (")[0],
      building: BST[o.bstatus] || "",
      round: rnd(o),
      date: new Date(Math.max(...rows.map(x => x.r.ts))).toISOString().slice(0, 10),
      counts: c,
      status: pubStatus(c),
      violations: viol,
      appeal: ap ? { sent: new Date(ap.sentTs).toISOString().slice(0, 10), status: ap.status } : null,
      appeals: (db.appeals || [])
        .filter(a => a.objId === o.id)
        .sort((a, b) => a.sentTs - b.sentTs)
        .map(a => ({
          sent: new Date(a.sentTs).toISOString().slice(0, 10),
          due: new Date(a.dueTs).toISOString().slice(0, 10),
          status: a.status,
          to: a.to || "",
          how: a.how || "",
          subject: a.subject || "",
          answer: a.answer || "",
          answerDate: a.answerTs ? new Date(a.answerTs).toISOString().slice(0, 10) : "",
        })),
    });
  });
  return { out, skipped };
}
export let pubLast = null;
export async function exportPublic() {
  const d = publicData();
  if (!d.out.length) {
    alert(
      "Нет объектов для карты: нужны замеры и отмеченное место объекта (кнопка «Я здесь» или «На карте»)."
    );
    return;
  }
  const msg =
    "На публичную карту уйдут только: название, адрес, координаты, результаты замеров, нарушения с нормами и пунктами, а также обращения: кому, когда, о чём просили, срок, ответ и итог (без номера обращения). Фото и ваши заметки не передаются.\n\nОбъектов: " +
    d.out.length +
    (d.skipped.length ? "\nБез места на карте (не войдут): " + d.skipped.join(", ") : "") +
    "\n\nСоздать файл?";
  if (!confirm(msg)) return;
  const name = "karta_dannye_" + new Date().toISOString().slice(0, 10) + ".json",
    text = JSON.stringify({ app: "gorynych-karta", v: 1, updated: new Date().toISOString(), objects: d.out });
  pubLast = { name, text };
  const p = byId("eprev");
  p.textContent = text;
  p.classList.remove("hidden");
  byId("ebtns").classList.remove("hidden");
  p.scrollIntoView({ block: "center" });
  toast("Готово: «Копировать» или «Файлом»");
}
