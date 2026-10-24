import phrasesData from "../data/phrases.json";
import { rule } from "./rules";

export const NUM = {
  ноль: 0,
  нуль: 0,
  один: 1,
  одна: 1,
  одно: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,
  сто: 100,
  двести: 200,
  триста: 300,
  четыреста: 400,
  пятьсот: 500,
  шестьсот: 600,
  семьсот: 700,
  восемьсот: 800,
  девятьсот: 900,
};
export function wordsToInt(tokens) {
  let total = 0,
    cur = 0,
    any = false;
  for (const t of tokens) {
    if (t in NUM) {
      cur += NUM[t];
      any = true;
    } else if (/^тысяч/.test(t)) {
      total += (cur || 1) * 1000;
      cur = 0;
      any = true;
    } else return null;
  }
  return any ? total + cur : null;
}
export function parseSpoken(text, unit, rule) {
  const s = String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(\d)\s*[.,]\s*(\d)/g, "$1.$2")
    .replace(/[^a-zа-я0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  if (
    rule &&
    rule.unit === "шт" &&
    /^(нет|нету|ни одной|ни одного|ни одна|без|отсутствуют|отсутствует|ноль)( |$)/.test(s)
  )
    return { value: 0, note: "", heard: text };
  let n = null,
    dec = false,
    rest = s;
  const tk = s.split(" "),
    toInt = w => (w.length === 1 && /^\d+$/.test(w[0]) ? +w[0] : wordsToInt(w));
  const mi = tk.findIndex(w => /^метр/.test(w)),
    hi = tk.indexOf("половиной");
  const right = mi >= 0 ? tk.slice(mi + 1).filter(w => !/^(сантиметр|см$)/.test(w)) : [];
  // «метр двадцать», «два метра двадцать (сантиметров)» — метры и сантиметры
  if (mi >= 0 && right.length && !tk.slice(0, mi).some(w => /\./.test(w))) {
    const L = mi ? toInt(tk.slice(0, mi)) : 1,
      C = toInt(right);
    if (L != null && C != null && C < 100) {
      n = L + C / 100;
      dec = true;
      rest = "метр";
    }
  } else if (mi === 0 && tk.length === 1) {
    n = 1;
    rest = "метр";
  } // «метр»
  // «семь с половиной (метров)»
  else if (hi > 1 && tk[hi - 1] === "с") {
    const L = toInt(tk.slice(0, hi - 1));
    if (L != null) {
      n = L + 0.5;
      dec = true;
      rest = tk.slice(hi + 1).join(" ");
    }
  }
  const dm = n == null && s.match(/(\d+(?:\.\d+)?)/);
  if (n != null) {
  } else if (dm) {
    n = parseFloat(dm[1]);
    dec = dm[1].includes(".");
    rest = s.slice(s.indexOf(dm[1]) + dm[1].length);
  } else {
    let t = s.split(" ");
    if (t.includes("полтора") || t.includes("полторы")) {
      n = 1.5;
      dec = true;
      rest = "";
    } else {
      let ui = t.findIndex(w => /^(мм|миллиметр|см|сантиметр|метр|м$)/.test(w));
      const num = ui < 0 ? t : t.slice(0, ui);
      rest = ui < 0 ? "" : t.slice(ui).join(" ");
      const sepI = num.findIndex(w => /^(целых|целая|целое|целый|точка|запятая)$/.test(w)),
        andI = num.indexOf("и");
      const unitDen = num.find(w => /^(десят|сот|тысячн)/.test(w));
      if (sepI >= 0 || (andI > 0 && unitDen)) {
        const i = sepI >= 0 ? sepI : andI,
          L = wordsToInt(num.slice(0, i)),
          rw = num.slice(i + 1).filter(w => !/^(десят|сот|тысячн)/.test(w));
        if (L != null) {
          let fr = null;
          if (unitDen) {
            const v = wordsToInt(rw);
            if (v != null) fr = v / Math.pow(10, /^десят/.test(unitDen) ? 1 : /^сот/.test(unitDen) ? 2 : 3);
          } else if (rw.every(w => w in NUM && NUM[w] < 10))
            fr = parseFloat("0." + rw.map(w => NUM[w]).join(""));
          else {
            const v = wordsToInt(rw);
            if (v != null) fr = parseFloat("0." + v);
          }
          if (fr != null) {
            n = L + fr;
            dec = true;
          }
        }
      } else if (num.length > 1 && (num[0] === "ноль" || num[0] === "нуль")) {
        const rw = num.slice(1);
        let ds = rw.every(w => w in NUM && NUM[w] < 10)
          ? rw.map(w => NUM[w]).join("")
          : String(wordsToInt(rw));
        if (ds && ds !== "null") {
          n = parseFloat("0." + ds);
          dec = true;
        }
      } else if (
        num.length >= 2 &&
        NUM[num[0]] >= 1 &&
        NUM[num[0]] <= 9 &&
        !num.some(w => /^тысяч/.test(w)) &&
        !/^сто|^двест|^трист|^четырест|^пятьсот|^шестьсот|^семьсот|^восемьсот|^девятьсот/.test(num[1])
      ) {
        const rw = num.slice(1),
          ds = rw.every(w => w in NUM && NUM[w] < 10)
            ? rw.map(w => NUM[w]).join("")
            : wordsToInt(rw) != null && wordsToInt(rw) < 100
              ? String(wordsToInt(rw))
              : null;
        if (ds) {
          n = parseFloat(NUM[num[0]] + "." + ds);
          dec = true;
        } else n = wordsToInt(num);
      } else {
        n = wordsToInt(num);
      }
    }
  }
  if (n == null || !isFinite(n)) return null;
  const um = (rest + " ").match(/^\s*(мм|миллиметр\S*|см|сантиметр\S*|метр\S*|м)\s/);
  let u = um ? (/^(мм|миллим)/.test(um[1]) ? "mm" : /^(см|сантим)/.test(um[1]) ? "cm" : "m") : null,
    v = n,
    note = "";
  if (unit === "м") {
    if (u === "mm") v = n / 1000;
    else if (u === "cm") v = n / 100;
  } // расстояния: число без единицы — это метры
  else if (unit === "мм") {
    if (u === "m") v = n * 1000;
    else if (u === "cm") v = n * 10;
    else if (u === "mm") v = n;
    else {
      // единица не названа: выбираем толкование, ближайшее к норме параметра (мм, см или метры)
      const lo = rule && rule.min,
        hi = rule && rule.max,
        ref = lo != null && hi != null ? (lo + hi) / 2 : lo != null ? lo : hi;
      const cands = [
        [n, ""],
        [n * 10, "сантиметры"],
      ];
      if (dec || n < 10) cands.push([n * 1000, "метры"]);
      if (ref > 0 && n > 0) {
        cands.sort((a, b) => Math.abs(Math.log(a[0] / ref)) - Math.abs(Math.log(b[0] / ref)));
        v = cands[0][0];
        note = cands[0][1];
      } else if (dec || n < 10) {
        v = n * 1000;
        note = "метры";
      }
    }
  }
  v = Math.round(v * 10000) / 10000;
  return { value: v, note, heard: text };
}
export const VK: Record<string, string> = phrasesData.phrases;
export const VSAY: Record<string, string> = phrasesData.say;
export const VFILL = new Set([
  "и",
  "а",
  "потом",
  "затем",
  "дальше",
  "так",
  "тут",
  "равно",
  "равна",
  "равен",
  "будет",
  "составляет",
  "около",
  "примерно",
  "где",
  "то",
  "еще",
  "ну",
]);
export const vNorm = s =>
  String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(\d)\s*[.,]\s*(\d)/g, "$1.$2")
    .replace(/[^a-zа-я0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export const vStem = w => w.slice(0, 4);
export let VK_IDX = null;
export function vkIndex() {
  if (!VK_IDX)
    VK_IDX = Object.keys(VK)
      .map(id => {
        const w = vNorm(VK[id]).split(" ");
        return { id, stems: w.map(vStem) };
      })
      .sort((a, b) => b.stems.length - a.stems.length);
  return VK_IDX;
}
export function parseMulti(text) {
  const tk = vNorm(text).split(" ").filter(Boolean),
    idx = vkIndex(),
    hits = [],
    loose = [];
  for (let i = 0; i < tk.length;) {
    let m = null;
    for (const c of idx) {
      if (i + c.stems.length > tk.length) continue;
      let ok = true;
      for (let k = 0; k < c.stems.length; k++)
        if (vStem(tk[i + k]) !== c.stems[k]) {
          ok = false;
          break;
        }
      if (ok) {
        m = c;
        break;
      }
    }
    if (m) {
      hits.push({ id: m.id, at: i, end: i + m.stems.length });
      i += m.stems.length;
    } else {
      if (!hits.length && !VFILL.has(tk[i])) loose.push(tk[i]);
      i++;
    }
  }
  const items = [],
    bad = [];
  hits.forEach((h, n) => {
    const next = hits[n + 1] ? hits[n + 1].at : tk.length,
      seg = tk
        .slice(h.end, next)
        .filter(w => !VFILL.has(w))
        .join(" "),
      r = rule(h.id);
    const p = seg ? parseSpoken(seg, r.unit, r) : null;
    if (p) items.push({ id: h.id, value: p.value, note: p.note, heard: VK[h.id] + " " + seg });
    else bad.push(VK[h.id] + (seg ? " " + seg : " — число не услышано"));
  });
  if (loose.length) bad.unshift(loose.join(" "));
  return { items, bad };
}
