import { KINDS, kindOf } from "../core/rules";
import { db } from "../core/storage";
import { DAY, byId, esc } from "../core/util";
import { shareOrDownload } from "../native";
import { OTYPES } from "../route";
import { recView } from "./log";
import { ui } from "../core/state";
import { app, render, toast } from "../ui/common";

export let statPeriod = "all",
  statObj = "all";
export function statRows() {
  const now = new Date(),
    from =
      statPeriod === "m"
        ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        : statPeriod === "y"
          ? new Date(now.getFullYear(), 0, 1).getTime()
          : statPeriod === "d30"
            ? Date.now() - 30 * DAY
            : 0;
  return db.records
    .filter(r => r.ts >= from && (statObj === "all" || r.objId === statObj))
    .map(r => ({ r, v: recView(r) }))
    .filter(x => x.v.ru);
}
export function bar(counts) {
  const t = KINDS.reduce((s, [k]) => s + (counts[k] || 0), 0) || 1;
  return (
    `<svg viewBox="0 0 100 6" preserveAspectRatio="none" class="sbar" role="img" aria-label="${esc(KINDS.map(([k, n]) => n + ": " + (counts[k] || 0)).join(", "))}">` +
    (() => {
      let x = 0;
      return KINDS.map(([k, n, c]) => {
        const w = ((counts[k] || 0) / t) * 100,
          s = `<rect x="${x}" y="0" width="${w}" height="6" fill="${c}"/>`;
        x += w;
        return s;
      }).join("");
    })() +
    `</svg>`
  );
}
export function pctOk(c) {
  const d = (c.good || 0) + (c.cond || 0) + (c.old || 0) + (c.bad || 0);
  return d ? Math.round(((c.good || 0) / d) * 100) : null;
}
export function statData() {
  const rows = statRows(),
    tot: Record<string, number> = {},
    byG: Record<string, Record<string, number>> = {},
    byO: Record<string, { o: any; c: Record<string, number> }> = {},
    byT: Record<string, Record<string, number>> = {};
  rows.forEach(({ r, v }) => {
    const k = kindOf(v.k),
      g = v.ru.group || "—",
      o = v.ob;
    tot[k] = (tot[k] || 0) + 1;
    (byG[g] = byG[g] || {})[k] = (byG[g][k] || 0) + 1;
    if (o) {
      (byO[o.id] = byO[o.id] || { o, c: {} }).c[k] = (byO[o.id].c[k] || 0) + 1;
      const tn = (OTYPES[o.type || "other"] || "").split(" (")[0];
      (byT[tn] = byT[tn] || {})[k] = (byT[tn][k] || 0) + 1;
    }
  });
  return { rows, tot, byG, byO, byT };
}
export function statText(d: ReturnType<typeof statData>) {
  let t = `Сводка обследований (${new Date().toLocaleDateString("ru-RU")}).\nЗамеров: ${d.rows.length}, объектов: ${Object.keys(d.byO).length}.\n`;
  KINDS.forEach(([k, n]) => {
    if (d.tot[k]) t += `${n}: ${d.tot[k]}\n`;
  });
  t += "\nПо разделам (не соответствует из всех замеров):\n";
  Object.entries(d.byG)
    .sort((a, b) => (b[1].bad || 0) - (a[1].bad || 0))
    .forEach(([g, c]) => {
      const n = KINDS.reduce((s, [k]) => s + (c[k] || 0), 0);
      t += `${g}: ${c.bad || 0} из ${n}\n`;
    });
  t += "\nПо объектам (доля соответствия):\n";
  Object.values(d.byO).forEach(x => {
    const p = pctOk(x.c);
    t += `${x.o.name}: ${p == null ? "—" : p + "%"}\n`;
  });
  return t;
}
export function renderStats() {
  const d = statData(),
    legend = KINDS.map(
      ([k, n, c]) => `<span class="lg"><i style="background:${c}"></i>${n}: ${d.tot[k] || 0}</span>`
    ).join("");
  let h = `<div class="card">${backBtn()}<h2 style="margin-top:0">Сводка</h2>
    <div class="row"><div><label for="sp">Период</label><select id="sp">${[
      ["all", "За всё время"],
      ["m", "Этот месяц"],
      ["d30", "Последние 30 дней"],
      ["y", "Этот год"],
    ]
      .map(([k, t]) => `<option value="${k}" ${statPeriod === k ? "selected" : ""}>${t}</option>`)
      .join("")}</select></div>
    <div><label for="so">Объект</label><select id="so"><option value="all">Все объекты</option>${db.objects.map(o => `<option value="${o.id}" ${statObj === o.id ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></div></div></div>`;
  if (!d.rows.length) {
    h += `<div class="card muted">За выбранный период замеров нет.</div>`;
    app.innerHTML = h;
    bindStats(d);
    return;
  }
  h +=
    `<div class="card"><b>Замеров: ${d.rows.length} · объектов: ${Object.keys(d.byO).length}</b>${bar(d.tot)}<div class="lgs">${legend}</div></div>
    <div class="card"><b>По разделам</b>` +
    Object.entries(d.byG)
      .sort((a, b) => (b[1].bad || 0) - (a[1].bad || 0))
      .map(([g, c]) => `<div class="srow"><div class="muted">${esc(g)}</div>${bar(c)}</div>`)
      .join("") +
    `</div>
    <div class="card"><b>По объектам: доля соответствия</b>` +
    Object.values(d.byO)
      .sort((a, b) => (pctOk(a.c) ?? 101) - (pctOk(b.c) ?? 101))
      .map(x => {
        const p = pctOk(x.c);
        return `<div class="srow"><div class="muted">${esc(x.o.name)} — ${p == null ? "нет данных" : p + "%"}</div>${bar(x.c)}</div>`;
      })
      .join("") +
    `</div>` +
    (Object.keys(d.byT).length > 1
      ? `<div class="card"><b>По видам объектов</b>` +
        Object.entries(d.byT)
          .map(([t, c]) => `<div class="srow"><div class="muted">${esc(t)}</div>${bar(c)}</div>`)
          .join("") +
        `</div>`
      : "") +
    `<div class="card"><div class="row"><button id="stcopy" class="small">Копировать сводку</button><button id="stshare" class="small">Поделиться</button></div></div>`;
  app.innerHTML = h;
  bindStats(d);
}
export function bindStats(d) {
  byId("sp").onchange = e => {
    statPeriod = e.target.value;
    renderStats();
  };
  byId("so").onchange = e => {
    statObj = e.target.value;
    renderStats();
  };
  const c = byId("stcopy");
  if (c) {
    c.onclick = async () => {
      try {
        await navigator.clipboard.writeText(statText(d));
        toast("Скопировано");
      } catch (e) {
        alert("Не удалось скопировать.");
      }
    };
    byId("stshare").onclick = () => shareOrDownload("svodka.txt", statText(d), "text/plain");
  }
  bindBack();
}
export function backBtn() {
  return `<button type="button" class="small" id="backmore" style="margin-bottom:8px">← Ещё</button>`;
}
export function bindBack() {
  const b = byId("backmore");
  if (b)
    b.onclick = () => {
      ui.tab = "more";
      render();
      window.scrollTo(0, 0);
    };
}
