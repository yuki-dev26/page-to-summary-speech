import {
  DEFAULT_SUMMARY_MODEL,
  normalizeSummaryModel,
  summarizePage,
  synthesizeSpeech,
} from "../lib/openai.js";
import {
  DEFAULT_LOCALE,
  applyI18n,
  getDefaultPrompt,
  isDefaultPrompt,
  setLocale,
  t,
} from "../lib/i18n.js";

const STORAGE_KEYS = {
  locale: "uiLocale",
  theme: "uiTheme",
  apiKey: "openaiApiKey",
  model: "summaryModel",
  voice: "ttsVoice",
  prompt: "summaryPrompt",
  speed: "playbackSpeed",
};

const THEME_KEY_LOCAL = "ptsTheme";

const els = {
  locale: document.getElementById("locale"),
  themeLight: document.getElementById("themeLight"),
  themeDark: document.getElementById("themeDark"),
  apiKey: document.getElementById("apiKey"),
  toggleKey: document.getElementById("toggleKey"),
  model: document.getElementById("model"),
  voice: document.getElementById("voice"),
  previewVoice: document.getElementById("previewVoice"),
  prompt: document.getElementById("prompt"),
  resetPrompt: document.getElementById("resetPrompt"),
  run: document.getElementById("run"),
  progressPanel: document.getElementById("progressPanel"),
  steps: document.getElementById("steps"),
  status: document.getElementById("status"),
  statusText: document.getElementById("statusText"),
  summary: document.getElementById("summary"),
  playerBadge: document.getElementById("playerBadge"),
  playerControls: document.getElementById("playerControls"),
  playPause: document.getElementById("playPause"),
  seek: document.getElementById("seek"),
  currentTime: document.getElementById("currentTime"),
  duration: document.getElementById("duration"),
  speed: document.getElementById("speed"),
};

let audio = null;
let objectUrl = null;
let currentSummary = "";
let running = false;
let seeking = false;
let badgeKey = "badgeIdle";
let badgeKind = "";
let statusState = { key: "", message: "", error: false, done: false };
let previewAudio = null;
let previewObjectUrl = null;
let previewing = false;
const previewCache = new Map();

function stopVoicePreview() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.removeAttribute("src");
    previewAudio.load();
    previewAudio = null;
  }
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
}

function setPreviewBusy(busy) {
  previewing = busy;
  els.previewVoice.classList.toggle("is-busy", busy);
  els.previewVoice.disabled = busy;
  const label = t(busy ? "previewVoiceBusy" : "previewVoice");
  els.previewVoice.setAttribute("aria-label", label);
  els.previewVoice.title = label;
}

