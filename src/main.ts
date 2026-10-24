import "./style.css";
import { load } from "./core/storage";
import { init_core_draft } from "./core/draft";
import { init_photos } from "./photos";
import { init_place } from "./place";
import { openIDB } from "./photodb";
import { applyBig, render } from "./ui/common";

// обработчики страницы, которые раньше жили прямо в теле скрипта
init_place();
init_photos();
init_core_draft();

load();
applyBig();
openIDB().then(render);

// для автотестов в браузере: собрать с VITE_EXPOSE=1, тогда функции и состояние видны как глобальные
if (import.meta.env.VITE_EXPOSE) import("./testing");
