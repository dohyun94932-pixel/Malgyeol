// AI 호출 부분. 다른 AI로 바꿀 때는 이 파일만 바꾼다.
// 지금은 Google Gemini API의 generateContent(REST)를 Node 내장 fetch로 부른다. (외부 패키지 없음)
//   문서: https://ai.google.dev/api/generate-content · 구조화 출력: https://ai.google.dev/gemini-api/docs/structured-output
// 키는 서버 환경변수 GEMINI_API_KEY에서만 읽고, URL이 아니라 요청 헤더(x-goog-api-key)로 보낸다.
// 키·사용자 입력·AI 응답은 로그에 남기지 않는다.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// 기본 모델: 공식 문서(ai.google.dev, 2026-10 확인)의 안정판 Flash-Lite 중 가장 새 모델. GEMINI_MODEL로 바꿀 수 있다.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
// 응답 속도를 위해 '생각(thinking)'을 최소로. Gemini 3.x Flash-Lite는 완전히 끌 수 없고 "minimal"이 가장 낮다.
// 모델이 이 값을 받지 않으면 GEMINI_THINKING=off 로 이 설정을 빼고 부를 수 있다.
const DEFAULT_THINKING = "minimal";

// 오류 종류: no_key · timeout · network · rate_limit(429) · http · blocked(안전 필터) · empty(빈 응답) · bad_json
class LlmError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status || 0;
  }
}

// Gemini의 응답 스키마 형식으로 만들 때 쓰는 도우미
const S = {
  string: (nullable) => ({ type: "STRING", ...(nullable ? { nullable: true } : {}) }),
  object: (properties, required) => ({ type: "OBJECT", properties, required: required || Object.keys(properties) }),
  array: (items) => ({ type: "ARRAY", items }),
  enumString: (values) => ({ type: "STRING", enum: values }),
};

// system: 시스템 지시문 · user: 사용자 메시지(문자열) · schema: 응답 JSON 스키마 · timeoutMs: 시간 제한
// 반환: { json, usage }  · 실패하면 LlmError
async function callJson({ system, user, schema, timeoutMs }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmError("no_key");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const thinking = process.env.GEMINI_THINKING || DEFAULT_THINKING;

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: schema,
    temperature: 0.4,
  };
  if (thinking !== "off") generationConfig.thinkingConfig = { thinkingLevel: thinking };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new LlmError(error && error.name === "AbortError" ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) throw new LlmError("rate_limit", 429);
  if (!response.ok) throw new LlmError("http", response.status);

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new LlmError("bad_json");
  }
  // 안전 필터로 막혔거나 빈 응답이면 오류로 처리한다 (부르는 쪽에서 가짜 AI로 대체)
  if (data.promptFeedback && data.promptFeedback.blockReason) throw new LlmError("blocked");
  const candidate = data.candidates && data.candidates[0];
  if (!candidate) throw new LlmError("empty");
  if (["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(candidate.finishReason)) {
    throw new LlmError("blocked");
  }
  const text = ((candidate.content && candidate.content.parts) || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) throw new LlmError("empty");
  try {
    return { json: JSON.parse(text), usage: data.usageMetadata || null };
  } catch (error) {
    throw new LlmError("bad_json");
  }
}

module.exports = { callJson, LlmError, S, DEFAULT_MODEL };
