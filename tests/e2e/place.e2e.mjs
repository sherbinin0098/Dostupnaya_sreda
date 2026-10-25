import { assert, openApp } from "./helpers.mjs";

// «Я здесь» не должен затирать адрес, введённый вручную; рядом показываются дома, из которых можно выбрать свой.
const PHOTON = {
  features: [
    {
      geometry: { coordinates: [82.9454, 55.0189] },
      properties: { street: "улица Сакко и Ванцетти", housenumber: "74" },
    },
    {
      geometry: { coordinates: [82.94476, 55.01861] },
      properties: { street: "улица Кирова", housenumber: "27 ст1", name: "Дента" },
    },
  ],
};

async function withGps(fn) {
  const app = await openApp();
  const { ctx, page } = app;
  await ctx.grantPermissions(["geolocation"]);
  await ctx.setGeolocation({ latitude: 55.01859, longitude: 82.94475, accuracy: 25 });
  await ctx.route("https://nominatim.openstreetmap.org/**", r =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ address: { road: "улица Сакко и Ванцетти", house_number: "74" } }),
    })
  );
  await ctx.route("https://photon.komoot.io/**", r =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PHOTON) })
  );
  try {
    await fn(page, app);
  } finally {
    await app.close();
  }
}

export const tests = {
  async "введённый адрес не заменяется ближайшей улицей, дом выбирается из списка"() {
    await withGps(async page => {
      await page.click("#newobj");
      await page.fill("#on", "Стоматология");
      await page.fill("#oa", "улица Кирова, 27 с1");
      await page.click("#ohere");
      await page.waitForSelector("[data-near]");
      assert.equal(await page.inputValue("#oa"), "улица Кирова, 27 с1", "адрес, введённый вручную, остаётся");
      const chips = await page.locator("[data-near]").allInnerTexts();
      assert.match(chips[0], /Дента — улица Кирова, 27 ст1 · \d+ м/, "ближайший дом первым");
      assert.match(chips[1], /Сакко и Ванцетти, 74/);
      await page.locator("[data-near]").first().click();
      assert.equal(await page.inputValue("#oa"), "улица Кирова, 27 ст1");
      assert.equal(await page.locator("[data-near]").count(), 0);
    });
  },

  async "пустой адрес заполняется по GPS, а варианты всё равно показываются"() {
    await withGps(async page => {
      await page.click("#newobj");
      await page.fill("#on", "Объект");
      await page.click("#ohere");
      await page.waitForSelector("[data-near]");
      assert.match(
        await page.inputValue("#oa"),
        /Сакко и Ванцетти/,
        "пока адреса нет, подставляется найденный"
      );
      assert.equal(await page.locator("[data-near]").count(), 2);
    });
  },
};
