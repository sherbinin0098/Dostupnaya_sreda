import { KEY, db } from "./core/storage";
import { DAY } from "./core/util";
import { isNative, nCall } from "./native";

export const notifId = (aid, k) => {
  let h = 0;
  for (const c of String(aid)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h % 1000000) * 2 + k;
};
export let notifBusy = false;
export async function syncNotifs() {
  if (!isNative || notifBusy) return;
  notifBusy = true;
  try {
    const prev = (db.settings.notifIds || []).map(id => ({ id }));
    if (prev.length) await nCall("LocalNotifications", "cancel", { notifications: prev }).catch(() => {});
    const list = [],
      ids = [],
      now = Date.now(),
      at = t => {
        const d = new Date(t);
        d.setHours(9, 0, 0, 0);
        return d;
      };
    (db.appeals || [])
      .filter(a => a.status === "sent")
      .forEach(a => {
        const o = db.objects.find(x => x.id === a.objId),
          nm = (o ? o.name : "") + (a.to ? " → " + a.to : "");
        const d1 = at(a.dueTs - DAY),
          d0 = at(a.dueTs);
        if (d1.getTime() > now)
          list.push({
            id: notifId(a.id, 0),
            title: "Завтра срок ответа на обращение",
            body: nm,
            schedule: { at: d1.toISOString() },
          });
        if (d0.getTime() > now)
          list.push({
            id: notifId(a.id, 1),
            title: "Сегодня срок ответа на обращение",
            body: nm,
            schedule: { at: d0.toISOString() },
          });
      });
    if (list.length) {
      const p: any = await nCall("LocalNotifications", "requestPermissions", {}).catch(() => null);
      if (!p || !p.display || p.display === "granted") {
        await nCall("LocalNotifications", "schedule", { notifications: list });
        list.forEach(n => ids.push(n.id));
      }
    }
    db.settings.notifIds = ids;
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {}
  } catch (e) {
  } finally {
    notifBusy = false;
  }
}