async function previewSelectedVoice() {
  if (previewing) return;

  let apiKey;
  try {
    apiKey = requireApiKey();
  } catch {
    return;
  }

  const voice = els.voice.value;
  const sample = t("voicePreviewSample");
  const cacheKey = `${els.locale.value}:${voice}:${sample}`;

  setPreviewBusy(true);
  stopVoicePreview();

  try {
    let blob = previewCache.get(cacheKey);
    if (!blob) {
      blob = await synthesizeSpeech(apiKey, sample, voice);
      previewCache.set(cacheKey, blob);
    }
    previewObjectUrl = URL.createObjectURL(blob);
    previewAudio = new Audio(previewObjectUrl);
    previewAudio.addEventListener("ended", () => {
      stopVoicePreview();
    });
    await previewAudio.play();
  } catch (error) {
    console.error(error);
    setStatus(error?.message || t("errGeneric"), { error: true, raw: true });
  } finally {
    setPreviewBusy(false);
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const customSelectBySelect = new Map();
const customSelectByWrap = new Map();

function getSelectedOptionLabel(select) {
  const option = select.selectedOptions[0];
  return option ? option.textContent.trim() : "";
}

function syncCustomSelect(select) {
  const controller = customSelectBySelect.get(select);
  if (!controller) return;
  controller.valueEl.textContent = getSelectedOptionLabel(select);
  for (const btn of controller.menu.querySelectorAll(".custom-select-option")) {
    btn.setAttribute(
      "aria-selected",
      String(btn.dataset.value === select.value),
    );
  }
}

function positionCustomSelectMenu(wrap) {
  const controller = customSelectByWrap.get(wrap);
  const trigger = controller?.trigger;
  const menu = controller?.menu;
  if (!trigger || !menu || menu.hidden) return;

  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const maxHeight = Math.min(220, window.innerHeight - 24);
  const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
  const spaceAbove = rect.top - gap - 12;
  const openUp = spaceBelow < 120 && spaceAbove > spaceBelow;
  const height = Math.min(maxHeight, openUp ? spaceAbove : spaceBelow);

  menu.style.width = `${rect.width}px`;
  menu.style.left = `${rect.left}px`;
  menu.style.maxHeight = `${Math.max(96, height)}px`;

  if (openUp) {
    menu.style.top = "auto";
    menu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
  } else {
    menu.style.bottom = "auto";
    menu.style.top = `${rect.bottom + gap}px`;
  }
}

function closeCustomSelect(wrap) {
  const controller = customSelectByWrap.get(wrap);
  if (!controller) return;
  const { menu, trigger } = controller;
  menu.hidden = true;
  wrap.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
  menu.style.top = "";
  menu.style.bottom = "";
  menu.style.left = "";
  menu.style.width = "";
  menu.style.maxHeight = "";
}

function closeAllCustomSelects(exceptWrap = null) {
  for (const wrap of document.querySelectorAll(
    "[data-custom-select].is-open",
  )) {
    if (wrap !== exceptWrap) closeCustomSelect(wrap);
  }
}

function enhanceCustomSelect(select) {
  const wrap = select.closest("[data-custom-select]");
  if (!wrap || customSelectBySelect.has(select)) return;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const valueEl = document.createElement("span");
  valueEl.className = "custom-select-value";
  valueEl.textContent = getSelectedOptionLabel(select);
  trigger.append(valueEl);

  const menu = document.createElement("ul");
  menu.className = "custom-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  for (const option of select.options) {
    const item = document.createElement("li");
    item.setAttribute("role", "presentation");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "custom-select-option";
    btn.setAttribute("role", "option");
    btn.dataset.value = option.value;
    btn.textContent = option.textContent.trim();
    btn.setAttribute("aria-selected", String(option.value === select.value));
    btn.addEventListener("click", () => {
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      syncCustomSelect(select);
      closeCustomSelect(wrap);
      trigger.focus();
    });
    item.append(btn);
    menu.append(item);
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    const willOpen = menu.hidden;
    closeAllCustomSelects(wrap);
    if (willOpen) {
      menu.hidden = false;
      wrap.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      positionCustomSelectMenu(wrap);
      const selected = menu.querySelector('[aria-selected="true"]');
      selected?.focus();
    } else {
      closeCustomSelect(wrap);
    }
  });

  trigger.addEventListener("keydown", (event) => {
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      if (menu.hidden) trigger.click();
    }
  });

  menu.addEventListener("keydown", (event) => {
    const options = [...menu.querySelectorAll(".custom-select-option")];
    const index = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeCustomSelect(wrap);
      trigger.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options[Math.min(index + 1, options.length - 1)]?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      options[Math.max(index - 1, 0)]?.focus();
    }
  });

  wrap.insertBefore(trigger, select);
  document.body.append(menu);

  const controller = { wrap, trigger, valueEl, menu };
  customSelectBySelect.set(select, controller);
  customSelectByWrap.set(wrap, controller);

  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  );
  if (descriptor?.set && descriptor?.get) {
    Object.defineProperty(select, "value", {
      configurable: true,
      enumerable: true,
      get() {
        return descriptor.get.call(this);
      },
      set(next) {
        descriptor.set.call(this, next);
        syncCustomSelect(this);
      },
    });
  }
}

