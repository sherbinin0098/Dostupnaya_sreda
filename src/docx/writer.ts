// Небольшой писатель файлов Word (.docx): абзацы, таблицы, картинки, номера страниц, ссылки на номера страниц.
// Нужен, чтобы отчёты были настоящими документами, которые открываются в Word, LibreOffice и Google Документах и правятся там.
import { zipSync, strToU8 } from "fflate";

export interface RunStyle {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  sz?: number; // размер в пунктах
  color?: string; // 6 hex-цифр
}
export type Run =
  | string
  | ({ t: string } & RunStyle)
  /** «на N л.»: число страниц между двумя закладками (поле Word, пересчитывается по F9); n — значение, показываемое сразу */
  | { pages: { from: string; to: string; n: number } }
  | { br: true };

export interface Para {
  runs: Run[];
  align?: "left" | "center" | "right" | "both";
  after?: number; // отступ после, в пунктах
  before?: number;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  bookmark?: string; // закладка вокруг абзаца: на неё ссылаются поля «число страниц»
  style?: "h1" | "h2" | "h3";
  indent?: number; // отступ слева, пт
}
export interface Cell {
  pics?: Picture[]; // картинки в начале ячейки
  paras: Para[];
  span?: number;
  shade?: string;
  vmerge?: "restart" | "continue";
  valign?: "top" | "center";
}
export interface Table {
  widths: number[]; // в twips
  rows: Cell[][];
  borders?: boolean;
  headerRows?: number;
}
export interface Picture {
  data: Uint8Array;
  wPx: number;
  hPx: number;
  maxWidthCm: number;
}
export type Block = { para: Para } | { table: Table } | { pic: Picture; align?: "left" | "center" };

export interface DocOptions {
  title: string;
  author?: string;
  font?: string;
  size?: number; // размер по умолчанию, пт
  footerText?: string;
}

