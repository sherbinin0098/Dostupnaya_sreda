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
