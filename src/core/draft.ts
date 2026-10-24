import { newDraft } from "./state";
import { RULES } from "./rules";
import { ui } from "./state";

export const DRAFT_KEY = "gorynych_draft_v1";
export let lastDraftJson = "";

export function init_core_draft(): void {
  try {
    const dj = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (dj && typeof dj === "object" && dj.ruleId && RULES.some(r => r.id === dj.ruleId))
      ui.draft = Object.assign(newDraft(""), dj);
  } catch (e) {}
  setInterval(() => {
    try {
      const j = JSON.stringify(ui.draft);
      if (j === lastDraftJson) return;
      lastDraftJson = j;
      if (
        ui.draft.ruleId &&
        (ui.draft.value ||
          ui.draft.comment ||
          ui.draft.exp ||
          ui.draft.fix ||
          Object.values(ui.draft.slots || {}).some(Boolean))
      )
        localStorage.setItem(DRAFT_KEY, j);
      else localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
  }, 1500);
}
