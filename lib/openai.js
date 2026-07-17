const OPENAI_BASE = "https://api.openai.com/v1";

/** コスト重視の要約向け。公式推奨の Responses API + GPT-5.6 Luna */
const SUMMARY_MODEL = "gpt-5.6-luna";

/** 現行の Speech API 推奨モデル（エイリアスは最新スナップショットを指す） */
const TTS_MODEL = "gpt-4o-mini-tts";

export const DEFAULT_SUMMARY_PROMPT =
  "あなたは優秀な編集者です。与えられたWebページ本文を、音声で聞きやすい日本語の要約にしてください。" +
  "箇条書きではなく、自然な読み上げ向けの文章にしてください。" +
  "重要な論点を落さず、冗長な前置きは避けてください。要約は300〜500文字程度を目安にしてください。";

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
    throw new Error(`OpenAI API エラー (${response.status}): ${detail}`);
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

export async function summarizePage(
  apiKey,
  page,
  systemPrompt = DEFAULT_SUMMARY_PROMPT,
) {
  const metaLines = [
    `タイトル: ${page.title || "(なし)"}`,
    `URL: ${page.url || "(なし)"}`,
    page.author ? `著者: ${page.author}` : null,
    page.publishedDate ? `公開日: ${page.publishedDate}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const truncated = page.content.slice(0, 12000);
  const prompt = systemPrompt.trim() || DEFAULT_SUMMARY_PROMPT;

  const data = await openaiRequest(apiKey, "/responses", {
    model: SUMMARY_MODEL,
    instructions: prompt,
    input: `${metaLines}\n\n本文:\n${truncated}`,
    reasoning: { effort: "low" },
    store: false,
  });

  const summary = getOutputText(data);
  if (!summary) throw new Error("要約の生成に失敗しました。");
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
      instructions:
        "明瞭で落ち着いた日本語のナレーションとして読み上げてください。",
      response_format: "mp3",
    },
    { binary: true },
  );

  return new Blob([audio], { type: "audio/mpeg" });
}
