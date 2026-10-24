export let idb: IDBDatabase | null = null;
export function openIDB() {
  return new Promise<void>(res => {
    setTimeout(res, 4000);
    try {
      const r = indexedDB.open("gorynych_photos", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("p");
      r.onsuccess = () => {
        idb = r.result;
        res();
      };
      r.onerror = () => res();
    } catch (e) {
      res();
    }
  });
}
export function putPhoto(id: string, blob: Blob) {
  return new Promise<boolean>(res => {
    if (!idb) return res(false);
    const t = idb.transaction("p", "readwrite");
    t.objectStore("p").put(blob, id);
    t.oncomplete = () => res(true);
    t.onerror = () => res(false);
  });
}
export function getPhoto(id: string) {
  return new Promise<Blob | null>(res => {
    if (!idb) return res(null);
    const q = idb.transaction("p").objectStore("p").get(id);
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => res(null);
  });
}
export function delPhoto(id: string) {
  if (!idb) return;
  idb.transaction("p", "readwrite").objectStore("p").delete(id);
}
export function resize(file: Blob, max = 1280) {
  return new Promise<Blob>(res => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(
        b => {
          URL.revokeObjectURL(u);
          res(b || file);
        },
        "image/jpeg",
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      res(file);
    };
    img.src = u;
  });
}
