import type { DB } from "./types";
import { plausible } from "./rules";
import { RULES } from "./rules";
import { syncNotifs } from "../notifications";

export const KEY = "gorynych_dostup_v1";
export const LEGACY_M = [
  "R01",
  "R02",
  "R03",
  "R05",
  "R06",
  "R07",
  "R08",
  "R09",
  "R10",
  "R13",
  "R14",
  "R15",
  "R16",
  "R17",
  "R20",
  "R30",
  "R31",
  "R34",
  "R35",
  "R36",
  "R38",
  "R62",
  "R63",
  "R50",
  "R51",
  "R52",
  "R53",
  "R55",
  "R56",
  "R70",
  "R71",
  "R72",
];
export const db: DB = {
  objects: [],
  records: [],
  overrides: {},
  currentObj: null,
  settings: { stamp: true },
  appeals: [],
  ver: 3,
};
export function migrateUnits(d) {
  if (!d || d.ver >= 3) return d;
  const set = new Set(LEGACY_M),
    base = id => RULES.find(x => x.id === id);
  const mark = r => {
    r.comment =
      (r.comment ? r.comment + " " : "") + "[Проверьте значение: введено, когда поле было в метрах]";
  };
  if (!(d.ver >= 2)) {
    (d.records || []).forEach(r => {
      if (!set.has(r.ruleId) || typeof r.value !== "number") return;
      const ru = base(r.ruleId),
        mm = Math.round(r.value * 1000);
      if (ru && !plausible(ru, mm) && plausible(ru, r.value)) mark(r);
      else r.value = mm;
    }); // число явно введено в мм (например, порог «5») — не умножаем
    Object.keys(d.overrides || {}).forEach(id => {
      if (!set.has(id)) return;
      const o = d.overrides[id];
      ["min", "max", "amin", "amax"].forEach(k => {
        if (typeof o[k] === "number" && o[k] < 10) o[k] = Math.round(o[k] * 1000);
      });
    });
  } else {
    // версия 2 умножала на 1000 и такие числа: порог 5 → 5000 мм. Возвращаем введённое число и просим проверить
    (d.records || []).forEach(r => {
      if (!set.has(r.ruleId) || typeof r.value !== "number") return;
      const ru = base(r.ruleId),
        v = r.value / 1000;
      if (ru && Number.isInteger(v) && !plausible(ru, r.value) && plausible(ru, v)) {
        r.value = v;
        mark(r);
      }
    });
  }
  d.ver = 3;
  return d;
}
export function replaceDb(nd) {
  Object.keys(db).forEach(k => {
    delete db[k];
  });
  Object.assign(db, nd);
}
export function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const raw = JSON.parse(s);
      const was = raw.ver;
      Object.assign(db, migrateUnits(raw));
      if (was !== db.ver) save();
    }
  } catch (e) {}
  db.objects.forEach(o => {
    if (o.bstatus === undefined) {
      o.bstatus = o.existing ? "unknown" : "new";
    }
  });
  db.settings = Object.assign({ stamp: true }, db.settings || {});
  db.appeals = db.appeals || [];
}
let saveTimer: ReturnType<typeof setTimeout>; // отложенное обновление напоминаний после сохранения
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    alert("Не удалось сохранить: память браузера недоступна.");
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (typeof syncNotifs === "function") syncNotifs();
  }, 1500);
}
export function curObj() {
  return db.objects.find(o => o.id === db.currentObj) || null;
}
export function groups() {
  return [...new Set(RULES.map(r => r.group))];
}
