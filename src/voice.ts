import { fmt } from "./core/util";
import { parseSpoken } from "./core/voice-parse";
import { isNative, nCall } from "./native";

export function speechAvailable() {
  return isNative || !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
// после первого отказа в микрофоне или недоступности тихого режима дальше сразу открываем системное окно
let quietOff = false;
export function listenOnce() {
  return new Promise<string[]>((res, rej) => {
    if (isNative) {
      const dialog = () =>
        nCall("Dictation", "listen", { lang: "ru-RU" }).then(
          r => res((r && r.matches) || []),
          e => rej(e)
        );
      // сначала тихое распознавание без окна (нужен микрофон); если нельзя — системное окно
      if (quietOff) return dialog();
      nCall("Dictation", "listenQuiet", { lang: "ru-RU" }).then(
        r => res((r && r.matches) || []),
        e => {
          const m = String((e && e.message) || e);
          if (
            /no_permission|unavailable|not.*implemented|UNIMPLEMENTED/i.test(m) ||
            /^error_(5|9|10|11|12|13)/.test(m)
          ) {
            quietOff = true;
            dialog();
          } else if (/busy|^error_(3|8)$/.test(m)) {
            res([]);
          } else rej(e);
        }
      );
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return rej(new Error("no"));
    const r = new SR();
    r.lang = "ru-RU";
    r.maxAlternatives = 5;
    r.onresult = e => res([...e.results[0]].map(x => x.transcript));
    r.onerror = e => rej(new Error(e.error));
    r.onend = () => res([]);
    r.start();
  });
}
export async function dictate(unit, input, say, rule) {
  say("Слушаю…");
  let list: string[] = [];
  try {
    list = await listenOnce();
  } catch (e) {
    const m = String((e && e.message) || e);
    say(
      /not.*implemented|unavailable|no_recognizer|UNIMPLEMENTED/i.test(m)
        ? "Голосовой ввод недоступен на этом телефоне."
        : "Не получилось записать голос."
    );
    return;
  }
  if (!list.length) {
    say("Ничего не услышал. Нажмите ещё раз.");
    return;
  }
  for (const t of list) {
    const p = parseSpoken(t, unit, rule);
    if (p) {
      input.value = String(p.value).replace(".", ",");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      say(`Услышал: «${t}» → ${fmt(p.value)} ${unit}${p.note ? " (" + p.note + ")" : ""}. Проверьте число.`);
      return;
    }
  }
  say(`Услышал: «${list[0]}». Число не разобрал, введите вручную.`);
}