function initCustomSelects() {
  for (const select of document.querySelectorAll(
    "[data-custom-select] > select",
  )) {
    enhanceCustomSelect(select);
  }

  document.addEventListener("pointerdown", (event) => {
    const wrap = event.target.closest("[data-custom-select]");
    const menu = event.target.closest(".custom-select-menu");
    if (!wrap && !menu) closeAllCustomSelects();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllCustomSelects();
  });

  window.addEventListener("resize", () => {
    for (const wrap of document.querySelectorAll(
      "[data-custom-select].is-open",
    )) {
      positionCustomSelectMenu(wrap);
    }
  });

  document.addEventListener(
    "scroll",
    () => {
      for (const wrap of document.querySelectorAll(
        "[data-custom-select].is-open",
      )) {
        positionCustomSelectMenu(wrap);
      }
    },
    true,
  );
}

function showProgress() {
  els.progressPanel.hidden = false;
}

function setStatus(
  messageOrKey,
  { error = false, done = false, raw = false } = {},
) {
  showProgress();
  const message = raw || !messageOrKey ? messageOrKey : t(messageOrKey);
  statusState = {
    key: raw ? "" : messageOrKey || "",
    message: message || "",
    error,
    done,
  };
  els.status.hidden = !message;
  els.statusText.textContent = message || "";
  els.status.classList.toggle("error", error);
  els.status.classList.toggle("done", done && !error);
  if (message) {
    els.status.style.animation = "none";
    void els.status.offsetWidth;
    els.status.style.animation = "";
  }
}

const STEP_DONE_KEYS = {
  extract: "stepExtractDone",
  summarize: "stepSummarizeDone",
  speech: "stepSpeechDone",
};

function updateStepLabel(step) {
  const label = step.querySelector(".step-label");
  if (!label) return;
  if (step.classList.contains("done")) {
    const doneKey = STEP_DONE_KEYS[step.dataset.step];
    label.textContent = t(doneKey || "statusDone");
    return;
  }
  const key = label.getAttribute("data-i18n");
  if (key) label.textContent = t(key);
}

function refreshStepLabels() {
  for (const step of els.steps.querySelectorAll(".step")) {
    updateStepLabel(step);
  }
}

function resetSteps() {
  for (const step of els.steps.querySelectorAll(".step")) {
    step.classList.remove("active", "done", "error");
    updateStepLabel(step);
  }
}

function setStep(stepId, state) {
  const step = els.steps.querySelector(`[data-step="${stepId}"]`);
  if (!step) return;
  step.classList.remove("active", "done", "error");
  if (state) step.classList.add(state);
  updateStepLabel(step);
}

function setSummary(text) {
  currentSummary = text || "";
  if (!text) {
    els.summary.textContent = t("summaryEmpty");
    els.summary.classList.add("empty");
    return;
  }
  els.summary.textContent = text;
  els.summary.classList.remove("empty");
}

function setPlayerBadge(key, kind = "") {
  badgeKey = key;
  badgeKind = kind;
  els.playerBadge.textContent = t(key);
  els.playerBadge.className = "player-badge" + (kind ? ` ${kind}` : "");
}

function setPlayIcon(playing) {
  els.playPause.dataset.icon = playing ? "pause" : "play";
  els.playPause.textContent = playing ? "❚❚" : "▶";
  els.playPause.setAttribute("aria-label", t(playing ? "pause" : "play"));
}

function clearAudio({ keepBadge = false } = {}) {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  setPlayIcon(false);
  els.playPause.disabled = true;
  els.seek.value = "0";
  els.seek.max = "0";
  els.seek.disabled = true;
  els.currentTime.textContent = "0:00";
  els.duration.textContent = "0:00";
  els.playerControls.setAttribute("aria-disabled", "true");
  if (!keepBadge) {
    setPlayerBadge(currentSummary ? "badgeReady" : "badgeIdle");
  }
}

