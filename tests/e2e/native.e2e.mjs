import { assert, newObject, openApp } from "./helpers.mjs";

// Голос на «Android»: сначала тихое распознавание (плагин Dictation.listenQuiet), при отказе — системное окно.
const heard = { data: { matches: ["девяносто пять сантиметров"] } };

async function press(page) {
  await page.click("#rnext");
  await page.waitForSelector("#mic");
  await page.click("#mic");
  await page.waitForTimeout(500);
  return {
    text: await page.textContent("#heard"),
    calls: (await page.evaluate(() => window.__calls)).filter(c => c.startsWith("Dictation")).join(),
  };
}

export const tests = {
  async "тихое распознавание работает"() {
    const { page, close } = await openApp({ native: { "Dictation.listenQuiet": heard } });
    try {
      await newObject(page);
      const r = await press(page);
      assert.match(r.text, /950 мм/);
      assert.equal(r.calls, "Dictation.listenQuiet");
    } finally {
      await close();
    }
  },
  async "нет разрешения на микрофон — открывается системное окно"() {
    const { page, close } = await openApp({
      native: { "Dictation.listenQuiet": { error: "no_permission" }, "Dictation.listen": heard },
    });
    try {
      await newObject(page);
      const r = await press(page);
      assert.match(r.text, /950 мм/);
      assert.equal(r.calls, "Dictation.listenQuiet,Dictation.listen");
    } finally {
      await close();
    }
  },
  async "занято или тишина — просит повторить"() {
    const { page, close } = await openApp({ native: { "Dictation.listenQuiet": { error: "busy" } } });
    try {
      await newObject(page);
      assert.match((await press(page)).text, /Ничего не услышал/);
    } finally {
      await close();
    }
  },
  async "ошибка сети — сообщает, что не записалось"() {
    const { page, close } = await openApp({ native: { "Dictation.listenQuiet": { error: "error_2" } } });
    try {
      await newObject(page);
      assert.match((await press(page)).text, /Не получилось записать голос/);
    } finally {
      await close();
    }
  },
  async "напоминания о сроках ответа планируются и отменяются"() {
    const { page, errors, close } = await openApp({
      native: { "LocalNotifications.requestPermissions": { data: { display: "granted" } } },
    });
    try {
      await newObject(page, { name: "Тест" });
      await page.click('nav button[data-tab="appeals"]');
      await page.click("#anew");
      await page.fill("#ato", "Департамент");
      await page.fill("#adate", new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10));
      await page.click("#asv");
      await page.waitForTimeout(2600);
      const calls = await page.evaluate(() => window.__calls.filter(c => c.startsWith("LocalNotifications")));
      assert.ok(calls.includes("LocalNotifications.schedule"), "напоминания не запланированы: " + calls);
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },
};

// Уклономер через Kotlin-плагин Tilt: сила тяжести (x, y, z) приходит из датчика, страница считает уклон и показывает направление.
const GRAV = {
  "Tilt.start": { data: { source: "gravity" } },
  "Tilt.read": { data: { n: 5, x: 0.2, y: 0.8, z: 9.78 } },
}; // ≈ 82‰ вдоль и 20‰ поперёк

const tests2 = {
  async "уклономер берёт данные у плагина Tilt"() {
    const { page, errors, close } = await openApp({ native: GRAV });
    try {
      await page.click('nav button[data-tab="tools"]');
      await page.waitForFunction(() => document.querySelector("#tiltval b"), null, { timeout: 5000 });
      await page.waitForTimeout(800);
      const text = await page.locator("#tiltval").innerText();
      assert.match(text, /8[0-4]‰/, "продольный уклон ≈ 82‰: " + text);
      assert.match(text, /подъём/);
      const calls = await page.evaluate(() => window.__calls.filter(c => c.startsWith("Tilt")));
      assert.ok(calls.includes("Tilt.start") && calls.includes("Tilt.read"), calls.join());
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },
  async "нет датчика в плагине — уклономер продолжает работать через браузер"() {
    const { page, close } = await openApp({ native: { "Tilt.start": { error: "unavailable" } } });
    try {
      await page.click('nav button[data-tab="tools"]');
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => tilt.native), false);
      assert.deepEqual(await page.evaluate(() => window.__calls.filter(c => c.startsWith("Tilt"))), [
        "Tilt.start",
      ]);
    } finally {
      await close();
    }
  },
};

Object.assign(tests, tests2);
