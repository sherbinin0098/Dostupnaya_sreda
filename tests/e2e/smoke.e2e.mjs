import fs from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import os from "node:os";
import { assert, feed, newObject, openApp, tab } from "./helpers.mjs";

export const tests = {
  async "объект, замеры по маршруту, все вкладки и выгрузки без ошибок"() {
    const { page, errors, close } = await openApp({ voice: true });
    try {
      await newObject(page, { name: "Поликлиника", status: "recon" });
      // замеры по маршруту: приложение само подсказывает следующий пункт
      for (const v of ["950", "5", "1200", "2500", "900", "700"]) {
        await page.click("#rnext");
        await page.fill("#val", v);
        await page.click("#saveM");
        await page.waitForTimeout(60);
      }
      assert.equal(await page.evaluate(() => db.records.length), 6);

      for (const t of ["log", "appeals", "tools"]) {
        await tab(page, t);
        await page.waitForTimeout(100);
      }
      await tab(page, "more");
      for (const go of ["export", "stats", "norms"]) {
        await tab(page, "more");
        await page.click(`[data-go="${go}"]`);
        await page.waitForTimeout(100);
      }
      assert.ok((await page.locator("#nlist .item").count()) >= 100, "в справке норм мало пунктов");
      await page.fill("#nq", "сушилк");
      assert.match(await page.textContent("#nlist"), /не более 800 мм/);

      // выгрузки
      await tab(page, "more");
      await page.click('[data-go="export"]');
      await page.selectOption("#eo", await page.evaluate(() => db.currentObj));
      const files = {};
      for (const id of ["ecsv", "erep", "erepb", "epass2", "epass", "eact", "eank", "ebk"]) {
        const dl = page.waitForEvent("download", { timeout: 8000 });
        await page.click("#" + id);
        files[id] = (await dl).suggestedFilename();
      }
      assert.match(files.ecsv, /^zamery_\d{4}-\d{2}-\d{2}\.csv$/);
      assert.match(files.erep, /^otchet_poliklinika_/, "имя отчёта должно быть латиницей");
      for (const id of ["eletter", "etxt", "ebad"]) {
        await page.click("#" + id);
        assert.ok((await page.textContent("#eprev")).length > 50, id);
      }
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },

  async "письмо-обращение: нарушения с пунктами норм и оговорка про недоступные помещения"() {
    const { page, errors, close } = await openApp();
    try {
      await newObject(page, { name: "Клиника", status: "recon" });
      await page.evaluate(() => {
        const o = curObj();
        const add = (id, v, c = "") =>
          db.records.unshift({
            id: uid(),
            objId: o.id,
            round: 1,
            ruleId: id,
            value: v,
            result: check(rule(id), v, o),
            ts: Date.now(),
            comment: c,
            slots: {},
            photos: [],
          });
        add("R157", 4, "крыльцо 4 ступени");
        add("R158", 0);
        add("R34", 1700);
        save();
      });
      await tab(page, "more");
      await page.click('[data-go="export"]');
      await page.selectOption("#eo", await page.evaluate(() => db.currentObj));
      await page.click("#eletter");
      const letter = await page.textContent("#eprev");
      assert.match(letter, /п\. 6\.1\.2/);
      assert.match(letter, /п\. 6\.1\.1/);
      assert.match(letter, /препятствия, которые инвалид на коляске не может преодолеть/);
      assert.doesNotMatch(letter, /Ширина кабины/, "соответствующие замеры не должны попадать в письмо");
      // предупреждение на экране «Замер»
      await tab(page, "measure");
      assert.match(
        await page.locator('.card.warn[role="alert"]').first().innerText(),
        /Есть препятствия на пути/
      );
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },

  async "старые данные: версия 1 (метры) переводятся в миллиметры"() {
    const old = {
      objects: [{ id: "o1", name: "Старая школа", bstatus: "old" }],
      records: [
        { id: "r1", objId: "o1", ruleId: "R01", value: 0.95, result: "ok", ts: 1, comment: "" },
        { id: "r2", objId: "o1", ruleId: "R73", value: 40, result: "ok", ts: 2, comment: "" },
        { id: "r3", objId: "o1", ruleId: "R50", value: 5, result: "ok", ts: 3, comment: "" },
      ],
      overrides: {},
      currentObj: "o1",
      settings: {},
      appeals: [],
    };
    const { page, errors, close } = await openApp({ storage: old });
    try {
      const v = await page.evaluate(() =>
        db.records.map(r => `${r.ruleId}=${r.value}${r.comment ? "!" : ""}`).join(" ")
      );
      assert.equal(v, "R01=950 R73=40 R50=5!");
      assert.equal(await page.evaluate(() => db.ver), 3);
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },

  async "журнал показывает замеры порциями и считает итоги по всем"() {
    const { page, errors, close } = await openApp();
    try {
      await newObject(page);
      await page.evaluate(() => {
        const o = curObj();
        for (let i = 0; i < 120; i++)
          db.records.push({
            id: "r" + i,
            objId: o.id,
            round: 1,
            ruleId: "R01",
            value: 950,
            result: "ok",
            ts: 1792700000000 + i,
            comment: "",
            slots: {},
            photos: [],
          });
        save();
      });
      await tab(page, "log");
      assert.equal(await page.locator("#app .item").count(), 50);
      assert.match(
        await page.textContent("#app"),
        /соотв\.: 120/,
        "итоги считаются по всем замерам, а не по показанным"
      );
      await page.click("#logmore");
      assert.equal(await page.locator("#app .item").count(), 100);
      await page.click("#logmore");
      assert.equal(await page.locator("#app .item").count(), 120);
      assert.equal(await page.locator("#logmore").count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },

  async "паспорт: число листов приложений подставляется само"() {
    const { page, ctx, errors, close } = await openApp();
    try {
      await newObject(page, { name: "Школа", status: "recon" });
      // 40 замеров по разным разделам и 8 фотографий
      await page.evaluate(async () => {
        const o = curObj();
        const ids = RULES.filter(r => r.status === "ok" && r.min != null).slice(0, 60);
        const c = document.createElement("canvas");
        c.width = 800;
        c.height = 600;
        c.getContext("2d").fillRect(0, 0, 800, 600);
        const blob = await new Promise(r => c.toBlob(r, "image/jpeg"));
        for (const [i, r] of ids.entries()) {
          const photo = i < 8 ? uid() : null;
          if (photo) await putPhoto(photo, blob);
          db.records.push({
            id: "r" + i,
            objId: o.id,
            round: 1,
            ruleId: r.id,
            value: r.min,
            result: "ok",
            ts: 1792700000000 + i,
            comment: "",
            slots: photo ? { view: photo } : {},
            photos: photo ? [photo] : [],
          });
        }
        save();
      });
      await tab(page, "more");
      await page.click('[data-go="export"]');
      await page.selectOption("#eo", await page.evaluate(() => db.currentObj));
      await page.selectOption("#efmt", "html");
      const dl = page.waitForEvent("download", { timeout: 15000 });
      await page.click("#epass2");
      const path = `${os.tmpdir()}/passport-${Date.now()}.html`;
      await (await dl).saveAs(path);
      const doc = await ctx.newPage();
      await doc.goto("file://" + path);
      await doc.waitForFunction(
        () => [...document.querySelectorAll("[data-pages]")].every(e => e.textContent.trim() !== ""),
        null,
        { timeout: 10000 }
      );
      const pages = await doc.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll("[data-pages]")].map(e => [e.dataset.pages, e.textContent])
        )
      );
      const zones = Object.entries(pages).filter(([k]) => k.startsWith("z"));
      assert.ok(
        zones.some(([, v]) => Number(v) >= 1),
        "ни у одной зоны не посчитаны листы: " + JSON.stringify(pages)
      );
      assert.ok(
        Number(pages.photos) >= 2,
        "8 фото должны занять не меньше двух листов: " + JSON.stringify(pages)
      );
      assert.ok(
        Object.values(pages).every(v => /^\d+$/.test(v)),
        JSON.stringify(pages)
      );
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },

  async "паспорт, акт и анкета по умолчанию — настоящие файлы Word с фото и числом листов"() {
    const { page, errors, close } = await openApp();
    try {
      await newObject(page, { name: "Школа № 7", status: "recon" });
      await page.evaluate(async () => {
        const o = curObj();
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 480;
        c.getContext("2d").fillRect(0, 0, 640, 480);
        const blob = await new Promise(r => c.toBlob(r, "image/jpeg"));
        for (const [i, r] of RULES.filter(x => x.status === "ok" && x.min != null)
          .slice(0, 30)
          .entries()) {
          const photo = i < 4 ? uid() : null;
          if (photo) await putPhoto(photo, blob);
          db.records.push({
            id: "r" + i,
            objId: o.id,
            round: 1,
            ruleId: r.id,
            value: r.min - 1,
            result: "bad",
            ts: 1792700000000 + i,
            comment: "",
            fix: "Расширить проём",
            slots: photo ? { view: photo } : {},
            photos: photo ? [photo] : [],
          });
        }
        save();
      });
      await tab(page, "more");
      await page.click('[data-go="export"]');
      await page.selectOption("#eo", await page.evaluate(() => db.currentObj));
      assert.equal(await page.inputValue("#efmt"), "docx", "по умолчанию — Word");
      const text = {};
      for (const [id, want] of [
        ["epass2", /ПАСПОРТ ДОСТУПНОСТИ/],
        ["eact", /АКТ ОБСЛЕДОВАНИЯ/],
        ["eank", /АНКЕТА/],
      ]) {
        const dl = page.waitForEvent("download", { timeout: 20000 });
        await page.click("#" + id);
        const d = await dl;
        assert.match(d.suggestedFilename(), /\.docx$/);
        const file = `${os.tmpdir()}/doc-${id}-${Date.now()}.docx`;
        await d.saveAs(file);
        const zip = unzipSync(new Uint8Array(fs.readFileSync(file)));
        assert.ok(zip["word/document.xml"] && zip["[Content_Types].xml"], "в файле нет основных частей Word");
        const xml = strFromU8(zip["word/document.xml"]);
        assert.match(xml.replace(/<[^>]+>/g, ""), want);
        assert.match(xml, /Школа № 7/);
        text[id] = { xml, media: Object.keys(zip).filter(k => k.startsWith("word/media/")).length };
      }
      assert.equal(text.epass2.media, 4, "четыре фото из замеров должны оказаться в паспорте");
      assert.match(text.epass2.xml, /на <\/w:t>|на /, "в паспорте есть строки «на N л.»");
      const sheets = [...text.epass2.xml.replace(/<[^>]+>/g, "|").matchAll(/на \|*(\d+)\|* л\./g)].map(
        m => m[1]
      );
      assert.ok(sheets.length >= 7, "число листов не вписано: " + sheets.join());
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  },
};
