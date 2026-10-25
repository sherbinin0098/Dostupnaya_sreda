import { assert, openApp } from "./helpers.mjs";

// Организация в OpenStreetMap записана с «ближайшей улицей» (Сакко и Ванцетти), а стоит в доме на Кирова, 27 с1.
// После выбора из подсказки адрес должен стать адресом здания, а не улицы, указанной у организации.
const SEARCH = {
  features: [
    {
      geometry: { coordinates: [82.94474, 55.01859] },
      properties: {
        name: "Дента",
        street: "улица Сакко и Ванцетти",
        city: "Новосибирск",
        osm_key: "amenity",
        osm_value: "dentist",
      },
    },
  ],
};
const BUILDING = { address: { road: "улица Кирова", house_number: "27 с1", city: "Новосибирск" } };

async function withMap(fn, { reverse = BUILDING } = {}) {
  const app = await openApp();
  await app.ctx.route("https://photon.komoot.io/**", r =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SEARCH) })
  );
  await app.ctx.route("https://nominatim.openstreetmap.org/**", r =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reverse) })
  );
  try {
    await fn(app.page);
  } finally {
    await app.close();
  }
}

export const tests = {
  async "организация без номера дома получает адрес здания, в котором стоит"() {
    await withMap(async page => {
      await page.click("#newobj");
      await page.fill("#on", "Дента");
      await page.waitForSelector('.aci[data-i="n0"]', { timeout: 8000 });
      // в самой подсказке сразу виден адрес здания, а не «ближайшая улица» организации
      await page.waitForFunction(
        () => document.querySelector('.aci[data-i="n0"]')?.textContent.includes("Кирова"),
        null,
        { timeout: 6000 }
      );
      assert.doesNotMatch(await page.locator('.aci[data-i="n0"]').innerText(), /Сакко/);
      await page.click('.aci[data-i="n0"]');
      await page.waitForFunction(() => document.getElementById("oa").value.includes("Кирова"), null, {
        timeout: 5000,
      });
      assert.equal(await page.inputValue("#oa"), "улица Кирова, 27 с1");
      assert.equal(await page.inputValue("#on"), "Дента");
    });
  },

  async "если у здания нет номера дома, остаётся то, что было у организации"() {
    await withMap(
      async page => {
        await page.click("#newobj");
        await page.fill("#on", "Дента");
        await page.waitForSelector('.aci[data-i="n0"]', { timeout: 8000 });
        await page.click('.aci[data-i="n0"]');
        await page.waitForTimeout(800);
        assert.equal(await page.inputValue("#oa"), "улица Сакко и Ванцетти");
      },
      { reverse: { address: { road: "улица Сакко и Ванцетти" } } }
    );
  },
};
