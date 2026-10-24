// Запуск всех сквозных тестов: node tests/e2e/run.mjs  (перед этим: npm run build:test)
import { readdirSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
let failed = 0;
for (const f of readdirSync(here)
  .filter(f => f.endsWith(".e2e.mjs") && (!only || f.includes(only)))
  .sort()) {
  const m = await import(pathToFileURL(path.join(here, f)).href);
  for (const [name, fn] of Object.entries(m.tests)) {
    const t0 = Date.now();
    try {
      await fn();
      console.log(`✓ ${f.replace(".e2e.mjs", "")}: ${name} (${Date.now() - t0} мс)`);
    } catch (e) {
      failed++;
      console.error(
        `✗ ${f.replace(".e2e.mjs", "")}: ${name}\n   ${String(e.message || e)
          .split("\n")
          .slice(0, 6)
          .join("\n   ")}`
      );
    }
  }
}
console.log(failed ? `\nПровалено: ${failed}` : "\nВсе сквозные тесты прошли");
process.exit(failed ? 1 : 0);
