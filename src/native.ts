import { blobToB64 } from "./core/util";

export const CAP = window.Capacitor;
export const isNative = !!(
  CAP &&
  CAP.isNativePlatform &&
  CAP.isNativePlatform() &&
  typeof CAP.nativePromise === "function"
);
export const nCall = (plugin: string, method: string, opts?: object): Promise<any> =>
  CAP.nativePromise(plugin, method, opts || {});
export const NShare = isNative ? { share: o => nCall("Share", "share", o) } : null;
export const NFs = isNative ? { writeFile: o => nCall("Filesystem", "writeFile", o) } : null;
export async function nativeShareBlob(name: string, blob: Blob) {
  const data: string = await blobToB64(blob);
  const w = await NFs.writeFile({ path: name, data, directory: "CACHE" });
  // проверка: файл на телефоне должен совпасть с тем, что записали (иначе получатель увидит пустой файл)
  let ok = true;
  try {
    const back: any = await nCall("Filesystem", "readFile", { path: name, directory: "CACHE" });
    const bd = String((back && back.data) || "").replace(/\s/g, "");
    if (bd.slice(0, 300) !== data.slice(0, 300) || Math.abs(bd.length - data.length) > 4) ok = false;
  } catch (e) {
    ok = true;
  }
  if (!ok) {
    if (/^(text|application\/json)/.test(blob.type || "")) {
      alert(
        "Файл записался с ошибкой. Отправляю содержимое текстом: вставьте его получателю как обычное сообщение."
      );
      await NShare.share({ title: name, text: await blob.text() });
      return;
    }
    alert("Файл записался с ошибкой, отправка отменена. Попробуйте ещё раз.");
    return;
  }
  await NShare.share({ title: name, url: w.uri });
}
/** PDF из готовой страницы: печатает родной движок телефона (плагин Pdf), затем файл уходит в «Поделиться». */
export async function nativePdfFromHtml(html: string, name: string) {
  const r = await nCall("Pdf", "fromHtml", { html, name });
  const u = await nCall("Filesystem", "getUri", { path: r.name, directory: "CACHE" });
  await NShare.share({ title: name, url: u.uri });
  return r as { name: string; pages: number; size: number };
}
/** В браузере: открывает окно печати (там «Сохранить как PDF»). */
export function printHtmlInBrowser(html: string) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  f.onload = () => {
    setTimeout(() => {
      f.contentWindow?.focus();
      f.contentWindow?.print();
      setTimeout(() => f.remove(), 60000);
    }, 800);
  };
  f.srcdoc = html;
}
export function download(name, text, type) {
  const b = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function shareOrDownload(name, text, type) {
  if (isNative) {
    try {
      await nativeShareBlob(name, new Blob([text], { type }));
    } catch (e) {
      if (!(e && /cancel/i.test(String(e.message || e)))) alert("Не удалось отправить файл.");
    }
    return;
  }
  try {
    const f = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f] });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  download(name, text, type);
}
