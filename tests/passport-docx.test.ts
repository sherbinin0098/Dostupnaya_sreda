import { describe, expect, it } from "vitest";
import { htmlToBlocks, jpegSize, pagesByHeight } from "../src/reports/passport-docx";

describe("паспорт: из страницы в документ", () => {
  const html = `<!doctype html><body>
    <div class="hint">не попадает в документ</div>
    <h2>3. Состояние</h2>
    <p>Поле: <span class="fill" style="min-width:120px"></span> и заполненное <span class="fill">значение</span></p>
    <p>Приложение на <span class="fill" data-pages="z1"></span> л.</p>
    <table class="f"><tr><th class="c" rowspan="2">№</th><th colspan="2">Приложение</th></tr><tr><th>План</th><th>Фото</th></tr><tr><td class="c">1</td><td>а</td><td>б</td></tr></table>
    <div class="pb"><h2>Приложение 1</h2>
      <div class="zsec" data-z="1"><h3>1. Зона</h3><table class="f"><tr><th>Параметр</th><th>Факт</th></tr><tr><td>Ширина</td><td>950 мм</td></tr></table></div>
    </div></body>`;
  const doc = new DOMParser().parseFromString(html, "text/html");

  it("страница превращается в блоки, подсказка отбрасывается", () => {
    const { blocks } = htmlToBlocks(doc);
    const text = JSON.stringify(blocks);
    expect(text).not.toContain("не попадает в документ");
    expect(text).toContain("значение");
    expect(text).toContain("____"); // пустое поле — линия для заполнения
    expect(blocks.filter(b => "table" in b).length).toBe(2);
  });

  it("объединённые ячейки таблицы разобраны (rowspan → продолжение, colspan → ширина)", () => {
    const { blocks } = htmlToBlocks(doc);
    const t = (blocks.find(b => "table" in b) as any).table;
    expect(t.rows[0][0].vmerge).toBe("restart");
    expect(t.rows[1][0].vmerge).toBe("continue");
    expect(t.rows[0][1].span).toBe(2);
    expect(t.widths).toHaveLength(3);
    expect(t.widths.reduce((a: number, b: number) => a + b, 0)).toBe(11906 - 1700);
  });

  it("число листов раздела подставляется из оценки", () => {
    const first = htmlToBlocks(doc);
    expect(first.est.z1).toBeGreaterThan(0);
    const second = htmlToBlocks(doc, key => pagesByHeight(first.est[key]));
    expect(JSON.stringify(second.blocks)).toMatch(/"t":"1","u":true/);
  });

  it("оценка листов: пустой раздел — 0, небольшой — 1, большой — несколько", () => {
    expect(pagesByHeight(undefined)).toBe(0);
    expect(pagesByHeight(500)).toBe(1);
    expect(pagesByHeight(40000)).toBeGreaterThan(2);
  });
});

describe("размер JPEG", () => {
  it("читается из заголовка", () => {
    // минимальный заголовок: SOI, SOF0 с высотой 60 и шириной 80
    const b = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 60, 0, 80, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    ]);
    expect(jpegSize(b)).toEqual({ w: 80, h: 60 });
  });
  it("не JPEG — null", () => {
    expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
