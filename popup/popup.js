import {
  DEFAULT_SUMMARY_PROMPT,
  summarizePage,
  synthesizeSpeech,
} from "../lib/openai.js";

const STORAGE_KEYS = {
  apiKey: "openaiApiKey",
  voice: "ttsVoice",
  prompt: "summaryPrompt",
  speed: "playbackSpeed",
};

const els = {
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

function setStatus(message, { error = false, done = false } = {}) {
  showProgress();
  els.status.hidden = !message;
  els.statusText.textContent = message;
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
    els.summary.textContent = "まだありません";
    els.summary.classList.add("empty");
    return;
  }
  els.summary.textContent = text;
  els.summary.classList.remove("empty");
}

function setPlayerBadge(text, kind = "") {
  els.playerBadge.textContent = text;
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
  els.playPause.setAttribute("aria-label", "再生");
  els.playPause.disabled = true;
  els.seek.value = "0";
  els.seek.max = "0";
  els.seek.disabled = true;
  els.speed.disabled = true;
  els.currentTime.textContent = "0:00";
  els.duration.textContent = "0:00";
  els.playerControls.setAttribute("aria-disabled", "true");
  if (!keepBadge) {
    setPlayerBadge(currentSummary ? "準備中" : "待機中");
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
    els.playPause.setAttribute("aria-label", "一時停止");
    setPlayerBadge("再生中", "ready");
  });

  audio.addEventListener("pause", () => {
    els.playPause.textContent = "▶";
    els.playPause.setAttribute("aria-label", "再生");
    if (!audio.ended) setPlayerBadge("一時停止", "ready");
  });

  audio.addEventListener("ended", () => {
    els.playPause.textContent = "▶";
    els.playPause.setAttribute("aria-label", "再生");
    els.seek.value = els.seek.max;
    els.currentTime.textContent = els.duration.textContent;
    setPlayerBadge("再生完了", "ready");
  });

  audio.addEventListener("error", () => {
    setPlayerBadge("再生エラー", "error");
    setStatus("音声の再生に失敗しました。", { error: true });
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
  els.speed.disabled = false;
  els.playerControls.setAttribute("aria-disabled", "false");
  setPlayerBadge("再生できます", "ready");
}

function autosizePrompt() {
  const el = els.prompt;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.apiKey,
    STORAGE_KEYS.voice,
    STORAGE_KEYS.prompt,
    STORAGE_KEYS.speed,
  ]);
  if (stored[STORAGE_KEYS.apiKey]) {
    els.apiKey.value = stored[STORAGE_KEYS.apiKey];
  }
  if (stored[STORAGE_KEYS.voice]) {
    els.voice.value = stored[STORAGE_KEYS.voice];
  }
  if (stored[STORAGE_KEYS.speed]) {
    els.speed.value = stored[STORAGE_KEYS.speed];
  }
  els.prompt.value = stored[STORAGE_KEYS.prompt] || DEFAULT_SUMMARY_PROMPT;
  autosizePrompt();
}

async function saveSettings() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.apiKey]: els.apiKey.value.trim(),
    [STORAGE_KEYS.voice]: els.voice.value,
    [STORAGE_KEYS.prompt]: els.prompt.value.trim() || DEFAULT_SUMMARY_PROMPT,
    [STORAGE_KEYS.speed]: els.speed.value,
  });
}

function requireApiKey() {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    setStatus("OpenAI API キーを入力してください。", { error: true });
    throw new Error("missing api key");
  }
  return apiKey;
}

function isRestrictedUrl(url) {
  return !url || !/^https?:/i.test(url);
}

async function getActiveTab() {
  // サイドパネルからは lastFocusedWindow の方が安定する
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
    throw new Error("アクティブなタブが見つかりません。");
  }

  if (isRestrictedUrl(tab.url)) {
    throw new Error(
      "いま表示中のタブはブラウザの内部ページです（拡張機能管理画面・新しいタブなど）。" +
        "記事などの http/https のWebページを前面にしてから、もう一度実行してください。",
    );
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
    throw new Error(
      "本文を十分に抽出できませんでした。別のページで試してください。",
    );
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
  setPlayerBadge("生成中", "busy");

  try {
    await saveSettings();
    showProgress();
    setStatus("");

    setStep("extract", "active");
    const tab = await getActiveTab();
    const page = await extractFromTab(tab.id);

    setStep("extract", "done");
    setStep("summarize", "active");
    setPlayerBadge("回答生成中", "busy");

    const summary = await summarizePage(apiKey, page, els.prompt.value);
    setSummary(summary);

    setStep("summarize", "done");
    setStep("speech", "active");
    setPlayerBadge("音声生成中", "busy");

    const blob = await synthesizeSpeech(apiKey, summary, els.voice.value);
    setStep("speech", "done");
    enablePlayer(blob);
    setStatus("完了", { done: true });
    await audio.play();
  } catch (error) {
    console.error(error);
    const active = els.steps.querySelector(".step.active");
    if (active) {
      active.classList.remove("active");
      active.classList.add("error");
    }
    setStatus(error?.message || "処理に失敗しました。", { error: true });
    setPlayerBadge("エラー", "error");
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
      setStatus("再生を開始できませんでした。", { error: true });
    }
  } else {
    audio.pause();
  }
}

els.toggleKey.addEventListener("click", () => {
  const visible = els.apiKey.type === "text";
  els.apiKey.type = visible ? "password" : "text";
  els.toggleKey.textContent = visible ? "表示" : "隠す";
});

els.resetPrompt.addEventListener("click", async () => {
  els.prompt.value = DEFAULT_SUMMARY_PROMPT;
  autosizePrompt();
  await saveSettings();
});

els.apiKey.addEventListener("change", saveSettings);
els.voice.addEventListener("change", saveSettings);
els.prompt.addEventListener("input", autosizePrompt);
els.prompt.addEventListener("change", saveSettings);

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
  await saveSettings();
});

clearAudio();
loadSettings();
