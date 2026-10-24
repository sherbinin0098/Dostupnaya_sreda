import { db, migrateUnits, save } from "./core/storage";
import { DAY, dataURLtoBlob } from "./core/util";
import { putPhoto } from "./photodb";
import { render, toast } from "./ui/common";

export function backupBanner() {
  if (!db.records.length) return "";
  const last = db.settings.lastBackup,
    d = last ? Math.floor((Date.now() - last) / DAY) : null;
  if (d != null && d < 14) return "";
  return `<div class="card warn" id="bkbn"><b>Резервная копия</b><div>${d == null ? "Копия ещё ни разу не сохранялась." : "Последняя копия сделана " + d + " дн. назад."} Данные хранятся только на этом телефоне.</div><button type="button" class="small" id="bkgo" style="margin-top:6px">Сделать копию</button></div>`;
}
export async function mergeBackup(file) {
  let d;
  try {
    d = JSON.parse(await file.text());
  } catch (e) {
    alert("Файл не похож на копию.");
    return;
  }
  let nd = d && d.v === 2 ? d.db : d;
  if (!nd || !Array.isArray(nd.objects) || !Array.isArray(nd.records)) {
    alert("Файл не похож на копию.");
    return;
  }
  nd = migrateUnits(nd);
  const ho = new Set(db.objects.map(x => x.id)),
    hr = new Set(db.records.map(x => x.id)),
    ha = new Set((db.appeals || []).map(x => x.id));
  const no = nd.objects.filter(x => !ho.has(x.id)),
    nr = nd.records.filter(x => !hr.has(x.id)),
    na = (nd.appeals || []).filter(x => !ha.has(x.id));
  if (!no.length && !nr.length && !na.length) {
    alert("В этом файле нет ничего нового: всё уже есть на этом телефоне.");
    return;
  }
  if (
    !confirm(
      "Добавить из файла: объектов — " +
        no.length +
        ", замеров — " +
        nr.length +
        ", обращений — " +
        na.length +
        "? Ваши данные не изменятся."
    )
  )
    return;
  db.objects.push(...no);
  db.records.push(...nr);
  db.appeals = [...(db.appeals || []), ...na];
  let n = 0;
  if (d.v === 2 && d.photos)
    for (const r of nr)
      for (const id of r.photos || []) {
        const u = d.photos[id];
        if (u) {
          try {
            if (await putPhoto(id, dataURLtoBlob(u))) n++;
          } catch (e) {}
        }
      }
  save();
  toast("Добавлено: объектов " + no.length + ", замеров " + nr.length + (n ? ", фото " + n : ""));
  render();
}
