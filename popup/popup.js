import { summarizePage, synthesizeSpeech } from "../lib/openai.js";
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
  apiKey: "openaiApiKey",
  voice: "ttsVoice",
  prompt: "summaryPrompt",
  speed: "playbackSpeed",
};

const els = {
  locale: document.getElementById("locale"),
  apiKey: document.getElementById("apiKey"),
  toggleKey: document.getElementById("toggleKey"),
  voice: document.getElementById("voice"),
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

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
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

function resetSteps() {
  for (const step of els.steps.querySelectorAll(".step")) {
    step.classList.remove("active", "done", "error");
  }
}

function setStep(stepId, state) {
  const step = els.steps.querySelector(`[data-step="${stepId}"]`);
  if (!step) return;
  step.classList.remove("active", "done", "error");
  if (state) step.classList.add(state);
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
  els.playPause.textContent = "▶";
  els.playPause.setAttribute("aria-label", t("play"));
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

function bindAudioEvents() {
  audio.addEventListener("loadedmetadata", () => {
    els.seek.max = String(audio.duration || 0);
    els.duration.textContent = formatTime(audio.duration);
  });

  audio.addEventListener("timeupdate", () => {
    if (seeking) return;
    els.seek.value = String(audio.currentTime || 0);
    els.currentTime.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener("play", () => {
    els.playPause.textContent = "❚❚";
    els.playPause.setAttribute("aria-label", t("pause"));
    setPlayerBadge("badgePlaying", "ready");
  });

  audio.addEventListener("pause", () => {
    els.playPause.textContent = "▶";
    els.playPause.setAttribute("aria-label", t("play"));
    if (!audio.ended) setPlayerBadge("badgePaused", "ready");
  });

  audio.addEventListener("ended", () => {
    els.playPause.textContent = "▶";
    els.playPause.setAttribute("aria-label", t("play"));
    els.seek.value = els.seek.max;
    els.currentTime.textContent = els.duration.textContent;
    setPlayerBadge("badgeEnded", "ready");
  });

  audio.addEventListener("error", () => {
    setPlayerBadge("badgePlaybackError", "error");
    setStatus("errPlayback", { error: true });
  });
}

function enablePlayer(blob) {
  clearAudio({ keepBadge: true });
  objectUrl = URL.createObjectURL(blob);
  audio = new Audio(objectUrl);
  audio.playbackRate = Number(els.speed.value) || 1;
  bindAudioEvents();

  els.playPause.disabled = false;
  els.seek.disabled = false;
  els.playerControls.setAttribute("aria-disabled", "false");
  setPlayerBadge("badgePlayable", "ready");
}

function autosizePrompt() {
  const el = els.prompt;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

let saveTimer = null;

function collectSettings() {
  return {
    [STORAGE_KEYS.locale]: els.locale.value || DEFAULT_LOCALE,
    [STORAGE_KEYS.apiKey]: els.apiKey.value.trim(),
    [STORAGE_KEYS.voice]: els.voice.value,
    [STORAGE_KEYS.prompt]: els.prompt.value.trim() || getDefaultPrompt(),
    [STORAGE_KEYS.speed]: els.speed.value,
  };
}

function refreshDynamicI18n() {
  applyI18n();
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
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.locale,
    STORAGE_KEYS.apiKey,
    STORAGE_KEYS.voice,
    STORAGE_KEYS.prompt,
    STORAGE_KEYS.speed,
  ]);

  const locale = setLocale(stored[STORAGE_KEYS.locale] || DEFAULT_LOCALE);
  els.locale.value = locale;

  if (typeof stored[STORAGE_KEYS.apiKey] === "string") {
    els.apiKey.value = stored[STORAGE_KEYS.apiKey];
  }
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
  autosizePrompt();
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

    const summary = await summarizePage(apiKey, page, els.prompt.value);
    setSummary(summary);

    setStep("summarize", "done");
    setStep("speech", "active");
    setPlayerBadge("badgeSpeaking", "busy");

    const blob = await synthesizeSpeech(apiKey, summary, els.voice.value);
    setStep("speech", "done");
    enablePlayer(blob);
    setStatus("statusDone", { done: true });
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
els.voice.addEventListener("change", () => void flushSettings());
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
void loadSettings();