function bindAudioEvents(instance) {
  const isActive = () => audio === instance;

  instance.addEventListener("loadedmetadata", () => {
    if (!isActive()) return;
    els.seek.max = String(instance.duration || 0);
    els.duration.textContent = formatTime(instance.duration);
  });

  instance.addEventListener("timeupdate", () => {
    if (!isActive() || seeking) return;
    els.seek.value = String(instance.currentTime || 0);
    els.currentTime.textContent = formatTime(instance.currentTime);
  });

  instance.addEventListener("play", () => {
    if (!isActive()) return;
    setPlayIcon(true);
    setPlayerBadge("badgePlaying", "ready");
  });

  instance.addEventListener("pause", () => {
    if (!isActive()) return;
    setPlayIcon(false);
    if (!instance.ended) setPlayerBadge("badgePaused", "paused");
  });

  instance.addEventListener("ended", () => {
    if (!isActive()) return;
    setPlayIcon(false);
    els.seek.value = els.seek.max;
    els.currentTime.textContent = els.duration.textContent;
    setPlayerBadge("badgeEnded", "ready");
  });

  instance.addEventListener("error", () => {
    if (!isActive()) return;
    setPlayerBadge("badgePlaybackError", "error");
    setStatus("errPlayback", { error: true });
  });
}

function enablePlayer(blob) {
  clearAudio({ keepBadge: true });
  objectUrl = URL.createObjectURL(blob);
  audio = new Audio(objectUrl);
  audio.playbackRate = Number(els.speed.value) || 1;
  bindAudioEvents(audio);

  els.playPause.disabled = false;
  els.seek.disabled = false;
  els.playerControls.setAttribute("aria-disabled", "false");
  setPlayerBadge("badgePlayable", "ready");
}

function autosizePrompt() {
  const el = els.prompt;
  if (CSS.supports?.("field-sizing", "content")) {
    el.style.removeProperty("height");
    return;
  }
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}

function scheduleAutosizePrompt() {
  requestAnimationFrame(() => {
    autosizePrompt();
    requestAnimationFrame(autosizePrompt);
  });
  if (document.fonts?.ready) {
    void document.fonts.ready.then(autosizePrompt);
  }
}

let saveTimer = null;

function getTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY_LOCAL, next);
  syncThemeToggle();
}

function syncThemeToggle() {
  const dark = getTheme() === "dark";
  els.themeLight?.setAttribute("aria-pressed", String(!dark));
  els.themeDark?.setAttribute("aria-pressed", String(dark));
}

function collectSettings() {
  return {
    [STORAGE_KEYS.locale]: els.locale.value || DEFAULT_LOCALE,
    [STORAGE_KEYS.theme]: getTheme(),
    [STORAGE_KEYS.apiKey]: els.apiKey.value.trim(),
    [STORAGE_KEYS.model]: normalizeSummaryModel(els.model.value),
    [STORAGE_KEYS.voice]: els.voice.value,
    [STORAGE_KEYS.prompt]: els.prompt.value.trim() || getDefaultPrompt(),
    [STORAGE_KEYS.speed]: els.speed.value,
  };
}

