export function newDraft(group) {
  return {
    group,
    ruleId: "",
    value: "",
    comment: "",
    exp: "",
    fix: "",
    slots: {},
    geo: null,
    place: "",
    cond: null,
  };
}

// общее изменяемое состояние экранов (то, что раньше было глобальными переменными)
export const ui = { tab: "measure", focusVal: false, logFilter: "all", draft: newDraft("") };
