// Модель данных приложения. Хранится в localStorage (ключ gorynych_dostupnost_v1), фото — в IndexedDB.

export type RuleStatus = "ok" | "chk" | "empty";

/** Норма из справки (data/rules.json). min/max — допустимый диапазон, amin/amax — смягчённый (при реконструкции). */
export interface Rule {
  id: string;
  group: string;
  name: string;
  unit: string;
  min: number | null;
  max: number | null;
  amin: number | null;
  amax: number | null;
  clause: string;
  doc: string;
  status: RuleStatus;
  note: string;
  cond: string;
}

/** Статус здания: новое, после реконструкции, старое (до 01.07.2016), не знаем. */
export type BuildingStatus = "new" | "recon" | "old" | "unknown";
export type ObjectType = "bld" | "street" | "other";

export interface Geo {
  lat: number;
  lon: number;
  acc?: number;
  [key: string]: any;
}

export interface Obj {
  id: string;
  name: string;
  address?: string;
  geo?: Geo | null;
  type?: ObjectType;
  bstatus: BuildingStatus;
  existing?: boolean;
  round?: number;
  rounds?: { n: number; ts: number }[];
  /** пункты маршрута, помеченные «нет такого»: ключ «обследование:код правила» */
  skip?: Record<string, boolean>;
  [key: string]: any;
}

/** Результат проверки одного замера. */
export type Kind = "ok" | "bad" | "bad2" | "relax" | "relaxok" | "old" | "nonorm";

export interface Rec {
  id: string;
  objId: string;
  round?: number;
  ruleId: string;
  value: number;
  result: Kind;
  ts: number;
  comment?: string;
  exp?: string;
  fix?: string;
  geo?: Geo | null;
  place?: string;
  slots?: Record<string, string>;
  photos?: string[];
  extra?: string[];
  /** отметка условия смягчённой нормы: выполнено / не выполнено / не проверено */
  cond?: boolean | null;
}

export type AppealStatus = "sent" | "answered" | "fixed" | "refused" | string;

export interface Appeal {
  id: string;
  objId: string;
  to: string;
  how: string;
  regNo: string;
  sentTs: number;
  dueTs: number;
  subject: string;
  status: AppealStatus;
  answer?: string;
  answerTs?: number;
  [key: string]: any;
}

export interface Settings {
  stamp: boolean;
  big?: 0 | 1 | 2;
  simple?: boolean;
  author?: string;
  confirmSave?: boolean;
  lastBackup?: number;
  vsSpeak?: boolean;
  notifIds?: number[];
  [key: string]: any;
}

export interface DB {
  objects: Obj[];
  records: Rec[];
  overrides: Record<string, Partial<Rule>>;
  currentObj: string | null;
  settings: Settings;
  appeals: Appeal[];
  ver: number;
}

/** Незаконченный замер на экране. */
export interface Draft {
  group: string;
  ruleId: string;
  value: string;
  comment: string;
  exp: string;
  fix: string;
  slots: Record<string, string>;
  geo: Geo | null;
  place: string;
  cond: boolean | null;
}
