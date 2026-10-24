import { BST, RES, STATUS, normText, rnd } from "../core/rules";
import { db } from "../core/storage";
import { csvEsc, fmt } from "../core/util";
import { geoTxt, mapLink } from "../place";
import { recView } from "../screens/log";

export function exportRows(objId?: string | null, all?: boolean) {
  const o = objId ? db.objects.find(x => x.id === objId) : null;
  return db.records
    .filter(r => !objId || (r.objId === objId && (all || !o || (r.round || 1) === rnd(o))))
    .slice()
    .reverse()
    .map(r => {
      const v = recView(r);
      return { r, v };
    });
}
export function condState(v, r) {
  return v.baseK !== "relax"
    ? ""
    : r.cond === true
      ? "выполнено"
      : r.cond === false
        ? "не выполнено"
        : "не проверено";
}
export function buildCSV(objId) {
  const head = [
    "Дата",
    "Объект",
    "Адрес",
    "Статус здания",
    "Код правила",
    "Параметр",
    "Ед.",
    "Факт",
    "Норма",
    "Результат",
    "Пункт и документ",
    "Статус проверки нормы",
    "Условие допуска",
    "Условие проверено",
    "Комментарий",
    "Опыт эксперта",
    "Что реально сделать",
    "Место замера",
    "Координаты",
    "Карта",
    "Фото, шт.",
    "Обследование №",
  ];
  const lines = [head.join(";")];
  exportRows(objId, true).forEach(({ r, v }) => {
    const ru = v.ru,
      ob = v.ob,
      g = r.geo || (ob && ob.geo);
    lines.push(
      [
        new Date(r.ts).toLocaleDateString("ru-RU"),
        ob ? ob.name : "",
        ob ? ob.address : "",
        ob ? BST[ob.bstatus] || "" : "",
        ru.id || r.ruleId,
        ru.name,
        ru.unit,
        fmt(r.value),
        ru.min !== undefined ? normText(ru) : "",
        RES[v.k][0],
        (ru.clause || "") + ", " + (ru.doc || ""),
        STATUS[ru.status] || "",
        v.baseK === "relax" ? ru.cond || "" : "",
        condState(v, r),
        r.comment,
        r.exp || "",
        r.fix || "",
        r.place || "",
        g ? geoTxt(g) : "",
        g ? mapLink(g) : "",
        (r.photos || []).length,
        r.round || 1,
      ]
        .map(csvEsc)
        .join(";")
    );
  });
  return "\ufeff" + lines.join("\r\n");
}
export function buildText(objId, onlyBad) {
  const o = db.objects.find(x => x.id === objId);
  if (!o) return "";
  const rows = exportRows(objId).filter(({ v }) => !onlyBad || ["bad", "bad2", "old", "relax"].includes(v.k));
  let t = `Объект: ${o.name}\nАдрес: ${o.address || "—"}${o.geo ? " (" + mapLink(o.geo) + ")" : ""}\nЗдание: ${BST[o.bstatus] || "—"}\nДата: ${new Date().toLocaleDateString("ru-RU")}\n\n`;
  if (o.bstatus === "old")
    t +=
      "Примечание: здание введено до 01.07.2016 и не реконструировалось; приведённые отклонения — несоответствие современным требованиям, просим принять меры по приспособлению.\n\n";
  t += onlyBad ? "Выявленные несоответствия:\n" : "Результаты замеров:\n";
  rows.forEach(({ r, v }, i) => {
    const ru = v.ru;
    t +=
      `${i + 1}. ${ru.name}: факт ${fmt(r.value)} ${ru.unit}; требуется ${ru.min !== undefined ? normText(ru) : ""} (${ru.clause}, ${ru.doc}) — ${RES[v.k][0]}.` +
      (v.baseK === "relax"
        ? ` Условие допуска: ${ru.cond || "—"} Проверка условия: ${condState(v, r)}.`
        : "") +
      (r.place || r.geo
        ? ` Место: ${[r.place, r.geo ? mapLink(r.geo) : ""].filter(Boolean).join(", ")}.`
        : "") +
      (r.exp ? ` Опыт эксперта: ${r.exp}.` : "") +
      (r.fix ? ` Что можно сделать: ${r.fix}.` : "") +
      (r.comment ? " " + r.comment : "") +
      "\n";
  });
  if (!rows.length) t += "—\n";
  t += "\nЗначения норм должны быть сверены с действующей редакцией свода правил.\n";
  return t;
}
