import { assert, feed, newObject, openApp } from "./helpers.mjs";

// блок «Парковка для МГН»: 7 пунктов подряд (длина, ширина, вдоль, расстояние, уклон, число мест, преграды)
const PARKING = [
  "шесть тысяч",
  "три тысячи шестьсот",
  "шесть тысяч восемьсот",
  "сорок",
  "двадцать",
  "один",
  "ноль",
];
const phrase = page =>
  page
    .locator("#vsx .vsphr")
    .innerText()
    .then(t => t.trim());
const status = page =>
  page
    .locator("#vsx .vsstat")
    .innerText()
    .then(t => t.trim());

export const tests = {
  async "диктовка без единого нажатия: фраза → число → запись → следующая фраза"() {
    const { page, errors, close } = await openApp({ voice: true });
    try {
      await newObject(page);
      await feed(page, ...PARKING);
      await page.click("#vsopen");
      assert.equal(await phrase(page), "«парковка длина»");
      await page.waitForTimeout(2600);
      const recs = await page.evaluate(() =>
        db.records
          .slice()
          .reverse()
          .map(r => `${r.ruleId}=${r.value}`)
          .join(" ")
      );
      assert.equal(recs, "R70=6000 R71=3600 R72=6800 R73=40 R74=20 R159=1 R160=0");
      const spoken = await page.evaluate(() => window.__spoken);
      assert.equal(spoken[0], "парковка длина");
      assert.match(spoken[1], /^6000\. парковка ширина/, "число повторяется вслух, затем следующая фраза");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },

  async "конец блока: остановка, слушает только «дальше»"() {
    const { page, close } = await openApp({ voice: true });
    try {
      await newObject(page);
      await feed(page, ...PARKING);
      await page.click("#vsopen");
      await page.waitForTimeout(2600);
      assert.equal(await status(page), "⏹ Блок закончен");
      assert.match(await page.locator("#vsx .vsmain").innerText(), /Блок «Парковка для МГН» закончен/);
      const before = await page.evaluate(() => db.records.length);
      await feed(page, "девяносто", "двести");
      await page.waitForTimeout(2800);
      assert.equal(
        await page.evaluate(() => db.records.length),
        before,
        "числа на остановке не записываются"
      );
      await feed(page, "дальше");
      await page.waitForTimeout(2600);
      assert.equal(await phrase(page), "«тротуар ширина»");
      assert.ok(
        (await page.evaluate(() => window.__spoken)).some(t => /^Поехали\. тротуар ширина/.test(t)),
        "после «дальше» приложение называет первую фразу блока"
      );
    } finally {
      await close();
    }
  },

  async "команды голосом и необычное число без подтверждений"() {
    const { page, close } = await openApp({ voice: true });
    try {
      await newObject(page);
      await feed(page, ...PARKING);
      await page.click("#vsopen");
      await page.waitForTimeout(2600);
      await feed(page, "дальше");
      await page.waitForTimeout(1500);
      // тротуар ширина: «пропустить», затем «нет такого», затем необычное число
      await feed(page, "пропустить", "нет такого", "пятьсот");
      await page.waitForTimeout(3500);
      assert.equal(await page.evaluate(() => JSON.stringify([...vs.later])), '["R10"]');
      assert.equal(await page.evaluate(() => Object.keys(curObj().skip || {}).join()), "1:R11");
      const odd = await page.evaluate(() =>
        db.records.filter(r => r.comment.startsWith("[")).map(r => r.ruleId)
      );
      assert.deepEqual(odd, ["R141"], "необычное число записано с пометкой, без вопроса");
      assert.equal(await page.locator("#vsyes, #vsno").count(), 0, "подтверждений быть не должно");
      await feed(page, "отмена");
      await page
        .waitForFunction(() => !db.records.some(r => r.ruleId === "R141"), null, { timeout: 9000 })
        .catch(() => {});
      assert.ok(
        !(await page.evaluate(() => db.records.some(r => r.ruleId === "R141"))),
        "«отмена» убирает последнюю запись"
      );
    } finally {
      await close();
    }
  },

  async "тишина не ставит на паузу: телефон продолжает слушать"() {
    const { page, close } = await openApp({ voice: true });
    try {
      await newObject(page);
      await page.click("#vsopen");
      await page.waitForTimeout(6500);
      assert.notEqual(await status(page), "⏸ Пауза");
      assert.ok((await page.evaluate(() => window.__listens)) >= 3);
    } finally {
      await close();
    }
  },

  async "озвучку можно выключить"() {
    const { page, close } = await openApp({ voice: true });
    try {
      await newObject(page);
      await page.click("#vsopen");
      await page.uncheck("#vsspk");
      await page.evaluate(() => {
        window.__spoken.length = 0;
      });
      await page.waitForTimeout(5000); // пока тихие повторы ждут число
      await feed(page, "шесть тысяч");
      await page.waitForTimeout(5000);
      assert.equal(await page.evaluate(() => window.__spoken.length), 0);
      assert.equal(await page.evaluate(() => db.records.length), 1, "запись идёт и без озвучки");
    } finally {
      await close();
    }
  },

  async "голос списком: несколько пунктов одной фразой, проверка перед сохранением"() {
    const { page, errors, close } = await openApp({ voice: true });
    try {
      await newObject(page);
      await page.click("#vmopen");
      await feed(
        page,
        "дверь ширина девяносто пять сантиметров порог высота пять миллиметров",
        "дверь ширина девять тысяч пятьсот"
      );
      await page.click("#vmmic");
      await page.waitForTimeout(300);
      assert.equal(await page.locator(".vmrow").count(), 2);
      await page.click("#vmmic");
      await page.waitForTimeout(300);
      const rows = await page.evaluate(() => vm.rows.map(r => `${r.id}:${r.value}:${r.on}`).join(" "));
      assert.match(rows, /R01:9500:false/, "необычное число не отмечено для записи");
      await page.click("#vmsave");
      assert.equal(await page.evaluate(() => db.records.map(r => r.ruleId).join()), "R50");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },
};
