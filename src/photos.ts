import { curObj, db, save } from "./core/storage";
import { uid } from "./core/util";
import { delPhoto, getPhoto, putPhoto, resize } from "./photodb";
import { geoTxt } from "./place";
import { showPhoto } from "./screens/log";
import { ui } from "./core/state";
import { toast } from "./ui/common";

export const SLOTS = [
  ["view", "Общий вид"],
  ["meas", "Замер рулеткой"],
  ["detail", "Деталь"],
];
export const SLOTN = Object.fromEntries(SLOTS);
export function ensureSlots(r) {
  if (!r.slots) {
    r.slots = {};
    (r.photos || []).forEach((id, i) => {
      if (i < SLOTS.length) r.slots[SLOTS[i][0]] = id;
      else (r.extra = r.extra || []).push(id);
    });
  }
  return r.slots;
}
export function syncPhotos(r) {
  r.photos = [...Object.values(r.slots).filter(Boolean), ...(r.extra || [])];
}
export const scopeRec = scope => (scope === "draft" ? null : db.records.find(x => x.id === scope));
export function scopeSlots(scope) {
  if (scope === "draft") return ui.draft.slots;
  const r = scopeRec(scope);
  return r ? ensureSlots(r) : {};
}
export const PURL = {};
export async function photoURL(id) {
  if (PURL[id]) return PURL[id];
  const b = await getPhoto(id);
  if (!b) return null;
  return (PURL[id] = URL.createObjectURL(b));
}
export function forgetPhoto(id) {
  delPhoto(id);
  if (PURL[id]) {
    const u = PURL[id];
    delete PURL[id];
    setTimeout(() => URL.revokeObjectURL(u), 3000);
  }
}
export function fillImgs(root) {
  root.querySelectorAll("img[data-img]").forEach(async im => {
    const u = await photoURL(im.dataset.img);
    if (u) im.src = u;
  });
}
export function tileHTML(scope, k, cap, id) {
  return id
    ? `<button type="button" class="tile has" data-scope="${scope}" data-slot="${k}" data-pid="${id}" aria-label="${cap}: открыть фото"><img alt="" data-img="${id}"><span class="tcap">${cap}</span></button>`
    : `<label class="tile" data-scope="${scope}" data-slot="${k}"><input type="file" accept="image/*" capture="environment" class="vh" data-pick="1"><span class="plus">+</span><span class="tl">${cap}</span></label>`;
}
export function tilesInner(scope) {
  const s = scopeSlots(scope);
  return SLOTS.map(([k, cap]) => tileHTML(scope, k, cap, s[k])).join("");
}
export function tilesHTML(scope) {
  return `<div class="tiles" data-tiles="${scope}">${tilesInner(scope)}</div>
  <div class="row" style="margin-top:8px"><label class="btnlike small"><input type="file" accept="image/*" multiple class="vh" data-gal="${scope}">Фото из галереи</label></div>`;
}
export function refreshTiles(scope) {
  document.querySelectorAll(`[data-tiles="${scope}"]`).forEach(el => {
    el.innerHTML = tilesInner(scope);
    fillImgs(el);
  });
}
export function stampLines(scope, when) {
  const r = scopeRec(scope),
    o = r ? db.objects.find(x => x.id === r.objId) : curObj();
  const g = (r ? r.geo : ui.draft.geo) || (o && o.geo),
    place = (r ? r.place : ui.draft.place) || (o ? [o.name, o.address].filter(Boolean).join(", ") : "");
  return [
    when.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }),
    place,
    g ? geoTxt(g) : "",
  ];
}
export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}
export async function stampImage(blob: Blob, lines: string[]): Promise<Blob> {
  const u = URL.createObjectURL(blob);
  try {
    const img = await loadImage(u);
    const w = img.naturalWidth,
      h = img.naturalHeight,
      c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const fs = Math.max(14, Math.round(w * 0.032)),
      pad = Math.round(fs * 0.6),
      lh = Math.round(fs * 1.3);
    g.font = "600 " + fs + "px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
    g.textBaseline = "top";
    const out = [];
    lines.filter(Boolean).forEach(t => {
      let cur = "";
      String(t)
        .split(" ")
        .forEach(wd => {
          const test = cur ? cur + " " + wd : wd;
          if (g.measureText(test).width > w - 2 * pad && cur) {
            out.push(cur);
            cur = wd;
          } else cur = test;
        });
      if (cur) out.push(cur);
    });
    if (!out.length) return blob;
    const bh = out.length * lh + pad * 2 - Math.round((lh - fs) / 2);
    g.fillStyle = "rgba(0,0,0,0.58)";
    g.fillRect(0, h - bh, w, bh);
    g.fillStyle = "#fff";
    out.forEach((t, i) => g.fillText(t, pad, h - bh + pad + i * lh));
    return await new Promise(res => c.toBlob(b => res(b || blob), "image/jpeg", 0.82));
  } catch (e) {
    return blob;
  } finally {
    URL.revokeObjectURL(u);
  }
}
export async function setSlotPhoto(scope, slot, file) {
  let b = await resize(file);
  if (db.settings.stamp)
    b = await stampImage(b, stampLines(scope, new Date(file.lastModified || Date.now())));
  const id = uid();
  if (!(await putPhoto(id, b))) {
    alert("Фото не сохранилось: память недоступна.");
    return;
  }
  const s = scopeSlots(scope),
    old = s[slot];
  s[slot] = id;
  const r = scopeRec(scope);
  if (r) {
    syncPhotos(r);
    save();
  }
  if (old) forgetPhoto(old);
  refreshTiles(scope);
  toast(SLOTN[slot] + ": фото сохранено");
}
export async function addGallery(scope, files) {
  for (const f of files) {
    const s = scopeSlots(scope),
      k = SLOTS.map(x => x[0]).find(x => !s[x]);
    if (!k) {
      toast("Все окошки заняты. Нажмите на фото, чтобы заменить.");
      return;
    }
    await setSlotPhoto(scope, k, f);
  }
}
export function removeSlotPhoto(scope, slot) {
  const s = scopeSlots(scope),
    id = s[slot];
  if (!id) return;
  s[slot] = null;
  const r = scopeRec(scope);
  if (r) {
    syncPhotos(r);
    save();
  }
  forgetPhoto(id);
  refreshTiles(scope);
}
export async function replaceSlotBlob(scope, slot, blob) {
  const nid = uid();
  if (!(await putPhoto(nid, blob))) {
    alert("Фото не сохранилось: память недоступна.");
    return false;
  }
  const s = scopeSlots(scope),
    old = s[slot];
  s[slot] = nid;
  const r = scopeRec(scope);
  if (r) {
    syncPhotos(r);
    save();
  }
  if (old) forgetPhoto(old);
  refreshTiles(scope);
  return true;
}
export async function annotatePhoto(id, ctx) {
  const b = await getPhoto(id);
  if (!b) return;
  const u = URL.createObjectURL(b);
  const img = await loadImage(u).catch(() => null);
  if (!img) {
    URL.revokeObjectURL(u);
    return;
  }
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-label", "Пометки на фото");
  ov.style.cssText = "justify-content:flex-start;overflow:auto";
  ov.innerHTML = `<canvas id="acv" style="max-width:100%;max-height:58vh;touch-action:none;border-radius:8px;background:#000"></canvas>
   <div class="row" style="width:100%;max-width:520px"><button type="button" class="atool primary" data-t="arrow">Стрелка</button><button type="button" class="atool" data-t="circle">Круг</button><button type="button" class="atool" data-t="text">Текст</button></div>
   <div class="row" style="width:100%;max-width:520px"><button type="button" id="aundo">Отменить</button><button type="button" id="aclr">Очистить</button></div>
   <div class="row" style="width:100%;max-width:520px"><button type="button" class="primary" id="aok">Готово</button><button type="button" id="acn2">Отмена</button></div>`;
  document.body.appendChild(ov);
  const cv = ov.querySelector("#acv"),
    w = img.naturalWidth,
    h = img.naturalHeight;
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  const lw = Math.max(4, Math.round(w / 180)),
    col = "#ff2d2d";
  let tool = "arrow",
    marks = [],
    cur = null;
  const draw = () => {
    g.drawImage(img, 0, 0, w, h);
    g.lineWidth = lw;
    g.lineCap = "round";
    [...marks, ...(cur ? [cur] : [])].forEach(m => {
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = lw;
      if (m.t === "circle") {
        g.beginPath();
        g.arc(m.x1, m.y1, Math.hypot(m.x2 - m.x1, m.y2 - m.y1), 0, Math.PI * 2);
        g.stroke();
      } else if (m.t === "arrow") {
        const a = Math.atan2(m.y2 - m.y1, m.x2 - m.x1),
          hl = lw * 5;
        g.beginPath();
        g.moveTo(m.x1, m.y1);
        g.lineTo(m.x2, m.y2);
        g.stroke();
        g.beginPath();
        g.moveTo(m.x2, m.y2);
        g.lineTo(m.x2 - hl * Math.cos(a - 0.45), m.y2 - hl * Math.sin(a - 0.45));
        g.lineTo(m.x2 - hl * Math.cos(a + 0.45), m.y2 - hl * Math.sin(a + 0.45));
        g.closePath();
        g.fill();
      } else if (m.t === "text") {
        const fs = Math.max(24, Math.round(w / 22));
        g.font = "700 " + fs + "px system-ui,sans-serif";
        g.lineWidth = Math.max(3, fs / 8);
        g.strokeStyle = "#fff";
        g.strokeText(m.s, m.x1, m.y1);
        g.fillStyle = col;
        g.fillText(m.s, m.x1, m.y1);
      }
    });
  };
  const pos = e => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * w) / r.width, y: ((e.clientY - r.top) * h) / r.height };
  };
  cv.onpointerdown = e => {
    const p = pos(e);
    if (tool === "text") {
      const s = prompt("Подпись на фото:");
      if (s) {
        marks.push({ t: "text", x1: p.x, y1: p.y, s });
        draw();
      }
      return;
    }
    cv.setPointerCapture(e.pointerId);
    cur = { t: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    draw();
  };
  cv.onpointermove = e => {
    if (!cur) return;
    const p = pos(e);
    cur.x2 = p.x;
    cur.y2 = p.y;
    draw();
  };
  cv.onpointerup = () => {
    if (!cur) return;
    if (Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1) > lw * 2) marks.push(cur);
    cur = null;
    draw();
  };
  ov.querySelectorAll(".atool").forEach(
    bn =>
      (bn.onclick = () => {
        tool = bn.dataset.t;
        ov.querySelectorAll(".atool").forEach(x => x.classList.toggle("primary", x === bn));
      })
  );
  ov.querySelector("#aundo").onclick = () => {
    marks.pop();
    draw();
  };
  ov.querySelector("#aclr").onclick = () => {
    marks = [];
    draw();
  };
  const close = () => {
    URL.revokeObjectURL(u);
    ov.remove();
  };
  ov.querySelector("#acn2").onclick = close;
  ov.querySelector("#aok").onclick = () => {
    if (!marks.length) {
      close();
      return;
    }
    cv.toBlob(
      async bl => {
        close();
        if (bl && (await replaceSlotBlob(ctx.scope, ctx.slot, bl))) toast("Пометки сохранены");
      },
      "image/jpeg",
      0.86
    );
  };
  draw();
}

export function init_photos(): void {
  document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.pick) {
      const tile = t.closest("[data-slot]"),
        f = t.files && t.files[0];
      t.value = "";
      if (tile && f) setSlotPhoto(tile.dataset.scope, tile.dataset.slot, f);
    } else if (t.dataset.gal) {
      const fs = [...t.files];
      t.value = "";
      addGallery(t.dataset.gal, fs);
    }
  });
  document.addEventListener("click", e => {
    const t = e.target.closest && e.target.closest(".tile.has");
    if (t) showPhoto(t.dataset.pid, { scope: t.dataset.scope, slot: t.dataset.slot });
  });
}
