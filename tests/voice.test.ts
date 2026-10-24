import { describe, expect, it } from "vitest";
import { parseMulti, parseSpoken } from "../src/core/voice-parse";
import { rule } from "../src/core/rules";
import { vsCmd } from "../src/screens/dictation";

const say = (text: string, id: string) => {
  const r = rule(id)!;
  return parseSpoken(text, r.unit, r)?.value ?? null;
};

describe("число голосом", () => {
  it("явная единица", () => {
    expect(say("девяносто пять сантиметров", "R01")).toBe(950);
    expect(say("1,8 метра", "R08")).toBe(1800);
    expect(say("двадцать миллиметров", "R50")).toBe(20);
    expect(say("метр двадцать", "R08")).toBe(1200);
    expect(say("два метра двадцать", "R03")).toBe(2200);
    expect(say("метр двадцать пять сантиметров", "R08")).toBe(1250);
    expect(say("полтора метра", "R08")).toBe(1500);
    expect(say("семь с половиной", "R12")).toBe(7.5);
  });

  it("единица не названа: выбирается ближайшая к норме", () => {
    expect(say("девяносто пять", "R01")).toBe(950); // сантиметры
    expect(say("950", "R01")).toBe(950);
    expect(say("ноль девяносто пять", "R01")).toBe(950); // метры
    expect(say("восемьдесят пять", "R30")).toBe(850);
  });

  it("для расстояний в метрах число без единицы — это метры", () => {
    expect(say("сто пятьдесят", "R73")).toBe(150);
    expect(say("пятьдесят метров", "R73")).toBe(50);
    expect(say("сорок пять", "R73")).toBe(45);
  });

  it("«нет» для счётчиков — ноль", () => {
    expect(say("нет", "R150")).toBe(0);
    expect(say("ни одной", "R157")).toBe(0);
    expect(say("три", "R157")).toBe(3);
  });

  it("не число — не разбирается", () => {
    expect(say("привет", "R01")).toBeNull();
    expect(say("", "R01")).toBeNull();
  });
});

describe("фраза + число подряд", () => {
  const ids = (t: string) => parseMulti(t).items.map(i => `${i.id}=${i.value}`);

  it("несколько пунктов в одной фразе", () => {
    expect(ids("дверь ширина девяносто пять сантиметров порог высота пять миллиметров")).toEqual([
      "R01=950",
      "R50=5",
    ]);
    expect(ids("пандус уклон восемьдесят пандус поручень верх девятьсот")).toEqual(["R12=80", "R14=900"]);
    expect(ids("тамбур ширина метр шестьдесят и тамбур глубина два метра сорок пять")).toEqual([
      "R05=1600",
      "R06=2450",
    ]);
  });

  it("цифрами и со склонениями", () => {
    expect(ids("двери ширина 95 порог высота 5")).toEqual(["R01=950", "R50=5"]);
  });

  it("длинная фраза важнее короткой (пандус съёмный ширина — не пандус ширина)", () => {
    expect(ids("пандус съёмный ширина восемьсот")).toEqual(["R123=800"]);
  });

  it("непонятое сообщается", () => {
    const r = parseMulti("дверь ширина");
    expect(r.items).toEqual([]);
    expect(r.bad.length).toBe(1);
    expect(parseMulti("привет как дела").bad).toEqual(["привет как дела"]);
  });
});

describe("голосовые команды диктовки", () => {
  it("распознаются точные слова", () => {
    expect(vsCmd("отмена")).toBe("undo");
    expect(vsCmd("Пропустить")).toBe("skip");
    expect(vsCmd("нет такого")).toBe("none");
    expect(vsCmd("повтори")).toBe("again");
    expect(vsCmd("пауза")).toBe("pause");
    expect(vsCmd("дальше")).toBe("go");
  });

  it("число командой не считается", () => {
    expect(vsCmd("девяносто пять")).toBeNull();
    expect(vsCmd("нет")).toBeNull();
  });
});
