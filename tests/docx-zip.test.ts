// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildDocx } from "../src/docx/writer";
import { JSDOM } from "jsdom";

const parse = (xml: string) => new JSDOM(xml, { contentType: "application/xml" }).window.document;
const noError = (doc: Document) => expect(doc.getElementsByTagName("parsererror").length).toBe(0);

describe("файл Word (.docx)", () => {
  const blocks = [
    { para: { runs: [{ t: "Заголовок", b: true }], style: "h1" as const, align: "center" as const } },
    {
      para: {
        runs: ["Обычный текст & «кавычки» <тег>", { br: true as const }, { t: "после переноса", u: true }],
      },
    },
    {
      table: {
        widths: [3000, 7000],
        rows: [
          [
            { paras: [{ runs: ["№"] }], shade: "EEEEEE" },
            { paras: [{ runs: ["Название"] }], shade: "EEEEEE" },
          ],
          [{ paras: [{ runs: ["1"] }] }, { paras: [{ runs: ["Первая"] }, { runs: ["вторая строка"] }] }],
        ],
        headerRows: 1,
      },
    },
  ];
  const zip = unzipSync(buildDocx(blocks, { title: "Проверка", author: "Тест", footerText: "Объект" }));

  it("содержит все обязательные части пакета", () => {
    for (const f of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/settings.xml",
      "word/footer1.xml",
      "word/_rels/document.xml.rels",
      "docProps/core.xml",
    ])
      expect(Object.keys(zip), f).toContain(f);
  });

  it("все части — корректный XML", () => {
    for (const [name, data] of Object.entries(zip))
      if (name.endsWith(".xml") || name.endsWith(".rels")) noError(parse(strFromU8(data)));
  });

  it("спецсимволы текста экранируются, таблица и заголовок на месте", () => {
    const xml = strFromU8(zip["word/document.xml"]);
    expect(xml).toContain("&amp; «кавычки» &lt;тег&gt;");
    expect(xml).toContain('w:pStyle w:val="Heading1"');
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("<w:tblHeader/>");
    expect(xml).toContain('<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>');
  });

  it("название и автор попадают в свойства", () => {
    const core = strFromU8(zip["docProps/core.xml"]);
    expect(core).toContain("<dc:title>Проверка</dc:title>");
    expect(core).toContain("<dc:creator>Тест</dc:creator>");
  });
});