function refreshDynamicI18n() {
  applyI18n();
  syncThemeToggle();
  refreshStepLabels();
  setPlayerBadge(badgeKey, badgeKind);
  if (!currentSummary) {
    els.summary.textContent = t("summaryEmpty");
    els.summary.classList.add("empty");
  }
  if (statusState.key) {
    setStatus(statusState.key, {
      error: statusState.error,
      done: statusState.done,
    });
  } else if (statusState.message) {
    setStatus(statusState.message, {
      error: statusState.error,
      done: statusState.done,
      raw: true,
    });
  }
  const keyVisible = els.apiKey.type === "text";
  els.toggleKey.setAttribute(
    "aria-label",
    t(keyVisible ? "hideApiKey" : "showApiKey"),
  );
  els.toggleKey.title = t(keyVisible ? "hide" : "show");
  if (audio) {
    els.playPause.setAttribute(
      "aria-label",
      t(audio.paused ? "play" : "pause"),
    );
  } else {
    els.playPause.setAttribute("aria-label", t("play"));
  }
  const previewLabel = t(previewing ? "previewVoiceBusy" : "previewVoice");
  els.previewVoice.setAttribute("aria-label", previewLabel);
  els.previewVoice.title = previewLabel;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.locale,
    STORAGE_KEYS.theme,
    STORAGE_KEYS.apiKey,
    STORAGE_KEYS.model,
    STORAGE_KEYS.voice,
    STORAGE_KEYS.prompt,
    STORAGE_KEYS.speed,
  ]);

  const locale = setLocale(stored[STORAGE_KEYS.locale] || DEFAULT_LOCALE);
  els.locale.value = locale;
  applyTheme(
    stored[STORAGE_KEYS.theme] || localStorage.getItem(THEME_KEY_LOCAL),
  );

  if (typeof stored[STORAGE_KEYS.apiKey] === "string") {
    els.apiKey.value = stored[STORAGE_KEYS.apiKey];
  }
  els.model.value = normalizeSummaryModel(
    stored[STORAGE_KEYS.model] || DEFAULT_SUMMARY_MODEL,
  );
  if (stored[STORAGE_KEYS.voice]) {
    els.voice.value = stored[STORAGE_KEYS.voice];
  }
  if (stored[STORAGE_KEYS.speed] != null && stored[STORAGE_KEYS.speed] !== "") {
    els.speed.value = String(stored[STORAGE_KEYS.speed]);
  }

  const storedPrompt = stored[STORAGE_KEYS.prompt];
  els.prompt.value =
    typeof storedPrompt === "string" && storedPrompt.trim()
      ? storedPrompt
      : getDefaultPrompt();

  refreshDynamicI18n();
  scheduleAutosizePrompt();
}

async function saveSettings() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await chrome.storage.local.set(collectSettings());
}

function scheduleSaveSettings() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveSettings();
  }, 250);
}

async function flushSettings() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await saveSettings();
}

async function onLocaleChange() {
  const previousPrompt = els.prompt.value.trim();
  const shouldReplacePrompt = isDefaultPrompt(previousPrompt);
  const locale = setLocale(els.locale.value);
  els.locale.value = locale;

  if (shouldReplacePrompt) {
    els.prompt.value = getDefaultPrompt();
    autosizePrompt();
  }

  refreshDynamicI18n();
  await flushSettings();
}

function requireApiKey() {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    setStatus("errMissingApiKey", { error: true });
    throw new Error("missing api key");
  }
  return apiKey;
}

function isRestrictedUrl(url) {
  return !url || !/^https?:/i.test(url);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  let tab = tabs[0];

  if (!tab?.id || isRestrictedUrl(tab.url)) {
    const current = await chrome.windows.getCurrent({ populate: true });
    tab = current.tabs?.find((t) => t.active) || tab;
  }

  if (!tab?.id) {
    throw new Error(t("errNoTab"));
  }

  if (isRestrictedUrl(tab.url)) {
    throw new Error(t("errRestrictedUrl"));
  }

  return tab;
}

async function extractFromTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/extract.js"],
  });

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__pageToSummarySpeechExtract?.(),
  });

  if (!result?.content || result.content.length < 40) {
    throw new Error(t("errExtract"));
  }

  return result;
}

