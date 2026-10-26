// Паспорт доступности (и акт, и анкета) в виде файла Word (.docx).
// Содержание берётся из готовой HTML-версии (buildOfficialPassport): один источник текста, два формата.
import {
  buildDocx,
  type Block,
  type Cell,
  type Para,
  type Picture,
  type Run,
  type Table,
} from "../docx/writer";
import { buildOfficialPassport } from "./passport";
import { db } from "../core/storage";

const CONTENT_W = 11906 - 2 * 850; // ширина текста на листе A4 с полями 15 мм, twips
const PAGE_H = 16838 - 2 * 850 - 300; // высота текста за вычетом колонтитула
const CHAR_W = 108; // ширина средней буквы Arial 10 пт, twips
const LINE_H = 245; // высота строки, twips

/** Размер JPEG из заголовка файла (без загрузки картинки). */
export function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}

function dataUrlToBytes(d: string): Uint8Array {
  const bin = atob(d.slice(d.indexOf(",") + 1));
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

interface Ctx {
  bookmarks: { start: string; end: string }[];
  est: Record<string, number>; // оценка высоты (twips) по разделам: ключ «z1», «photos»
  curKey: string | null;
  pagesFor: (key: string) => number;
}

const textLines = (chars: number, widthTw: number, charW = CHAR_W) =>
  Math.max(1, Math.ceil((chars * charW) / Math.max(widthTw, 600)));

function addEst(ctx: Ctx, tw: number) {
  if (ctx.curKey) ctx.est[ctx.curKey] = (ctx.est[ctx.curKey] || 0) + tw;
}

function inlineRuns(
  node: Node,
  base: { b?: boolean; i?: boolean; sz?: number; color?: string },
  out: Run[],
  ctx: Ctx
) {
  node.childNodes.forEach(n => {
    if (n.nodeType === 3) {
      const t = (n.textContent || "").replace(/\s+/g, " ");
      if (t) out.push({ t, ...base });
      return;
    }
    if (n.nodeType !== 1) return;
    const e = n as HTMLElement;
    const tag = e.tagName.toLowerCase();
    if (tag === "br") out.push({ br: true });
    else if (tag === "b" || tag === "strong") inlineRuns(e, { ...base, b: true }, out, ctx);
    else if (tag === "i" || tag === "em") inlineRuns(e, { ...base, i: true }, out, ctx);
    else if (tag === "script" || tag === "style") return;
    else if (tag === "span" && e.classList.contains("fill")) {
      if (e.dataset.pages) {
        const key = e.dataset.pages,
          n = ctx.pagesFor(key);
        // число листов вписываем готовым числом: формулы с номерами страниц разные программы считают по-разному
        out.push({ t: String(n), ...base, u: true });
        return;
      }
      const v = (e.textContent || "").trim();
      if (v) out.push({ t: v, ...base, u: true });
      else {
        const w = parseInt(e.style.minWidth || "120", 10) || 120;
        out.push({ t: "_".repeat(Math.max(4, Math.round(w / 8))), ...base });
      }
    } else if (tag === "span" && e.classList.contains("sm"))
      inlineRuns(e, { ...base, sz: 8.5, color: "555555" }, out, ctx);
    else if (tag === "span" && e.classList.contains("res")) inlineRuns(e, { ...base, b: true }, out, ctx);
    else inlineRuns(e, base, out, ctx);
  });
}

const runsChars = (runs: Run[]) =>
  runs.reduce(
    (a, r) => a + (typeof r === "string" ? r.length : "t" in r ? r.t.length : "pages" in r ? 3 : 1),
    0
  );

function para(
  e: Element,
  ctx: Ctx,
  over: Partial<Para> = {},
  base: { b?: boolean; i?: boolean; sz?: number; color?: string } = {}
): Para {
  const runs: Run[] = [];
  inlineRuns(e, base, runs, ctx);
  const align = (e as HTMLElement).style?.textAlign as Para["align"];
  const p: Para = { runs, align: align || undefined, ...over };
  addEst(
    ctx,
    textLines(runsChars(runs), CONTENT_W - (over.indent || 0) * 20) * LINE_H + (over.after ?? 4) * 20
  );
  return p;
}

function tableOf(t: HTMLTableElement, ctx: Ctx): Table {
  const trs = [...t.querySelectorAll("tr")];
  const grid: (Cell | null)[][] = [];
  const occ: boolean[][] = [];
  let ncols = 0;
  trs.forEach((tr, ri) => {
    occ[ri] = occ[ri] || [];
    let ci = 0;
    grid[ri] = [];
    [...tr.children].forEach(td => {
      while (occ[ri][ci]) {
        grid[ri].push({ paras: [], vmerge: "continue" });
        ci++;
      }
      const cs = parseInt(td.getAttribute("colspan") || "1", 10),
        rs = parseInt(td.getAttribute("rowspan") || "1", 10);
      const isTh = td.tagName.toLowerCase() === "th";
      const paras: Para[] = [];
      const first: Run[] = [];
      const flush = () => {
        if (first.length) {
          paras.push({ runs: [...first], after: 0 });
          first.length = 0;
        }
      };
      td.childNodes.forEach(n => {
        if (n.nodeType === 1 && (n as HTMLElement).tagName.toLowerCase() === "div") {
          flush();
          const r: Run[] = [];
          inlineRuns(n, { sz: 8.5, color: "555555" }, r, ctx);
          paras.push({ runs: r, after: 0 });
        } else {
          const tmp = document.createElement("span");
          tmp.appendChild(n.cloneNode(true));
          inlineRuns(tmp, { b: isTh }, first, ctx);
        }
      });
      flush();
      grid[ri].push({
        paras,
        span: cs > 1 ? cs : undefined,
        shade: isTh ? "EEF1F6" : undefined,
        vmerge: rs > 1 ? "restart" : undefined,
      });
      for (let k = 0; k < cs; k++) {
        occ[ri][ci + k] = true;
        for (let d = 1; d < rs; d++) {
          occ[ri + d] = occ[ri + d] || [];
          occ[ri + d][ci + k] = true;
        }
      }
      for (let k = 1; k < cs; k++) ci++;
      ci++;
    });
    // хвост: ячейки, занятые объединением сверху, в конце строки
    while (occ[ri][ci]) {
      grid[ri].push({ paras: [], vmerge: "continue" });
      ci++;
    }
    ncols = Math.max(ncols, ci);
  });
  const hdrCells = grid[0] || [];
  const narrow = (td: Element | undefined) => !!td && td.classList.contains("c");
  const firstTr = trs[0];
  // ширины колонок: узкая колонка «№ п/п», остальные поровну или по весам для таблицы замеров
  const weights6 = [2.2, 0.9, 1.4, 1.7, 1.9, 1.5];
  const widths: number[] = [];
  const cellsFirst = firstTr ? [...firstTr.children] : [];
  let flexSum = 0;
  const flex: number[] = [];
  for (let c = 0; c < ncols; c++) {
    const w = ncols === 6 ? weights6[c] : 1;
    const isNarrow = narrow(cellsFirst[c]) && !cellsFirst[c]?.getAttribute("colspan");
    flex.push(isNarrow ? 0 : w);
    flexSum += isNarrow ? 0 : w;
  }
  const narrowW = 560;
  const narrowCount = flex.filter(x => x === 0).length;
  const rest = CONTENT_W - narrowW * narrowCount;
  for (let c = 0; c < ncols; c++)
    widths.push(flex[c] === 0 ? narrowW : Math.round((rest * flex[c]) / flexSum));
  const rows: Cell[][] = grid.map(r => r as Cell[]);
  // оценка высоты
  rows.forEach(r => {
    let col = 0,
      maxLines = 1;
    r.forEach(c => {
      const span = c.span || 1,
        w = widths.slice(col, col + span).reduce((a, b) => a + b, 0) - 160;
      col += span;
      const lines = c.paras.reduce(
        (a, p) =>
          a +
          textLines(runsChars(p.runs), w, p.runs.some(x => typeof x !== "string" && "sz" in x) ? 95 : CHAR_W),
        0
      );
      maxLines = Math.max(maxLines, lines);
    });
    addEst(ctx, maxLines * LINE_H + 120);
  });
  return {
    widths,
    rows,
    headerRows: hdrCells.some(c => c.shade) ? Math.min(2, rows.filter(r => r.some(c => c.shade)).length) : 0,
  };
}

function galleryBlocks(gal: Element, ctx: Ctx): Block[] {
  const figs = [...gal.querySelectorAll("figure")];
  const half = Math.floor(CONTENT_W / 2);
  const rows: Cell[][] = [];
  for (let i = 0; i < figs.length; i += 2) {
    const row: Cell[] = [];
    let h = 0;
    for (let k = 0; k < 2; k++) {
      const f = figs[i + k];
      if (!f) {
        row.push({ paras: [] });
        continue;
      }
      const src = f.querySelector("img")?.getAttribute("src") || "";
      const data = dataUrlToBytes(src);
      const sz = jpegSize(data) || { w: 4, h: 3 };
      const pic: Picture = { data, wPx: sz.w, hPx: sz.h, maxWidthCm: 8.2 };
      const cap = f.querySelector("figcaption");
      const runs: Run[] = [];
      if (cap) inlineRuns(cap, { sz: 8.5 }, runs, ctx);
      row.push({ pics: [pic], paras: [{ runs, after: 0 }] });
      h = Math.max(
        h,
        Math.round((8.2 * 567 * sz.h) / sz.w) + LINE_H * textLines(runsChars(runs), half - 160, 95) + 160
      );
    }
    rows.push(row);
    addEst(ctx, h);
  }
  return [{ table: { widths: [half, CONTENT_W - half], rows, borders: false } }];
}

/** Из готовой HTML-страницы паспорта собирает блоки документа Word. */
export function htmlToBlocks(
  doc: Document,
  pagesFor: (key: string) => number = () => 1
): { blocks: Block[]; est: Record<string, number> } {
  const ctx: Ctx = { bookmarks: [], est: {}, curKey: null, pagesFor };
  const blocks: Block[] = [];
  let pageBreak = false;
  let zoneN = 0;
  const push = (p: Para) => {
    if (pageBreak) {
      p.pageBreakBefore = true;
      pageBreak = false;
    }
    blocks.push({ para: p });
  };
  const handle = (e: Element) => {
    const tag = e.tagName.toLowerCase();
    const cls = e.classList;
    if (cls.contains("hint") || cls.contains("noprint") || tag === "script" || tag === "style") return;
    if (cls.contains("cover")) {
      pageBreak = false;
      const parts = [...e.children];
      parts.forEach((part, pi) => {
        [...part.children].forEach((c, ci) => {
          const big = c.tagName.toLowerCase() === "h1";
          const p = para(
            c,
            ctx,
            {
              align: "center",
              before: pi === 1 && ci === 0 ? 150 : pi === 2 && ci === 0 ? 150 : 0,
              after: big ? 14 : 8,
              style: undefined,
            },
            big
              ? { b: true, sz: 20 }
              : cls.contains("big") || c.classList.contains("big")
                ? { b: true, sz: 13 }
                : {}
          );
          push(p);
        });
      });
      pageBreak = true;
      return;
    }
    if (cls.contains("pb")) {
      pageBreak = true;
      [...e.children].forEach(handle);
      return;
    }
    if (tag === "div" && cls.contains("ut")) {
      push(para(e, ctx, { align: "right", after: 8 }));
      return;
    }
    if (tag === "div" && cls.contains("zsec")) {
      const k = e.getAttribute("data-z") || "";
      ctx.curKey = "z" + k;
      let first = true;
      if (zoneN++ > 0) pageBreak = true; // каждая зона приложения 1 начинается с нового листа — так число листов по зонам определено
      [...e.children].forEach(c => {
        const t = c.tagName.toLowerCase();
        if (t === "h3") {
          const p = para(c, ctx, { style: "h3", keepNext: true });
          if (first) p.bookmark = `s_z${k}`;
          first = false;
          push(p);
        } else if (t === "table") blocks.push({ table: tableOf(c as HTMLTableElement, ctx) });
      });
      push({ runs: [], after: 0, bookmark: `e_z${k}` });
      ctx.curKey = null;
      return;
    }
    if (tag === "div" && cls.contains("gal")) {
      blocks.push(...galleryBlocks(e, ctx));
      push({ runs: [], after: 0, bookmark: "e_photos" });
      ctx.curKey = null;
      return;
    }
    if (tag === "div") {
      [...e.children].forEach(handle);
      return;
    }
    if (tag === "h1") push(para(e, ctx, { align: "center", style: "h1" }));
    else if (tag === "h2") {
      const txt = e.textContent || "";
      const p = para(e, ctx, {
        style: "h2",
        keepNext: true,
        align: (e as HTMLElement).style.textAlign as Para["align"],
      });
      if (/^Приложение 2/.test(txt)) {
        p.bookmark = "s_photos";
        ctx.curKey = "photos";
      }
      push(p);
    } else if (tag === "h3") push(para(e, ctx, { style: "h3", keepNext: true }));
    else if (tag === "table")
      (blocks.push({ table: tableOf(e as HTMLTableElement, ctx) }), push({ runs: [], after: 2 }));
    else if (tag === "p") {
      const small = cls.contains("sm") || cls.contains("muted");
      push(
        para(
          e,
          ctx,
          { after: small ? 6 : 4, align: (e as HTMLElement).style.textAlign as Para["align"] },
          small ? { sz: 8.5, color: "555555" } : {}
        )
      );
    }
  };
  [...doc.body.children].forEach(handle);
  return { blocks, est: ctx.est };
}

/** Число страниц по оценке высоты раздела (Word пересчитает точнее по полю, если нажать F9). */
export const pagesByHeight = (tw: number | undefined) => (tw ? Math.max(1, Math.ceil(tw / PAGE_H)) : 0);

/** Паспорт (kind: passport | act | anketa) в формате .docx. */
export async function buildPassportDocx(
  objId: string,
  kind = "passport"
): Promise<{ data: Uint8Array; name: string } | null> {
  const html = await buildOfficialPassport(objId, kind);
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  // первый проход: считаем высоты разделов; второй — подставляем число страниц в поля
  const first = htmlToBlocks(doc);
  const second = htmlToBlocks(doc, key => pagesByHeight(first.est[key]));
  const o = db.objects.find(x => x.id === objId);
  const title = doc.title || "Паспорт доступности";
  const data = buildDocx(second.blocks, {
    title,
    author: db.settings.author || undefined,
    footerText: o ? o.name : undefined,
  });
  return { data, name: "" };
}
