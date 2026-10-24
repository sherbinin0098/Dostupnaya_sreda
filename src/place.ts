import type { Geo } from "./core/types";
import { RES } from "./core/rules";
import { curObj, db } from "./core/storage";
import { byId, dist, esc, fmt, fmtDist } from "./core/util";
import { toast } from "./ui/common";

export const NSK = { lat: 55.0302, lon: 82.9204 };
export function getFix() {
  return new Promise<Geo | null>(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      () => res(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}
export const mapLink = g =>
  "https://yandex.ru/maps/?pt=" + (+g.lon).toFixed(6) + "," + (+g.lat).toFixed(6) + "&z=17&l=map";
export const geoTxt = g => g.lat.toFixed(5) + ", " + g.lon.toFixed(5);
export function geoLine(g, place?: string) {
  if (!g) return place ? `<div class="geo">📍 ${esc(place)}</div>` : "";
  return `<div class="geo">📍 ${place ? esc(place) + " · " : ""}${geoTxt(g)}${g.manual ? " (на карте)" : g.acc ? " (±" + Math.round(g.acc) + " м)" : ""} · <a href="${mapLink(g)}" target="_blank" rel="noopener">открыть карту</a></div>`;
}
export function fetchJSON(u: string, ms = 7000): Promise<any> {
  const c = window.AbortController ? new AbortController() : null;
  const t = setTimeout(() => {
    if (c) c.abort();
  }, ms);
  return fetch(u, c ? { signal: c.signal } : {}).then(
    r => {
      clearTimeout(t);
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    },
    e => {
      clearTimeout(t);
      throw e;
    }
  );
}
export function photonAddr(p) {
  return {
    street: [p.street, p.housenumber].filter(Boolean).join(", "),
    city: p.city || p.town || p.village || p.locality || p.district || "",
  };
}
export async function reverseGeo(g) {
  try {
    const j = await fetchJSON(
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ru&zoom=18&addressdetails=1&lat=" +
        g.lat +
        "&lon=" +
        g.lon
    );
    const a = j && j.address;
    if (a) {
      const s = [a.road || a.pedestrian || a.footway || a.neighbourhood, a.house_number]
        .filter(Boolean)
        .join(", ");
      if (s) return s;
    }
  } catch (e) {}
  try {
    const j = await fetchJSON("https://photon.komoot.io/reverse?lang=default&lat=" + g.lat + "&lon=" + g.lon);
    const f = j && j.features && j.features[0];
    if (f) {
      const p = f.properties || {},
        s = photonAddr(p).street || p.name || "";
      if (s) return s;
    }
  } catch (e) {}
  return null;
}
export function fold(s) {
  return (s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,;:«»"'„“”()№#\-–—\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export const STOP = {
  ул: 1,
  улица: 1,
  д: 1,
  дом: 1,
  пр: 1,
  "пр-т": 1,
  просп: 1,
  проспект: 1,
  пер: 1,
  переулок: 1,
  г: 1,
  город: 1,
  и: 1,
  на: 1,
  у: 1,
};
export const words = s =>
  fold(s)
    .split(" ")
    .filter(w => w && !STOP[w]);
export function lev(a, b) {
  let p = [];
  for (let j = 0; j <= b.length; j++) p[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    for (let j = 1; j <= b.length; j++)
      c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
}
export function wordHit(w, list) {
  let best = 0;
  const num = /^\d/.test(w),
    max = w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0;
  for (const x of list) {
    if (x.indexOf(w) === 0) return 2;
    if (num || !max) continue;
    if (lev(w, x.slice(0, w.length)) <= max || lev(w, x) <= max) best = 1;
  }
  return best;
}
export function fit(q, name) {
  const nw = words(name);
  let s = 0;
  for (const w of words(q)) {
    const h = wordHit(w, nw);
    if (!h) return -1;
    s += h;
  }
  return s;
}
export async function photonSearch(q, ref) {
  const j = await fetchJSON(
    "https://photon.komoot.io/api/?limit=10&lang=default&q=" +
      encodeURIComponent(q) +
      "&lat=" +
      ref.lat.toFixed(5) +
      "&lon=" +
      ref.lon.toFixed(5) +
      "&zoom=14&location_bias_scale=0.1"
  );
  const seen = {},
    out = [];
  ((j && j.features) || []).forEach(f => {
    const p = f.properties || {},
      c = f.geometry && f.geometry.coordinates;
    if (!c) return;
    if (/^(country|state|region|county|continent)$/.test(p.type || "")) return;
    const g = { lat: +c[1], lon: +c[0] },
      d = dist(ref, g);
    if (d > 50000) return;
    const { street, city } = photonAddr(p);
    if (!p.name && !street) return;
    const key = fold((p.name || "") + "|" + street);
    if (seen[key]) return;
    seen[key] = 1;
    out.push({ name: p.name || "", street, city, house: p.housenumber || "", geo: g, d });
  });
  const qn = words(q).find(w => /^\d/.test(w)) || "";
  out.forEach(o => {
    o.k = o.d - (qn && o.house && fold(o.house) === qn ? 1e6 : 0);
  });
  return out.sort((a, b) => a.k - b.k).slice(0, 6);
}
export const AC = {
  el: null,
  box: null,
  items: [],
  near: [],
  ns: "",
  nq: "",
  t: null,
  seq: 0,
  fix: null,
  fixing: false,
  lastNet: 0,
  here: null,
  hereKey: "",
};
export function acRef() {
  if (AC.fix) return AC.fix;
  const o = curObj();
  if (o && o.geo) return o.geo;
  const g = db.objects
    .map(x => x.geo)
    .filter(Boolean)
    .pop();
  return g || NSK;
}
export function acSilentFix() {
  if (AC.fix || AC.fixing || !navigator.permissions || !navigator.geolocation) return;
  AC.fixing = true;
  navigator.permissions.query({ name: "geolocation" }).then(
    s => {
      if (s.state !== "granted") {
        AC.fixing = false;
        return;
      }
      getFix().then(g => {
        AC.fixing = false;
        if (g) {
          AC.fix = g;
          hereLookup();
        }
      });
    },
    () => {
      AC.fixing = false;
    }
  );
}
export function hereLookup() {
  const g = AC.fix;
  if (!g) return;
  const key = g.lat.toFixed(4) + "," + g.lon.toFixed(4);
  if (key === AC.hereKey) return;
  AC.hereKey = key;
  reverseGeo(g).then(a => {
    if (a) {
      AC.here = { address: a, geo: g };
      if (AC.el) acRender();
    } else AC.hereKey = "";
  });
}
export function acLocal(q, ref) {
  const f = fold(q),
    m: Record<string, any> = {};
  db.objects.forEach(o => {
    if (!o.address) return;
    const k = words(o.address).join(" ");
    if (!m[k]) m[k] = { name: o.name, address: o.address, geo: o.geo || null };
  });
  return Object.values(m)
    .map(o => {
      const s = f ? fit(q, o.address) : 0;
      if (s < 0 || fold(o.address) === f) return null;
      o._d = o.geo ? dist(ref, o.geo) : null;
      o._s = s * 5 + (o._d != null ? (o._d < 300 ? 20 : o._d < 3000 ? 8 : 0) : 0);
      return o;
    })
    .filter(Boolean)
    .sort((a, b) => b._s - a._s)
    .slice(0, 4);
}
export function acUpdate() {
  const el = AC.el;
  if (!el) return;
  const q = el.value.trim();
  AC.items = el.dataset.ac === "addr" ? acLocal(q, acRef()) : [];
  acNet(q);
  acRender();
}
export function acNet(q) {
  clearTimeout(AC.t);
  if (q.length < 3) {
    AC.seq++;
    AC.near = [];
    AC.ns = "";
    AC.nq = "";
    return;
  }
  if (q === AC.nq && AC.ns === "done") return;
  AC.ns = "loading";
  const seq = ++AC.seq;
  // публичный поиск просит не чаще одного запроса в секунду
  AC.t = setTimeout(
    () =>
      setTimeout(
        () => {
          if (seq !== AC.seq) return;
          AC.lastNet = Date.now();
          photonSearch(q, acRef()).then(
            list => {
              if (seq !== AC.seq) return;
              AC.near = list;
              AC.ns = "done";
              AC.nq = q;
              acRender();
            },
            () => {
              if (seq === AC.seq) {
                AC.ns = "fail";
                AC.near = [];
                acRender();
              }
            }
          );
        },
        Math.max(0, 1000 - (Date.now() - AC.lastNet))
      ),
    450
  );
}
export function acRender() {
  const el = AC.el;
  if (!el) return;
  const q = el.value.trim(),
    addr = el.dataset.ac === "addr";
  if (!AC.box) {
    AC.box = document.createElement("div");
    AC.box.className = "aclist";
    AC.box.setAttribute("role", "listbox");
    AC.box.addEventListener("mousedown", e => e.preventDefault());
    AC.box.addEventListener("click", acPick);
  }
  let h = "";
  if (addr && AC.here && (!q || fit(q, AC.here.address) >= 0))
    h += `<button type="button" class="aci" role="option" data-i="h"><span class="acn">📍 ${esc(AC.here.address)}</span><span class="acs">вы сейчас здесь</span></button>`;
  if (AC.items.length)
    h +=
      `<div class="ach">Ваши объекты</div>` +
      AC.items
        .map(
          (o, i) =>
            `<button type="button" class="aci" role="option" data-i="u${i}"><span class="acn">${esc(o.address)}</span><span class="acs">${esc([o.name, o._d != null ? fmtDist(o._d) : ""].filter(Boolean).join(" · "))}</span></button>`
        )
        .join("");
  if (AC.ns === "loading") h += `<div class="ach">На карте</div><div class="acs acwait">Ищу…</div>`;
  else if (AC.ns === "done" && AC.near.length)
    h +=
      `<div class="ach">На карте</div>` +
      AC.near
        .map(
          (o, i) =>
            `<button type="button" class="aci" role="option" data-i="n${i}"><span class="acn">${esc(addr ? o.street || o.name : o.name || o.street)}</span><span class="acs">${esc([addr ? (o.street ? o.name : "") : o.name ? o.street : "", o.city, fmtDist(o.d)].filter(Boolean).join(" · "))}</span></button>`
        )
        .join("");
  else if (AC.ns === "done" && !AC.items.length)
    h += `<div class="acs acwait">На карте ничего не нашлось. Впишите сами или отметьте место кнопкой «На карте».</div>`;
  else if (AC.ns === "fail")
    h += `<div class="acs acwait">Поиск по карте не отвечает (нет интернета?). Впишите сами.</div>`;
  const box = AC.box;
  if (!h) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.innerHTML = h;
  box.hidden = false;
  if (box.previousElementSibling !== el) el.insertAdjacentElement("afterend", box);
}
export function acClose() {
  clearTimeout(AC.t);
  AC.seq++;
  AC.el = null;
  AC.ns = "";
  AC.near = [];
  AC.nq = "";
  if (AC.box) {
    AC.box.hidden = true;
    AC.box.innerHTML = "";
  }
}
export function acPick(e) {
  const t = e.target.closest(".aci"),
    el = AC.el;
  if (!t || !el) return;
  const i = t.dataset.i;
  let it = null;
  if (i === "h") it = { address: AC.here.address, geo: AC.here.geo };
  else if (i[0] === "u") {
    const o = AC.items[+i.slice(1)];
    if (o) it = { name: o.name, address: o.address, geo: o.geo };
  } else {
    const o = AC.near[+i.slice(1)];
    if (o)
      it = {
        name: o.name || o.street,
        address: o.street || o.name,
        geo: { lat: o.geo.lat, lon: o.geo.lon, acc: null, manual: true },
      };
  }
  const cb = el._acPick;
  acClose();
  el.blur();
  if (it && cb) cb(it);
}
export async function hereFill(btn, cb) {
  const t = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Ищу…";
  const g = await getFix();
  if (!g) {
    btn.disabled = false;
    btn.textContent = t;
    toast("Не удалось определить место. Разрешите геолокацию или отметьте на карте.");
    return;
  }
  AC.fix = g;
  const a = await reverseGeo(g);
  btn.disabled = false;
  btn.textContent = t;
  cb({ address: a || "", geo: g });
}
export const LLS = [
  "leaflet/",
  "https://unpkg.com/leaflet@1.9.4/dist/",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/",
  "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/",
];
export let llReady = null,
  lmap = null,
  lmap2 = null,
  lay2 = null,
  pickCb = null,
  pickAddr = null,
  pickSeq = 0,
  lookT = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (llReady) return llReady;
  llReady = new Promise<void>((res, rej) => {
    const next = i => {
      if (i >= LLS.length) {
        llReady = null;
        rej();
        return;
      }
      const base = LLS[i],
        s = document.createElement("script");
      let done = false;
      const fail = () => {
        if (done) return;
        done = true;
        clearTimeout(to);
        s.remove();
        next(i + 1);
      };
      const to = setTimeout(fail, 8000);
      s.src = base + "leaflet.js";
      s.onerror = fail;
      s.onload = () => {
        if (done) return;
        done = true;
        clearTimeout(to);
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = base + "leaflet.css";
        l.onload = l.onerror = () => res();
        document.head.appendChild(l);
        setTimeout(res, 3000);
      };
      document.head.appendChild(s);
    };
    next(0);
  });
  return llReady;
}
export const osm = () =>
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  });
export function lookupCenter() {
  clearTimeout(lookT);
  const c = lmap.getCenter(),
    seq = ++pickSeq;
  pickAddr = null;
  byId("mapAddr").textContent = "Определяю адрес…";
  lookT = setTimeout(
    () =>
      reverseGeo({ lat: c.lat, lon: c.lng }).then(a => {
        if (seq !== pickSeq) return;
        pickAddr = a;
        byId("mapAddr").textContent = a || "Адрес не найден · " + c.lat.toFixed(5) + ", " + c.lng.toFixed(5);
      }),
    700
  );
}
export function gotoMe() {
  const b = byId("mapMe");
  b.disabled = true;
  b.textContent = "Ищу…";
  getFix().then(g => {
    b.disabled = false;
    b.textContent = "Я здесь";
    if (g) {
      AC.fix = g;
      if (lmap) lmap.setView([g.lat, g.lon], 18);
    } else toast("Не удалось определить место. Разрешите геолокацию или двигайте карту сами.");
  });
}
export function openPicker(start, cb) {
  pickCb = cb;
  pickAddr = null;
  byId("mapx").hidden = false;
  document.body.style.overflow = "hidden";
  byId("mapAddr").textContent = "Загрузка карты…";
  loadLeaflet().then(
    () => {
      if (!lmap) {
        lmap = L.map("map", { zoomControl: true });
        osm().addTo(lmap);
        lmap.attributionControl.setPrefix(false);
        lmap.on("movestart", () => {
          byId("pin").classList.add("up");
          pickSeq++;
          byId("mapAddr").textContent = "…";
        });
        lmap.on("moveend", () => {
          byId("pin").classList.remove("up");
          lookupCenter();
        });
      }
      setTimeout(() => lmap.invalidateSize(), 0);
      const s = start || AC.fix;
      if (s) lmap.setView([s.lat, s.lon], 18);
      else {
        lmap.setView([NSK.lat, NSK.lon], 12);
        gotoMe();
      }
    },
    () => {
      byId("mapAddr").textContent = "Не удалось загрузить карту. Проверьте интернет и попробуйте ещё раз.";
    }
  );
}
export function closeMap(id) {
  byId(id).hidden = true;
  if (byId("mapx").hidden && byId("mapall").hidden) document.body.style.overflow = "";
}
export const KCOL = {
  ok: "#1b7a3a",
  relaxok: "#1b7a3a",
  bad: "#c0352b",
  bad2: "#c0352b",
  relax: "#b07d0a",
  old: "#b07d0a",
  nonorm: "#6b7280",
};
export function openMapAll(list) {
  byId("mapall").hidden = false;
  document.body.style.overflow = "hidden";
  byId("allCount").textContent = "Загрузка карты…";
  loadLeaflet().then(
    () => {
      if (!lmap2) {
        lmap2 = L.map("map2");
        osm().addTo(lmap2);
        lmap2.attributionControl.setPrefix(false);
        lay2 = L.layerGroup().addTo(lmap2);
      }
      lay2.clearLayers();
      const pts = [];
      list.forEach(({ r, v }) => {
        const g = r.geo || (v.ob && v.ob.geo);
        if (!g) return;
        L.circleMarker([g.lat, g.lon], {
          radius: 10,
          color: "#fff",
          weight: 2,
          fillColor: KCOL[v.k] || "#6b7280",
          fillOpacity: 0.95,
        })
          .bindPopup(
            `<b>${esc(v.ru.name)}</b><br>${esc(v.ob ? v.ob.name : "")}<br>Факт: ${fmt(r.value)} ${esc(v.ru.unit)} — ${RES[v.k][0]}`
          )
          .addTo(lay2);
        pts.push([g.lat, g.lon]);
      });
      setTimeout(() => {
        lmap2.invalidateSize();
        if (pts.length) lmap2.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
        else lmap2.setView([NSK.lat, NSK.lon], 11);
      }, 0);
      byId("allCount").textContent = pts.length
        ? "На карте замеров: " + pts.length + " из " + list.length
        : "У замеров пока нет места. Отметьте место объекта или замера.";
    },
    () => {
      byId("allCount").textContent = "Не удалось загрузить карту. Проверьте интернет.";
    }
  );
}

export function init_place(): void {
  document.addEventListener("focusin", e => {
    const t = e.target;
    if (t.dataset && t.dataset.ac) {
      AC.el = t;
      acSilentFix();
      hereLookup();
      acUpdate();
    }
  });
  document.addEventListener("input", e => {
    if (e.target === AC.el) acUpdate();
  });
  document.addEventListener("focusout", e => {
    const t = e.target;
    if (t === AC.el)
      setTimeout(() => {
        if (AC.el === t && document.activeElement !== t) acClose();
      }, 150);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && AC.el) acClose();
  });
  byId("mapCancel").onclick = () => {
    pickCb = null;
    closeMap("mapx");
  };
  byId("mapMe").onclick = gotoMe;
  byId("mapOk").onclick = () => {
    const cb = pickCb;
    pickCb = null;
    closeMap("mapx");
    if (!lmap || !cb) return;
    const c = lmap.getCenter();
    cb({ lat: c.lat, lon: c.lng, acc: null, manual: true }, pickAddr);
  };
  byId("allClose").onclick = () => closeMap("mapall");
}