async function run() {
  if (running) return;

  let apiKey;
  try {
    apiKey = requireApiKey();
  } catch {
    return;
  }

  running = true;
  els.run.disabled = true;
  clearAudio();
  setSummary("");
  resetSteps();
  setPlayerBadge("badgeBusy", "busy");

  try {
    await saveSettings();
    showProgress();
    setStatus("");

    setStep("extract", "active");
    const tab = await getActiveTab();
    const page = await extractFromTab(tab.id);

    setStep("extract", "done");
    setStep("summarize", "active");
    setPlayerBadge("badgeSummarizing", "busy");

    const summary = await summarizePage(
      apiKey,
      page,
      els.prompt.value,
      els.model.value,
    );
    setSummary(summary);

    setStep("summarize", "done");
    setStep("speech", "active");
    setPlayerBadge("badgeSpeaking", "busy");

    const blob = await synthesizeSpeech(apiKey, summary, els.voice.value);
    setStep("speech", "done");
    enablePlayer(blob);
    setStatus("");
    await audio.play();
  } catch (error) {
    console.error(error);
    const active = els.steps.querySelector(".step.active");
    if (active) {
      active.classList.remove("active");
      active.classList.add("error");
    }
    setStatus(error?.message || t("errGeneric"), { error: true, raw: true });
    setPlayerBadge("badgeError", "error");
  } finally {
    running = false;
    els.run.disabled = false;
  }
}

async function togglePlayPause() {
  if (!audio) return;
  if (audio.paused) {
    try {
      await audio.play();
    } catch (error) {
      console.error(error);
      setStatus("errPlayStart", { error: true });
    }
  } else {
    audio.pause();
  }
}

els.locale.addEventListener("change", () => void onLocaleChange());

els.themeLight.addEventListener("click", () => {
  applyTheme("light");
  void flushSettings();
});
els.themeDark.addEventListener("click", () => {
  applyTheme("dark");
  void flushSettings();
});

els.toggleKey.addEventListener("click", () => {
  const nextVisible = els.apiKey.type !== "text";
  els.apiKey.type = nextVisible ? "text" : "password";
  els.toggleKey.setAttribute("aria-pressed", String(nextVisible));
  els.toggleKey.setAttribute(
    "aria-label",
    t(nextVisible ? "hideApiKey" : "showApiKey"),
  );
  els.toggleKey.title = t(nextVisible ? "hide" : "show");
});

els.resetPrompt.addEventListener("click", async () => {
  els.prompt.value = getDefaultPrompt();
  autosizePrompt();
  await flushSettings();
});

els.apiKey.addEventListener("input", scheduleSaveSettings);
els.apiKey.addEventListener("change", () => void flushSettings());
els.model.addEventListener("change", () => void flushSettings());
els.voice.addEventListener("change", () => {
  stopVoicePreview();
  void flushSettings();
});
els.previewVoice.addEventListener("click", () => void previewSelectedVoice());
els.prompt.addEventListener("input", () => {
  autosizePrompt();
  scheduleSaveSettings();
});
els.prompt.addEventListener("change", () => void flushSettings());

els.run.addEventListener("click", run);
els.playPause.addEventListener("click", togglePlayPause);

els.seek.addEventListener("pointerdown", () => {
  seeking = true;
});
els.seek.addEventListener("pointerup", () => {
  seeking = false;
});
els.seek.addEventListener("input", () => {
  if (!audio) return;
  const time = Number(els.seek.value);
  audio.currentTime = time;
  els.currentTime.textContent = formatTime(time);
});

els.speed.addEventListener("change", async () => {
  if (audio) audio.playbackRate = Number(els.speed.value) || 1;
  await flushSettings();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    void flushSettings();
  }
});
window.addEventListener("pagehide", () => {
  void flushSettings();
});

clearAudio();
initCustomSelects();
void loadSettings();

if (typeof ResizeObserver !== "undefined") {
  let lastPromptWidth = 0;
  const promptResizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect?.width ?? 0;
    if (Math.abs(width - lastPromptWidth) < 0.5) return;
    lastPromptWidth = width;
    autosizePrompt();
  });
  promptResizeObserver.observe(els.prompt);
}
