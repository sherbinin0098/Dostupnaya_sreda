import { describe, expect, it } from "vitest";
import { check, effKind, normText, plausible, rule } from "../src/core/rules";
import type { Obj } from "../src/core/types";

const obj = (bstatus: Obj["bstatus"]): Obj => ({ id: "o", name: "Объект", bstatus });

describe("проверка замера по норме", () => {
  const door = rule("R01")!; // ширина входной двери: не менее 900, при реконструкции допустимо 800

  it("границы включаются", () => {
    expect(check(door, 900, obj("new"))).toBe("ok");
    expect(check(door, 899, obj("new"))).toBe("bad");
  });

  it("в старом здании (до 01.07.2016) — «ниже современной нормы», а не нарушение", () => {
    expect(check(door, 700, obj("old"))).toBe("old");
    expect(check(door, 950, obj("old"))).toBe("ok");
  });

  it("при реконструкции или неизвестном статусе — допустимо при условии", () => {
    expect(check(door, 800, obj("recon"))).toBe("relax");
    expect(check(door, 800, obj("unknown"))).toBe("relax");
    expect(check(door, 800, obj("new"))).toBe("bad");
    expect(check(door, 790, obj("recon"))).toBe("bad");
  });

  it("условие смягчённой нормы: выполнено / не выполнено", () => {
    expect(effKind("relax", true)).toBe("relaxok");
    expect(effKind("relax", false)).toBe("bad2");
    expect(effKind("relax", null)).toBe("relax");
    expect(effKind("ok", false)).toBe("ok");
  });

  it("норма только сверху (порог не выше 14 мм)", () => {
    const sill = rule("R50")!;
    expect(check(sill, 14, obj("new"))).toBe("ok");
    expect(check(sill, 15, obj("new"))).toBe("bad");
    expect(check(sill, 0, obj("new"))).toBe("ok");
  });

  it("счётчики доступа: ноль — путь свободный, больше нуля — нарушение", () => {
    const steps = rule("R157")!;
    expect(check(steps, 0, obj("new"))).toBe("ok");
    expect(check(steps, 4, obj("new"))).toBe("bad");
    const entrances = rule("R158")!; // доступных входов не меньше одного
    expect(check(entrances, 0, obj("new"))).toBe("bad");
    expect(check(entrances, 1, obj("new"))).toBe("ok");
  });

  it("сушилка и зеркало: нижний край не выше 800 мм (СП 136, п. 8.10)", () => {
    expect(check(rule("R38")!, 800, obj("new"))).toBe("ok");
    expect(check(rule("R38")!, 850, obj("new"))).toBe("bad");
    expect(check(rule("R140")!, 801, obj("new"))).toBe("bad");
  });

  it("текст нормы", () => {
    expect(normText(door)).toBe("не менее 900 мм");
    expect(normText(rule("R50")!)).toBe("не более 14 мм");
    expect(normText(rule("R13")!)).toBe("от 900 до 1000 мм");
  });
});

describe("защита от опечаток", () => {
  it("число в разумных пределах проходит, на порядок мимо — нет", () => {
    const door = rule("R01")!;
    expect(plausible(door, 950)).toBe(true);
    expect(plausible(door, 9500)).toBe(false);
    expect(plausible(door, 95)).toBe(false);
    expect(plausible(door, 0)).toBe(true);
    expect(plausible(door, -5)).toBe(false);
  });

  it("счётчики не проверяются на правдоподобие", () => {
    expect(plausible(rule("R157")!, 500)).toBe(true);
  });
});
