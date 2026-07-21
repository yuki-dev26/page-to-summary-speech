import { getDefaultPrompt, t } from "./i18n.js";

const OPENAI_BASE = "https://api.openai.com/v1";

export const SUMMARY_MODELS = ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4"];

export const DEFAULT_SUMMARY_MODEL = "gpt-5.4-nano";

const TTS_MODEL = "gpt-4o-mini-tts";

export function normalizeSummaryModel(model) {
  return SUMMARY_MODELS.includes(model) ? model : DEFAULT_SUMMARY_MODEL;
}

function messageForOpenAIError(status, code, type, detail) {
  const normalized = String(code || type || "").toLowerCase();
  const detailLower = String(detail || "").toLowerCase();

  if (
    status === 401 ||
    normalized === "invalid_api_key" ||
    detailLower.includes("incorrect api key") ||
    detailLower.includes("invalid api key")
  ) {
    return t("errInvalidApiKey");
  }

  if (status === 403 || normalized === "unsupported_country_region_territory") {
    return t("errForbidden");
  }

  if (
    normalized === "insufficient_quota" ||
    detailLower.includes("exceeded your current quota") ||
    detailLower.includes("insufficient_quota")
  ) {
    return t("errInsufficientQuota");
  }

  if (
    status === 429 ||
    normalized === "rate_limit_exceeded" ||
    detailLower.includes("rate limit")
  ) {
    return t("errRateLimit");
  }

  if (status === 404 || normalized === "model_not_found") {
    return t("errModelNotFound");
  }

  if (status >= 500) {
    return t("errServer");
  }

  if (detail) {
    return `${t("errOpenAI")} (${status}): ${detail}`;
  }
  return `${t("errOpenAI")} (${status})`;
}

async function openaiRequest(apiKey, path, body, { binary = false } = {}) {
  let response;
  try {
    response = await fetch(`${OPENAI_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(t("errNetwork"));
  }

  if (!response.ok) {
    let detail = "";
    let code = "";
    let type = "";
    try {
      const err = await response.json();
      detail = err?.error?.message || JSON.stringify(err);
      code = err?.error?.code || "";
      type = err?.error?.type || "";
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
    }
    throw new Error(messageForOpenAIError(response.status, code, type, detail));
  }

  return binary ? response.arrayBuffer() : response.json();
}

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

export async function summarizePage(
  apiKey,
  page,
  systemPrompt,
  model = DEFAULT_SUMMARY_MODEL,
) {
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
    model: normalizeSummaryModel(model),
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
      response_format: "mp3",
    },
    { binary: true },
  );

  return new Blob([audio], { type: "audio/mpeg" });
}
