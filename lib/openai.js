import { getDefaultPrompt, t } from "./i18n.js";

const OPENAI_BASE = "https://api.openai.com/v1";

/** コスト重視の要約向け。公式推奨の Responses API + GPT-5.6 Luna */
const SUMMARY_MODEL = "gpt-5.6-luna";

/** 現行の Speech API 推奨モデル（エイリアスは最新スナップショットを指す） */
const TTS_MODEL = "gpt-4o-mini-tts";

async function openaiRequest(apiKey, path, body, { binary = false } = {}) {
  const response = await fetch(`${OPENAI_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const err = await response.json();
      detail = err?.error?.message || JSON.stringify(err);
    } catch {
      detail = await response.text();
    }
    throw new Error(`${t("errOpenAI")} (${response.status}): ${detail}`);
  }

  return binary ? response.arrayBuffer() : response.json();
}

/** Responses API の output 配列からテキストを取り出す（SDK の output_text 相当） */
function getOutputText(response) {
  if (
    typeof response?.output_text === "string" &&
    response.output_text.trim()
  ) {
    return response.output_text.trim();
  }

  const parts = [];
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if (content?.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("").trim();
}

export async function summarizePage(apiKey, page, systemPrompt) {
  const none = t("metaNone");
  const metaLines = [
    `${t("metaTitle")}: ${page.title || none}`,
    `URL: ${page.url || none}`,
    page.author ? `${t("metaAuthor")}: ${page.author}` : null,
    page.publishedDate ? `${t("metaPublished")}: ${page.publishedDate}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const truncated = page.content.slice(0, 12000);
  const prompt = (systemPrompt || "").trim() || getDefaultPrompt();

  const data = await openaiRequest(apiKey, "/responses", {
    model: SUMMARY_MODEL,
    instructions: prompt,
    input: `${metaLines}\n\n${t("metaBody")}:\n${truncated}`,
    reasoning: { effort: "low" },
    store: false,
  });

  const summary = getOutputText(data);
  if (!summary) throw new Error(t("errSummary"));
  return summary;
}

export async function synthesizeSpeech(apiKey, text, voice = "coral") {
  const audio = await openaiRequest(
    apiKey,
    "/audio/speech",
    {
      model: TTS_MODEL,
      voice,
      input: text,
      instructions: t("ttsInstructions"),
      response_format: "mp3",
    },
    { binary: true },
  );

  return new Blob([audio], { type: "audio/mpeg" });
}
