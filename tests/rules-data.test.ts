import { describe, expect, it } from "vitest";
import { RULES } from "../src/core/rules";
import { VK, VSAY, vNorm, vStem } from "../src/core/voice-parse";
import { ROUTES } from "../src/route";
import { PZONES } from "../src/reports/passport";

// Проверки справки норм: ловят опечатки в данных до того, как они попадут в приложение.
const UNITS = new Set(["мм", "м", "‰", "%", "лк", "с", "Нм", "шт"]);

describe("справка норм (data/rules.json)", () => {
  it("коды правил уникальны и по форме Rxx", () => {
    const ids = RULES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^R\d{2,3}$/);
  });

  it("у каждого правила заполнены раздел, название, пункт и документ", () => {
    for (const r of RULES) {
      expect(r.group, r.id).toBeTruthy();
      expect(r.name, r.id).toBeTruthy();
      expect(r.clause, r.id).toBeTruthy();
      expect(r.doc, r.id).toBeTruthy();
      expect(UNITS.has(r.unit), `${r.id}: единица «${r.unit}»`).toBe(true);
    }
  });

  it("границы согласованы: min ≤ max, смягчённая норма не строже основной", () => {
    for (const r of RULES) {
      if (r.min != null && r.max != null) expect(r.min, r.id).toBeLessThanOrEqual(r.max);
      if (r.amin != null && r.min != null)
        expect(r.amin, `${r.id}: amin строже min`).toBeLessThanOrEqual(r.min);
      if (r.amax != null && r.max != null)
        expect(r.amax, `${r.id}: amax строже max`).toBeGreaterThanOrEqual(r.max);
    }
  });

  it("смягчённая норма всегда имеет условие, условие — смягчённую норму", () => {
    for (const r of RULES) {
      const relaxed = r.amin != null || r.amax != null;
      expect(!!r.cond, r.id).toBe(relaxed);
    }
  });

  it("статус согласован со значениями: ok — есть норма, empty — нет", () => {
    for (const r of RULES) {
      const has = r.min != null || r.max != null;
      if (r.status === "ok") expect(has, r.id).toBe(true);
      if (r.status === "empty") expect(has, r.id).toBe(false);
    }
  });

  it("каждое правило попадает хотя бы в один маршрут обследования", () => {
    const inRoute = new Set<string>();
    for (const list of Object.values(ROUTES)) (list || []).forEach(g => inRoute.add(g));
    const groups = new Set(RULES.map(r => r.group));
    const lost = [...groups].filter(g => !inRoute.has(g));
    expect(lost, "разделы вне маршрутов «здание» и «улица»: " + lost.join(", ")).toEqual([]);
  });

  it("каждый раздел есть в зонах паспорта", () => {
    const inZone = new Set<string>(PZONES.flatMap(z => z[1]));
    const lost = [...new Set(RULES.map(r => r.group))].filter(g => !inZone.has(g));
    expect(lost, lost.join(", ")).toEqual([]);
  });
});

describe("кодовые фразы для голоса", () => {
  it("фраза есть у каждого правила, лишних нет", () => {
    const ids = new Set(RULES.map(r => r.id));
    expect(RULES.filter(r => !VK[r.id]).map(r => r.id)).toEqual([]);
    expect(Object.keys(VK).filter(k => !ids.has(k))).toEqual([]);
    expect(Object.keys(VSAY).filter(k => !ids.has(k))).toEqual([]);
  });

  it("фразы не совпадают и не вложены друг в друга (по основам слов)", () => {
    const stems = Object.entries(VK).map(
      ([id, p]) => [id, " " + vNorm(p).split(" ").map(vStem).join(" ") + " "] as const
    );
    const clashes: string[] = [];
    for (const [a, x] of stems)
      for (const [b, y] of stems) if (a < b && (x.includes(y) || y.includes(x))) clashes.push(`${a} ~ ${b}`);
    expect(clashes).toEqual([]);
  });
});
