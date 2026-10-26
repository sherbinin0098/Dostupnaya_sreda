import { mergeBackup } from "../backup";
import { db, migrateUnits, replaceDb, save } from "../core/storage";
import { byId, dataURLtoBlob, esc, fileSafe } from "../core/util";
import { NShare, isNative, shareOrDownload } from "../native";
import { putPhoto } from "../photodb";
import { buildCSV, buildText } from "../reports/basic";
import { cmpData, cmpReport, cmpText } from "../reports/compare";
import { buildLetter } from "../reports/letter";
import { buildPassportDocx } from "../reports/passport-docx";
import { buildOfficialPassport } from "../reports/passport";
import { buildPassport } from "../reports/passport-short";
import { exportPublic, pubLast } from "../reports/public";
import { buildBackup, buildReport } from "../reports/report";
import { backBtn, bindBack } from "./stats";
import { app, render, toast } from "../ui/common";

export function renderExport() {
  app.innerHTML = `<div class="card">${backBtn()}<h2 style="margin-top:0">Экспорт</h2>
   <label for="eo">Объект</label><select id="eo"><option value="">Все объекты</option>${db.objects.map(x => `<option value="${x.id}" ${x.id === db.currentObj ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
   <div class="row" style="margin-top:10px"><button id="ecsv" class="primary">Таблица CSV (для Google Таблиц)</button></div>
   <div class="row" style="margin-top:10px"><button id="erep" class="primary">Отчёт с фото</button><button id="erepb">Отчёт с фото: только нарушения</button></div>
   <p class="muted">Отчёт — файл, который открывается на любом телефоне и компьютере как страница: замеры, нормы, пункты, место на карте и фото. Его можно приложить к обращению или распечатать в PDF.</p>
   <label for="efmt">Формат паспорта, акта и анкеты</label><select id="efmt"><option value="docx">Документ Word (.docx) — открывается в Word, Google Документах, правится</option><option value="html">Страница (.html) — для просмотра и печати из браузера</option></select>
   <div class="row" style="margin-top:10px"><button id="epass2" class="primary">Паспорт доступности ОСИ (по форме приказа № 627)</button></div>
   <div class="row" style="margin-top:10px"><button id="epass">Справка о результатах обследования</button><button id="epub">Данные для публичной карты</button></div>
   <div class="row" style="margin-top:10px"><button id="ecmp">До и после: отчёт</button><button id="ecmpt">До и после: текст</button></div>
   <div class="row" style="margin-top:10px"><button id="eletter">Письмо-обращение (шаблон)</button></div>
   <div class="row" style="margin-top:10px"><button id="eact">Акт обследования (форма А.4)</button><button id="eank">Анкета (форма А.3)</button></div>
   <div class="row" style="margin-top:10px"><button id="etxt">Текст для акта</button><button id="ebad">Текст для обращения (только нарушения)</button></div>
   <pre id="eprev" class="hidden"></pre><div class="row hidden" id="ebtns"><button id="ecopy" class="small">Копировать</button><button id="eshare" class="small">Поделиться текстом</button><button id="efile" class="small">Файлом</button></div></div>
   <div class="card"><h3 style="margin-top:0">Резервная копия</h3><p class="muted">Все данные хранятся только в этом телефоне. Копия — один файл со всеми объектами, замерами и фото. Сохраните её в облако или отправьте себе: с ней всё переносится на новый телефон.</p>
   <div class="row"><button id="ebk" class="small">Сохранить копию</button><button id="eim" class="small">Загрузить копию</button></div><div class="row" style="margin-top:8px"><button id="emerge" class="small">Добавить из файла коллеги</button></div><input type="file" id="eimf" accept=".json" class="hidden"><input type="file" id="emergef" accept=".json" class="hidden"></div>`;
  bindBack();
  const sel = () => document.getElementById("eo").value;
  document.getElementById("ecsv").onclick = () =>
    shareOrDownload("zamery_" + new Date().toISOString().slice(0, 10) + ".csv", buildCSV(sel()), "text/csv");
  const showT = only => {
    const id = sel();
    if (!id) {
      alert("Выберите конкретный объект.");
      return;
    }
    const t = buildText(id, only);
    const p = document.getElementById("eprev");
    p.textContent = t;
    p.classList.remove("hidden");
    document.getElementById("ebtns").classList.remove("hidden");
  };
  document.getElementById("etxt").onclick = () => showT(false);
  document.getElementById("ebad").onclick = () => showT(true);
  document.getElementById("ecopy").onclick = async () => {
    const t = document.getElementById("eprev").textContent;
    try {
      await navigator.clipboard.writeText(t);
      toast("Скопировано");
    } catch (e) {
      alert("Не удалось скопировать. Выделите текст вручную.");
    }
  };
  document.getElementById("eshare").onclick = async () => {
    const t = document.getElementById("eprev").textContent;
    try {
      if (isNative) {
        await NShare.share({ text: t });
        return;
      }
      if (navigator.share) await navigator.share({ text: t });
      else toast("Поделиться не поддерживается");
    } catch (e) {}
  };
  const rep = async only => {
    const id = sel();
    if (!id) {
      alert("Выберите конкретный объект.");
      return;
    }
    toast("Готовлю отчёт…");
    const o = db.objects.find(x => x.id === id),
      html = await buildReport(id, only);
    await shareOrDownload(
      "otchet_" + fileSafe(o.name) + "_" + new Date().toISOString().slice(0, 10) + ".html",
      html,
      "text/html"
    );
  };
  byId("erep").onclick = () => rep(false);
  byId("erepb").onclick = () => rep(true);
  const need = () => {
    const id = sel();
    if (!id) {
      alert("Выберите конкретный объект.");
      return null;
    }
    return db.objects.find(x => x.id === id);
  };
  byId("epass").onclick = async () => {
    const o = need();
    if (!o) return;
    toast("Готовлю справку…");
    await shareOrDownload("spravka_" + fileSafe(o.name) + ".html", await buildPassport(o.id), "text/html");
  };
  // паспорт, акт и анкета: по умолчанию настоящий документ Word, по желанию — страница
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const exportDoc = (kind: string, base: string) => async () => {
    const o = need();
    if (!o) return;
    toast("Готовлю документ…");
    const asWord = (byId("efmt") as HTMLSelectElement).value !== "html";
    if (asWord) {
      const d = await buildPassportDocx(o.id, kind);
      if (!d) return;
      await shareOrDownload(base + fileSafe(o.name) + ".docx", d.data, DOCX);
    } else {
      await shareOrDownload(
        base + fileSafe(o.name) + ".html",
        await buildOfficialPassport(o.id, kind),
        "text/html"
      );
    }
  };
  byId("epass2").onclick = exportDoc("passport", "pasport_dostupnosti_");
  byId("epub").onclick = exportPublic;
  byId("eletter").onclick = () => {
    const o = need();
    if (!o) return;
    const p = byId("eprev");
    p.textContent = buildLetter(o.id);
    p.classList.remove("hidden");
    byId("ebtns").classList.remove("hidden");
    p.scrollIntoView({ block: "center" });
  };
  byId("eact").onclick = exportDoc("act", "akt_obsledovaniya_");
  byId("eank").onclick = exportDoc("anketa", "anketa_");
  byId("efile").onclick = () => {
    const t = byId("eprev").textContent;
    if (!t) return;
    const nm =
      pubLast && pubLast.text === t
        ? pubLast.name
        : "tekst_" + new Date().toISOString().slice(0, 10) + ".txt";
    shareOrDownload(nm, t, /^\{/.test(t) ? "application/json" : "text/plain");
  };
  byId("ecmp").onclick = async () => {
    const o = need();
    if (!o) return;
    if (!cmpData(o)) {
      alert(
        "У этого объекта ещё нет повторного обследования. Нажмите «Повторное обследование» на вкладке «Замер»."
      );
      return;
    }
    toast("Готовлю отчёт…");
    await shareOrDownload("do_i_posle_" + fileSafe(o.name) + ".html", await cmpReport(o), "text/html");
  };
  byId("ecmpt").onclick = () => {
    const o = need();
    if (!o) return;
    if (!cmpData(o)) {
      alert("У этого объекта ещё нет повторного обследования.");
      return;
    }
    const p = byId("eprev");
    p.textContent = cmpText(o);
    p.classList.remove("hidden");
    byId("ebtns").classList.remove("hidden");
  };
  document.getElementById("ebk").onclick = async () => {
    toast("Собираю копию…");
    const bk = await buildBackup();
    db.settings.lastBackup = Date.now();
    save();
    await shareOrDownload(
      "gorynych_backup_" + new Date().toISOString().slice(0, 10) + ".json",
      bk.text,
      "application/json"
    );
  };
  document.getElementById("eim").onclick = () => document.getElementById("eimf").click();
  byId("emerge").onclick = () => byId("emergef").click();
  byId("emergef").onchange = e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) mergeBackup(f);
  };
  document.getElementById("eimf").onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      let d, nd;
      try {
        d = JSON.parse(String(rd.result));
        nd = d && d.v === 2 ? d.db : d;
        if (!nd || !Array.isArray(nd.objects) || !Array.isArray(nd.records)) throw 0;
      } catch (x) {
        alert("Файл не похож на копию.");
        return;
      }
      if (!confirm("Заменить текущие данные копией?")) return;
      nd = migrateUnits(nd);
      replaceDb(Object.assign({ objects: [], records: [], overrides: {}, currentObj: null, ver: 3 }, nd));
      db.settings = Object.assign({ stamp: true }, db.settings || {});
      let n = 0;
      if (d.v === 2 && d.photos)
        for (const [pid, u] of Object.entries(d.photos)) {
          try {
            if (await putPhoto(pid, dataURLtoBlob(u))) n++;
          } catch (x) {}
        }
      save();
      toast("Загружено" + (n ? ", фото: " + n : ""));
      render();
    };
    rd.readAsText(f);
  };
}