const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function rPr(s: RunStyle): string {
  const x = [
    s.b ? "<w:b/>" : "",
    s.i ? "<w:i/>" : "",
    s.u ? '<w:u w:val="single"/>' : "",
    s.color ? `<w:color w:val="${s.color}"/>` : "",
    s.sz ? `<w:sz w:val="${Math.round(s.sz * 2)}"/><w:szCs w:val="${Math.round(s.sz * 2)}"/>` : "",
  ].join("");
  return x ? `<w:rPr>${x}</w:rPr>` : "";
}
const textRun = (t: string, s: RunStyle = {}) =>
  t === "" ? "" : `<w:r>${rPr(s)}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const fld = (kind: "begin" | "separate" | "end") => `<w:r><w:fldChar w:fldCharType="${kind}"/></w:r>`;
const instr = (t: string) => `<w:r><w:instrText xml:space="preserve"> ${t} </w:instrText></w:r>`;

/** { = { PAGEREF to } - { PAGEREF from } + 1 } с запомненным значением n */
function pagesField(from: string, to: string, n: number, s: RunStyle): string {
  const num = (v: string) => `<w:r>${rPr(s)}<w:t>${v}</w:t></w:r>`;
  return (
    fld("begin") +
    instr("=") +
    fld("begin") +
    instr(`PAGEREF ${to} \\h`) +
    fld("separate") +
    num(String(n)) +
    fld("end") +
    instr("- ") +
    fld("begin") +
    instr(`PAGEREF ${from} \\h`) +
    fld("separate") +
    num("1") +
    fld("end") +
    instr("+ 1") +
    fld("separate") +
    num(String(n)) +
    fld("end")
  );
}

let bookmarkId = 0;
function paraXml(p: Para): string {
  const pp = [
    p.style
      ? `<w:pStyle w:val="${p.style === "h1" ? "Heading1" : p.style === "h2" ? "Heading2" : "Heading3"}"/>`
      : "",
    p.keepNext ? "<w:keepNext/>" : "",
    p.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
    p.before != null || p.after != null
      ? `<w:spacing${p.before != null ? ` w:before="${p.before * 20}"` : ""}${p.after != null ? ` w:after="${p.after * 20}"` : ""}/>`
      : "",
    p.indent ? `<w:ind w:left="${p.indent * 20}"/>` : "",
    p.align ? `<w:jc w:val="${p.align}"/>` : "",
  ].join("");
  const body = p.runs
    .map(r => {
      if (typeof r === "string") return textRun(r);
      if ("br" in r) return "<w:r><w:br/></w:r>";
      if ("pages" in r) return pagesField(r.pages.from, r.pages.to, r.pages.n, {});
      const { t, ...st } = r;
      return textRun(t, st);
    })
    .join("");
  const id = p.bookmark ? ++bookmarkId : 0;
  const bs = p.bookmark ? `<w:bookmarkStart w:id="${id}" w:name="${p.bookmark}"/>` : "";
  const be = p.bookmark ? `<w:bookmarkEnd w:id="${id}"/>` : "";
  return `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ""}${bs}${body}${be}</w:p>`;
}

function tableXml(t: Table, addPic: (p: Picture, align?: string) => string): string {
  const total = t.widths.reduce((a, b) => a + b, 0);
  const border = t.borders === false ? "nil" : "single";
  const b = (side: string) => `<w:${side} w:val="${border}" w:sz="4" w:space="0" w:color="444444"/>`;
  const grid = t.widths.map(w => `<w:gridCol w:w="${w}"/>`).join("");
  const rows = t.rows
    .map((row, ri) => {
      let col = 0;
      const cells = row
        .map(c => {
          const span = c.span || 1;
          const w = t.widths.slice(col, col + span).reduce((a, x) => a + x, 0);
          col += span;
          const tcPr = [
            `<w:tcW w:w="${w}" w:type="dxa"/>`,
            span > 1 ? `<w:gridSpan w:val="${span}"/>` : "",
            c.vmerge ? (c.vmerge === "restart" ? '<w:vMerge w:val="restart"/>' : "<w:vMerge/>") : "",
            c.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.shade}"/>` : "",
            c.valign ? `<w:vAlign w:val="${c.valign}"/>` : "",
          ].join("");
          const paras = c.paras.length || c.pics?.length ? c.paras : [{ runs: [] }];
          return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${(c.pics || []).map(p => addPic(p)).join("")}${paras.map(paraXml).join("")}</w:tc>`;
        })
        .join("");
      const hdr =
        t.headerRows && ri < t.headerRows
          ? "<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>"
          : "<w:trPr><w:cantSplit/></w:trPr>";
      return `<w:tr>${hdr}${cells}</w:tr>`;
    })
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${b("top")}${b("left")}${b("bottom")}${b("right")}${b("insideH")}${b("insideV")}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
}

const EMU_PER_CM = 360000;
function pictureXml(p: Picture, rid: string, id: number, align?: string): string {
  const wCm = Math.min(p.maxWidthCm, (p.wPx / 96) * 2.54);
  const cx = Math.round(wCm * EMU_PER_CM),
    cy = Math.round((cx * p.hPx) / p.wPx);
  return `<w:p>${align ? `<w:pPr><w:jc w:val="${align}"/></w:pPr>` : ""}<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Фото ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="photo${id}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

export function buildDocx(blocks: Block[], opt: DocOptions): Uint8Array {
  bookmarkId = 0;
  const font = opt.font || "Arial",
    size = (opt.size || 10) * 2;
  const media: Record<string, Uint8Array> = {};
  const rels: string[] = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
  ];
  let imgN = 0;
  const addPic = (p: Picture, align?: string) => {
    imgN++;
    const rid = "rIdImg" + imgN;
    media[`word/media/image${imgN}.jpeg`] = p.data;
    rels.push(
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${imgN}.jpeg"/>`
    );
    return pictureXml(p, rid, imgN, align);
  };
  const body = blocks
    .map(b => {
      if ("para" in b) return paraXml(b.para);
      if ("table" in b) return tableXml(b.table, addPic);
      if ("pic" in b) return addPic(b.pic, b.align);
      return "";
    })
    .join("");
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size + 10}"/><w:szCs w:val="${size + 10}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size + 4}"/><w:szCs w:val="${size + 4}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size + 2}"/><w:szCs w:val="${size + 2}"/></w:rPr></w:style>
</w:styles>`;
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="708"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${textRun((opt.footerText ? opt.footerText + " · " : "") + "стр. ", { sz: 8, color: "666666" })}<w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(opt.title)}</dc:title><dc:creator>${esc(opt.author || "Горыныч")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`;
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "docProps/core.xml": strToU8(core),
    "word/document.xml": strToU8(documentXml),
    "word/styles.xml": strToU8(styles),
    "word/settings.xml": strToU8(settings),
    "word/footer1.xml": strToU8(footer),
    "word/_rels/document.xml.rels": strToU8(docRels),
  };
  for (const [k, v] of Object.entries(media)) files[k] = [v, { level: 0 }]; // JPEG уже сжат
  return zipSync(files as any, { level: 6 });
}
