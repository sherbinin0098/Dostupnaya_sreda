import { beforeEach, describe, expect, it } from "vitest";
import { KEY, db, load, migrateUnits, replaceDb, save } from "../src/core/storage";

const data = (ver: number | undefined, recs: [string, number][]) => ({
  objects: [{ id: "o1", name: "Объект", bstatus: "old" }],
  records: recs.map(([ruleId, value], i) => ({
    id: "r" + i,
    objId: "o1",
    ruleId,
    value,
    result: "bad",
    ts: i,
    comment: "",
  })),
  overrides: {},
  currentObj: "o1",
  settings: {},
  appeals: [],
  ...(ver ? { ver } : {}),
});
const view = (d: any) => d.records.map((r: any) => `${r.ruleId}=${r.value}${r.comment ? "!" : ""}`).join(" ");

// До версии 2 размеры вводились в метрах, потом перешли на миллиметры. Старые данные должны переводиться, но не ломаться.
describe("перевод старых данных в миллиметры", () => {
  it("версия 1 (метры): умножаем на 1000, расстояния в метрах не трогаем", () => {
    const d = migrateUnits(
      data(undefined, [
        ["R01", 0.95],
        ["R73", 40],
      ])
    );
    expect(view(d)).toBe("R01=950 R73=40");
    expect(d.ver).toBe(3);
  });

  it("версия 1: число, явно введённое в мм (порог «5»), не превращается в 5000", () => {
    const d = migrateUnits(data(undefined, [["R50", 5]]));
    expect(view(d)).toBe("R50=5!"); // оставлено как введено, с пометкой «проверьте»
  });

  it("версия 2: ошибочно умноженное число возвращается с пометкой", () => {
    const d = migrateUnits(
      data(2, [
        ["R50", 5000],
        ["R01", 950],
      ])
    );
    expect(view(d)).toBe("R50=5! R01=950");
  });

  it("версия 3 не меняется", () => {
    const d = migrateUnits(data(3, [["R50", 5000]]));
    expect(view(d)).toBe("R50=5000");
  });

  it("сохранённые значения норм (overrides) в метрах тоже переводятся", () => {
    const d: any = data(undefined, []);
    d.overrides = { R01: { min: 0.9 } };
    expect(migrateUnits(d).overrides.R01.min).toBe(900);
  });
});

describe("хранилище", () => {
  beforeEach(() => {
    localStorage.clear();
    replaceDb({
      objects: [],
      records: [],
      overrides: {},
      currentObj: null,
      settings: { stamp: true },
      appeals: [],
      ver: 3,
    });
  });

  it("сохраняет и загружает", () => {
    db.objects.push({ id: "a", name: "Клиника", bstatus: "new" });
    save();
    expect(JSON.parse(localStorage.getItem(KEY)!).objects[0].name).toBe("Клиника");
    replaceDb({
      objects: [],
      records: [],
      overrides: {},
      currentObj: null,
      settings: { stamp: true },
      appeals: [],
      ver: 3,
    });
    load();
    expect(db.objects.map(o => o.name)).toEqual(["Клиника"]);
  });

  it("replaceDb заменяет содержимое, не меняя ссылку на объект", () => {
    const same = db;
    replaceDb({
      objects: [{ id: "z", name: "Z", bstatus: "old" }],
      records: [],
      overrides: {},
      currentObj: null,
      settings: { stamp: true },
      appeals: [],
      ver: 3,
    });
    expect(db).toBe(same);
    expect(db.objects[0].id).toBe("z");
  });

  it("старые объекты без статуса здания получают его", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ objects: [{ id: "x", name: "Старый", existing: true }], records: [], ver: 3 })
    );
    load();
    expect(db.objects[0].bstatus).toBe("unknown");
  });
});
