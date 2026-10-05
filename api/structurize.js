// AI 호출 1 · 구조화: 카드 정의 + 한 줄 입력 → { fields: {key: 값 또는 null}, followups: {key: 되묻는 질문} }
// 브라우저(ai.js)의 structurize()가 부른다. 실패하면 브라우저가 가짜 AI로 대체한다.
const { callJson, LlmError, S } = require("./_lib/llm");
const { STRUCTURIZE_SYSTEM } = require("./_lib/prompts");
const { send, readBody, text, cardDef, rateLimited, sendError, MAX_TEXT } = require("./_lib/common");

const TIMEOUT_MS = 8000;

module.exports = async function handler(req, res) {
  try {
    const body = readBody(req);
    if (rateLimited(req)) return send(res, 429, { error: "rate_limit" });
    const card = cardDef(body.card);
    const input = text(body.input, { required: true });

    const schema = S.object({
      fields: S.object(Object.fromEntries(card.fields.map((f) => [f.key, S.string(true)]))),
    });
    const user = JSON.stringify({
      card: { name: card.name, fields: card.fields.map((f) => ({ key: f.key, label: f.label })) },
      input,
    });

    const started = Date.now();
    let result;
    try {
      result = await callJson({ system: STRUCTURIZE_SYSTEM, user, schema, timeoutMs: TIMEOUT_MS });
    } catch (error) {
      // JSON 형식 오류만 1회 다시 부른다 (429·시간 초과는 다시 부르지 않음)
      if (!(error instanceof LlmError) || error.code !== "bad_json" || Date.now() - started > TIMEOUT_MS / 2) throw error;
      result = await callJson({ system: STRUCTURIZE_SYSTEM, user, schema, timeoutMs: TIMEOUT_MS - (Date.now() - started) });
    }

    const got = (result.json && result.json.fields) || {};
    const fields = {};
    const followups = {};
    card.fields.forEach((f) => {
      const v = typeof got[f.key] === "string" ? got[f.key].trim().slice(0, MAX_TEXT) : "";
      fields[f.key] = v && v.toLowerCase() !== "null" ? v : null;
      // 되묻는 질문은 AI가 아니라 카드 정의(followUp)에서: 비어 있는 필수 칸만
      if (f.required && !fields[f.key] && f.followUp) followups[f.key] = f.followUp;
    });
    return send(res, 200, { fields, followups });
  } catch (error) {
    return sendError(res, "structurize", error);
  }
};
