// Сверка с прежней версией (legacy/index.html): одни и те же входные данные должны давать те же результаты.
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assert, DIST } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.resolve(here, "../../legacy/index.html");

async function collect(browser, htmlPath) {
  const html = fs.readFileSync(htmlPath);
  const ctx = await browser.newContext();
  await ctx.route("https://app.test/**", r =>
    r.fulfill({ status: 200, body: html, contentType: "text/html; charset=utf-8" })
  );
  const p = await ctx.newPage();
  await p.goto("https://app.test/");
  await p.waitForFunction(
    () =>
      typeof db !== "undefined" &&
      typeof check === "function" &&
      document.getElementById("app").children.length
  );
  const res = await p.evaluate(() => {
    const out = { checks: {}, parse: {}, park: {}, plaus: {}, sig: {} };
    const vals = [
      0, 0.5, 1, 2, 5, 10, 14, 15, 20, 40, 50, 60, 80, 90, 100, 150, 200, 300, 450, 700, 750, 800, 850, 900,
      950, 1000, 1100, 1200, 1300, 1400, 1500, 1800, 2000, 2200, 2500, 3600, 6000, 9500, 12000,
    ];
    for (const r of RULES) {
      out.sig[r.id] = JSON.stringify([r.min, r.max, r.amin, r.amax, r.unit]);
      for (const st of ["new", "recon", "old", "unknown"])
        for (const v of vals) out.checks[`${r.id}|${st}|${v}`] = check(rule(r.id), v, { bstatus: st });
      for (const v of vals) out.plaus[`${r.id}|${v}`] = plausible(r, v);
    }
    const say = [
      "девяносто пять сантиметров",
      "девяносто пять",
      "950",
      "ноль девяносто пять",
      "метр двадцать",
      "полтора метра",
      "1,8 метра",
      "восемьдесят",
      "пятьдесят метров",
      "сто пятьдесят",
      "двадцать миллиметров",
      "14",
      "три",
      "семь с половиной",
      "два метра двадцать",
      "девятьсот пять",
      "восемь пятьдесят",
      "двенадцать и пять десятых",
      "тысяча шестьсот",
      "пять тысяч",
      "сорок пять",
      "ноль",
      "нет",
      "привет",
    ];
    for (const id of ["R01", "R08", "R12", "R30", "R50", "R73", "R14", "R157"]) {
      const r = rule(id);
      if (!r) continue;
      for (const t of say) {
        try {
          out.parse[`${id}|${t}`] = JSON.stringify(parseSpoken(t, r.unit, r));
        } catch (e) {
          out.parse[`${id}|${t}`] = "ERR";
        }
      }
    }
    for (let n = 1; n <= 800; n++) out.park[n] = JSON.stringify(parkNeed(n));
    return out;
  });
  await ctx.close();
  return res;
}

export const tests = {
  async "результаты те же, что у прежней версии (замеры, опечатки, голос, парковка)"() {
    const browser = await chromium.launch();
    try {
      const A = await collect(browser, LEGACY);
      const B = await collect(browser, path.join(DIST, "index.html"));
      // сравниваем только правила, у которых норма в обеих версиях одинакова (нормы со временем дополняются)
      const same = new Set(Object.keys(A.sig).filter(id => A.sig[id] === B.sig[id]));
      assert.ok(same.size >= 90, "слишком мало общих правил: " + same.size);
      let compared = 0;
      for (const group of ["checks", "plaus"]) {
        for (const k of Object.keys(A[group])) {
          if (!same.has(k.split("|")[0])) continue;
          compared++;
          assert.equal(B[group][k], A[group][k], `${group}: ${k}`);
        }
      }
      for (const k of Object.keys(A.parse)) {
        compared++;
        assert.equal(B.parse[k], A.parse[k], `parse: ${k}`);
      }
      for (const k of Object.keys(A.park)) {
        compared++;
        assert.equal(B.park[k], A.park[k], `park: ${k}`);
      }
      assert.ok(compared > 15000, "сравнений мало: " + compared);
    } finally {
      await browser.close();
    }
  },
};
