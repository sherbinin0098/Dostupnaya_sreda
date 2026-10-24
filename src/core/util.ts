export function blobToB64(blob: Blob) {
  return new Promise<string>(res => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.readAsDataURL(blob);
  });
}
export const esc = s =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
export const fmt = n => (n == null || n === "" ? "" : String(n).replace(".", ","));
export const num = s => {
  const v = parseFloat(String(s).replace(",", ".").trim());
  return isFinite(v) ? v : null;
};
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
export function csvEsc(s) {
  s = String(s == null ? "" : s);
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const TRL = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};
export function fileSafe(name) {
  return (
    String(name || "")
      .toLowerCase()
      .replace(/[а-яё]/g, c => TRL[c])
      .replace(/[^0-9a-z]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "obekt"
  );
}
export const byId = id => document.getElementById(id);
export function dist(a, b) {
  const R = 6371000,
    d = Math.PI / 180,
    dl = (b.lat - a.lat) * d,
    dn = (b.lon - a.lon) * d;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
export const fmtDist = d =>
  d < 1000
    ? Math.max(10, Math.round(d / 10) * 10) + " м"
    : (d / 1000).toFixed(d < 10000 ? 1 : 0).replace(".", ",") + " км";
export function blobToDataURL(b: Blob) {
  return new Promise<string | null>(res => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => res(null);
    r.readAsDataURL(b);
  });
}
export function dataURLtoBlob(d) {
  const i = d.indexOf(","),
    mime = (d.slice(0, i).match(/data:([^;]+)/) || [])[1] || "image/jpeg",
    bin = atob(d.slice(i + 1));
  const a = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k);
  return new Blob([a], { type: mime });
}
export const DAY = 864e5;
export const dstr = t => new Date(t).toLocaleDateString("ru-RU");
export const toISO = t => {
  const d = new Date(t);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
};
export const fromISO = s => {
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
};
