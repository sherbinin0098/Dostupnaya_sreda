import { curObj, db, save } from "../core/storage";
import { DAY, byId, dstr, esc, fromISO, toISO, uid } from "../core/util";
import { shareOrDownload } from "../native";
import { buildText } from "../reports/basic";
import { startRound } from "../route";
import { ui } from "../core/state";
import { app, render, toast } from "../ui/common";

export const ASTAT = {
  sent: "Отправлено, ждём ответ",
  answered: "Ответ получен",
  fixed: "Устранено",
  refused: "Отказ или отписка",
};
export function dueInfo(a) {
  if (a.status !== "sent")
    return {
      txt: ASTAT[a.status],
      cls: a.status === "fixed" ? "ok" : a.status === "refused" ? "bad" : "relax",
      days: null,
    };
  const d = Math.ceil((a.dueTs - Date.now()) / DAY);
  return d < 0
    ? { txt: "Срок ответа вышел " + -d + " дн. назад", cls: "bad", days: d }
    : d === 0
      ? { txt: "Срок ответа — сегодня", cls: "bad", days: d }
      : {
          txt: "Ответ ждём до " + dstr(a.dueTs) + " (осталось " + d + " дн.)",
          cls: d <= 3 ? "relax" : "ok",
          days: d,
        };
}
export function dueBanner() {
  const list = (db.appeals || [])
    .filter(a => a.status === "sent" && dueInfo(a).days <= 3)
    .sort((a, b) => a.dueTs - b.dueTs);
  if (!list.length) return "";
  return (
    `<div class="card warn" id="duebn"><b>Сроки по обращениям</b>` +
    list
      .slice(0, 3)
      .map(a => {
        const o = db.objects.find(x => x.id === a.objId);
        return `<div>${esc(o ? o.name : "")} → ${esc(a.to || "")}: ${esc(dueInfo(a).txt)}</div>`;
      })
      .join("") +
    `<button type="button" class="small" id="duego" style="margin-top:6px">Открыть обращения</button></div>`
  );
}
export function icsText(a) {
  const o = db.objects.find(x => x.id === a.objId),
    d = toISO(a.dueTs).replace(/-/g, ""),
    nx = toISO(a.dueTs + DAY).replace(/-/g, "");
  const e = s =>
    String(s || "")
      .replace(/[\\;,]/g, m => "\\" + m)
      .replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gorynych//Dostupnost//RU",
    "BEGIN:VEVENT",
    "UID:" + a.id + "@gorynych",
    "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
    "DTSTART;VALUE=DATE:" + d,
    "DTEND;VALUE=DATE:" + nx,
    "SUMMARY:" + e("Срок ответа на обращение: " + (o ? o.name : "")),
    "DESCRIPTION:" +
      e(
        (a.to ? "Кому: " + a.to + "\n" : "") + (a.regNo ? "Номер: " + a.regNo + "\n" : "") + (a.subject || "")
      ),
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Завтра срок ответа",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
export function renderAppeals() {
  const list = (db.appeals || [])
    .slice()
    .sort(
      (x, y) =>
        (x.status === "sent" ? 0 : 1) - (y.status === "sent" ? 0 : 1) ||
        (x.status === "sent" ? x.dueTs - y.dueTs : y.sentTs - x.sentTs)
    );
  let h = `<div class="card"><h2 style="margin-top:0">Обращения</h2><p class="muted">Куда и когда отправили, когда ждать ответ. Срок по умолчанию 30 дней (обращения рассматриваются обычно в течение 30 дней со дня регистрации; точный срок смотрите в ответе о регистрации).</p>
    <button class="primary" id="anew" style="width:100%">Новое обращение</button></div>`;
  if (!list.length) h += `<div class="card muted">Обращений пока нет.</div>`;
  list.forEach(a => {
    const o = db.objects.find(x => x.id === a.objId),
      di = dueInfo(a);
    h += `<div class="card" data-aid="${a.id}"><b>${esc(o ? o.name : "объект удалён")}</b><div class="muted">Кому: ${esc(a.to || "—")}${a.regNo ? " · № " + esc(a.regNo) : ""}</div>
      <div class="muted">Отправлено ${dstr(a.sentTs)}${a.how ? " · " + esc(a.how) : ""}</div><div style="margin:6px 0"><span class="badge ${di.cls}">${esc(di.txt)}</span></div>
      ${a.subject ? `<div>${esc(a.subject)}</div>` : ""}${a.answer ? `<div class="warn"><b>Ответ${a.answerTs ? " от " + dstr(a.answerTs) : ""}:</b> ${esc(a.answer)}</div>` : ""}
      <div class="row" style="margin-top:8px">${a.status === "sent" ? `<button class="small" data-aa="answer">Ответ получен</button>` : `<button class="small" data-aa="reopen">Снова ждём</button>`}
      ${a.status !== "fixed" ? `<button class="small" data-aa="fixed">Устранено</button>` : ""}${o ? `<button class="small" data-aa="recheck">Проверить заново</button>` : ""}
      <button class="small" data-aa="ics">В календарь</button><button class="small" data-aa="text">Текст обращения</button><button class="small" data-aa="edit">Изменить</button><button class="small danger" data-aa="del">Удалить</button></div></div>`;
  });
  app.innerHTML = h;
  byId("anew").onclick = () => appealForm(null);
  app.querySelectorAll("[data-aa]").forEach(
    b =>
      (b.onclick = () => {
        const id = b.closest("[data-aid]").dataset.aid,
          a = db.appeals.find(x => x.id === id),
          o = db.objects.find(x => x.id === a.objId),
          w = b.dataset.aa;
        if (w === "edit") return appealForm(a);
        if (w === "answer") return answerForm(a);
        if (w === "fixed") {
          a.status = "fixed";
          a.answerTs = a.answerTs || Date.now();
          save();
          toast("Отмечено: устранено");
          return renderAppeals();
        }
        if (w === "reopen") {
          a.status = "sent";
          save();
          return renderAppeals();
        }
        if (w === "recheck") {
          db.currentObj = o.id;
          save();
          ui.tab = "measure";
          render();
          return startRound(o);
        }
        if (w === "ics")
          return shareOrDownload("srok_otveta_" + toISO(a.dueTs) + ".ics", icsText(a), "text/calendar");
        if (w === "text") {
          if (!o) return;
          return shareOrDownload("obrashchenie.txt", buildText(o.id, true), "text/plain");
        }
        if (w === "del") {
          if (!confirm("Удалить обращение?")) return;
          db.appeals = db.appeals.filter(x => x.id !== id);
          save();
          renderAppeals();
        }
      })
  );
}
export function appealForm(a) {
  const prevTo = [...new Set((db.appeals || []).map(x => x.to).filter(Boolean))].slice(0, 6),
    o0 = curObj();
  const v = a || {
    objId: o0 ? o0.id : "",
    to: "",
    how: "",
    regNo: "",
    sentTs: Date.now(),
    days: 30,
    subject: "",
  };
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">${a ? "Изменить обращение" : "Новое обращение"}</h2>
   <label for="aobj">Объект</label><select id="aobj">${db.objects.map(x => `<option value="${x.id}" ${x.id === v.objId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
   <label for="ato">Кому</label><input id="ato" type="text" autocomplete="off" value="${esc(v.to)}" placeholder="Например: департамент … мэрии">
   ${prevTo.length ? `<div class="chips">${prevTo.map(t => `<button type="button" class="chip" data-to="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
   <label for="ahow">Как отправили</label><select id="ahow">${["", "Через портал", "По почте", "Лично", "По электронной почте", "Другое"].map(t => `<option ${t === (v.how || "") ? "selected" : ""}>${t}</option>`).join("")}</select>
   <label for="areg">Номер обращения (если дали)</label><input id="areg" type="text" autocomplete="off" value="${esc(v.regNo || "")}">
   <div class="row"><div><label for="adate">Дата отправки</label><input id="adate" type="date" value="${toISO(v.sentTs)}"></div><div><label for="adays">Срок ответа, дней</label><input id="adays" type="number" inputmode="numeric" min="1" value="${a ? Math.round((a.dueTs - a.sentTs) / DAY) : v.days}"></div></div>
   <label for="asub">О чём просили</label><textarea id="asub" placeholder="Например: устранить нарушения доступности входной группы">${esc(v.subject || "")}</textarea>
   <div class="row" style="margin-top:12px"><button class="primary" id="asv">Сохранить</button><button id="acn">Отмена</button></div></div>`;
  app.querySelectorAll("[data-to]").forEach(
    b =>
      (b.onclick = () => {
        byId("ato").value = b.dataset.to;
      })
  );
  byId("acn").onclick = renderAppeals;
  byId("asv").onclick = () => {
    if (!db.objects.length) {
      alert("Сначала добавьте объект на вкладке «Замер».");
      return;
    }
    const sentTs = fromISO(byId("adate").value),
      days = Math.max(1, parseInt(byId("adays").value, 10) || 30);
    const d = {
      objId: byId("aobj").value,
      to: byId("ato").value.trim(),
      how: byId("ahow").value,
      regNo: byId("areg").value.trim(),
      sentTs,
      dueTs: sentTs + days * DAY,
      subject: byId("asub").value.trim(),
    };
    if (a) Object.assign(a, d);
    else
      (db.appeals = db.appeals || []).push(
        Object.assign({ id: uid(), status: "sent", answer: "", answerTs: null }, d)
      );
    save();
    toast("Сохранено");
    renderAppeals();
  };
}
export function answerForm(a) {
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">Ответ на обращение</h2>
   <label for="ad">Дата ответа</label><input id="ad" type="date" value="${toISO(Date.now())}">
   <label for="ast">Итог</label><select id="ast"><option value="answered">Ответили, ждём исполнения</option><option value="fixed">Устранили</option><option value="refused">Отказ или отписка</option></select>
   <label for="atx">Что ответили</label><textarea id="atx" placeholder="Коротко: что пообещали и в какой срок">${esc(a.answer || "")}</textarea>
   <div class="row" style="margin-top:12px"><button class="primary" id="asv">Сохранить</button><button id="acn">Отмена</button></div></div>`;
  byId("acn").onclick = renderAppeals;
  byId("asv").onclick = () => {
    a.status = byId("ast").value;
    a.answerTs = fromISO(byId("ad").value);
    a.answer = byId("atx").value.trim();
    save();
    toast("Сохранено");
    renderAppeals();
  };
}
