import ja from "./locales/ja.js";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
import zhTW from "./locales/zh-TW.js";
import ko from "./locales/ko.js";

export const LOCALES = ["ja", "en", "zh-CN", "zh-TW", "ko"];
export const DEFAULT_LOCALE = "ja";

const MESSAGES = {
  ja,
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ko,
};

const LOCALE_LABELS = {
  ja: "日本語",
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ko: "한국어",
};

let currentLocale = DEFAULT_LOCALE;

export function normalizeLocale(locale) {
  if (LOCALES.includes(locale)) return locale;
  return DEFAULT_LOCALE;
}

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  currentLocale = normalizeLocale(locale);
  return currentLocale;
}

export function t(key) {
  return (
    MESSAGES[currentLocale]?.[key] ?? MESSAGES[DEFAULT_LOCALE]?.[key] ?? key
  );
}

export function getDefaultPrompt(locale = currentLocale) {
  const code = normalizeLocale(locale);
  return MESSAGES[code].defaultPrompt;
}

export function isDefaultPrompt(value) {
  const text = (value || "").trim();
  if (!text) return true;
  return LOCALES.some((code) => MESSAGES[code].defaultPrompt === text);
}

export function getLocaleOptions() {
  return LOCALES.map((code) => ({
    value: code,
    label: LOCALE_LABELS[code],
  }));
}

export function applyI18n(root = document) {
  document.documentElement.lang = currentLocale;

  for (const el of root.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  }

  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  }

  for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
    const key = el.getAttribute("data-i18n-aria-label");
    if (key) el.setAttribute("aria-label", t(key));
  }

  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    const key = el.getAttribute("data-i18n-title");
    if (key) el.setAttribute("title", t(key));
  }
}
