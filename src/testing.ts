// Только для автотестов (сборка с VITE_EXPOSE=1): делает функции и состояние видимыми как глобальные, как было в одном файле.
import { ui } from "./core/state";
import * as m0 from "./backup";
import * as m1 from "./core/calc";
import * as m2 from "./core/draft";
import * as m3 from "./core/rules";
import * as m4 from "./core/state";
import * as m5 from "./core/storage";
import * as m6 from "./core/util";
import * as m7 from "./core/voice-parse";
import * as m8 from "./native";
import * as m9 from "./notifications";
import * as m10 from "./photodb";
import * as m11 from "./photos";
import * as m12 from "./place";
import * as m13 from "./reports/basic";
import * as m14 from "./reports/compare";
import * as m15 from "./reports/letter";
import * as m16 from "./reports/passport-short";
import * as m17 from "./reports/passport";
import * as m18 from "./reports/public";
import * as m19 from "./reports/report";
import * as m20 from "./route";
import * as m21 from "./screens/appeals";
import * as m22 from "./screens/dictation";
import * as m23 from "./screens/export";
import * as m24 from "./screens/log";
import * as m25 from "./screens/measure";
import * as m26 from "./screens/norms";
import * as m27 from "./screens/stats";
import * as m28 from "./screens/tools";
import * as m29 from "./screens/voice-list";
import * as m30 from "./tilt";
import * as m31 from "./ui/common";
import * as m32 from "./voice";
const spaces: Record<string, any>[] = [
  m0,
  m1,
  m2,
  m3,
  m4,
  m5,
  m6,
  m7,
  m8,
  m9,
  m10,
  m11,
  m12,
  m13,
  m14,
  m15,
  m16,
  m17,
  m18,
  m19,
  m20,
  m21,
  m22,
  m23,
  m24,
  m25,
  m26,
  m27,
  m28,
  m29,
  m30,
  m31,
  m32,
];
for (const ns of spaces)
  for (const k of Object.keys(ns)) {
    if (k.startsWith("init_")) continue;
    Object.defineProperty(window, k, { get: () => ns[k], configurable: true });
  }
for (const k of Object.keys(ui))
  Object.defineProperty(window, k, {
    get: () => (ui as any)[k],
    set: v => {
      (ui as any)[k] = v;
    },
    configurable: true,
  });
