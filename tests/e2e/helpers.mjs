// Общие помощники для сквозных тестов: запускают собранное приложение (dist-test) в настоящем браузере.
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DIST = path.resolve(here, "../../dist-test");
export const BRIDGE = path.resolve(
  here,
  "../../node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js"
);
export { assert };

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

/** Поддельное распознавание речи и озвучка: тест кладёт фразы в window.__say, приложение «слышит» их по одной. */
const FAKE_VOICE = `
window.__say = []; window.__listens = 0; window.__spoken = [];
const FakeSR = class { start(){ window.__listens++; const t = window.__say.shift();
  setTimeout(() => { if (t === undefined) { if (this.onend) this.onend(); } else if (this.onresult) this.onresult({ results: [[{ transcript: t }]] }); }, 30); } };
for (const n of ["webkitSpeechRecognition", "SpeechRecognition"]) Object.defineProperty(window, n, { configurable: true, writable: true, value: FakeSR });
Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { cancel(){}, speak(u){ window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 30); } } });
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
`;

export async function openApp({
  voice = false,
  native = null,
  viewport = { width: 390, height: 844 },
  storage = null,
} = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, locale: "ru-RU" });
  if (voice) await ctx.addInitScript(FAKE_VOICE);
  if (storage)
    await ctx.addInitScript(s => {
      if (!localStorage.getItem("gorynych_dostup_v1")) localStorage.setItem("gorynych_dostup_v1", s);
    }, JSON.stringify(storage));
  if (native) {
    // «Android»: мост Capacitor с ответами, которые задаёт тест
    await ctx.addInitScript(`window.__calls = []; window.__native = ${JSON.stringify(native)}; window.androidBridge = { postMessage(m) { const c = JSON.parse(m); window.__calls.push(c.pluginId + "." + c.methodName);
      setTimeout(() => { const h = window.__native[c.pluginId + "." + c.methodName]; const r = typeof h === "undefined" ? { data: {} } : h;
        Capacitor.fromNative(r.error ? { callbackId: c.callbackId, pluginId: c.pluginId, methodName: c.methodName, success: false, error: { message: r.error } } : { callbackId: c.callbackId, pluginId: c.pluginId, methodName: c.methodName, success: true, data: r.data }); }, 20); } };
      window.WEBVIEW_SERVER_URL = "https://localhost";`);
    await ctx.addInitScript(fs.readFileSync(BRIDGE, "utf8"));
  }
  await ctx.route("https://app.test/**", route => {
    const u = new URL(route.request().url());
    const f = path.join(DIST, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "not found" });
    route.fulfill({
      status: 200,
      body: fs.readFileSync(f),
      contentType: TYPES[path.extname(f)] || "application/octet-stream",
    });
  });
  const page = await ctx.newPage();
  const errors = [],
    dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200));
  });
  page.on("dialog", d => {
    dialogs.push(d.message().slice(0, 120));
    d.accept();
  });
  await page.goto("https://app.test/");
  await page.waitForFunction(() => typeof db !== "undefined");
  await page.waitForTimeout(250);
  return { browser, ctx, page, errors, dialogs, close: () => browser.close() };
}

export async function newObject(
  page,
  { name = "Поликлиника", address = "ул. Тестовая, 1", type = "bld", status = "new" } = {}
) {
  await page.click("#newobj");
  await page.fill("#on", name);
  await page.fill("#oa", address);
  await page.selectOption("#ot", type);
  await page.selectOption("#oe", status);
  await page.click("#osave");
  await page.waitForTimeout(150);
}

export const feed = (page, ...phrases) => page.evaluate(p => window.__say.push(...p), phrases);
export const tab = (page, name) => page.click(`nav button[data-tab="${name}"]`);
