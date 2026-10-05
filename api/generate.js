// AI 호출 2 · 메시지 생성: 카드 정의 + 채운 칸 + 받는 사람 + 말투 프로필 + 선호 문장
//   → { variants: [{ type: mine|concise|soft, text, evidence: {key: 근거 구절 또는 null}, reasons: [...] }], reasons }
// 브라우저(ai.js)의 generateMessages()가 부른다. 실패하면 브라우저가 가짜 AI로 대체한다.
const { callJson, LlmError, S } = require("./_lib/llm");
const { GENERATE_SYSTEM, STYLE_HINT } = require("./_lib/prompts");
const { send, readBody, text, cardDef, rateLimited, sendError, BadRequest, MAX_PREFERRED } = require("./_lib/common");

const TIMEOUT_MS = 15000;
const TYPES = ["mine", "concise", "soft"];
// 메시지 한 통 = 문체 하나 (CLAUDE.md): 클라이언트 = 합니다체, 동기 = 반말, 선배·인차지 = 말투 설정
const TONE_BY_PARTNER = { client: "hamnida", peer: "banmal" };

function pickEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

module.exports = async function handler(req, res) {
  try {
    const body = readBody(req);
    if (rateLimited(req)) return send(res, 429, { error: "rate_limit" });
    const card = cardDef(body.card);

    const filled = [];
    card.fields.forEach((f) => {
      const v = text(body.fields && body.fields[f.key]);
      if (v) filled.push({ key: f.key, label: f.label, value: v });
    });
    if (filled.length === 0) throw new BadRequest("no_fields");

    const r = body.recipient || {};
    const recipient = { id: text(r.id, { required: true, max: 20 }), label: text(r.label, { max: 20 }) || "", honorific: text(r.honorific, { max: 20 }) || "" };
    const p = body.profile || {};
    const profile = {
      sentenceLength: pickEnum(p.sentenceLength, ["short", "normal", "detailed"], "normal"),
      requestStyle: pickEnum(p.requestStyle, ["direct", "soft", "careful"], "soft"),
      ending: pickEnum(p.ending, ["hamnida", "haeyo"], "hamnida"),
      avoidPhrases: text(p.avoidPhrases, { max: 200 }) || "",
    };
    const preferred = (Array.isArray(body.preferred) ? body.preferred : []).slice(0, MAX_PREFERRED).map((t) => text(t)).filter(Boolean);
    const tone = TONE_BY_PARTNER[recipient.id] || profile.ending;

    const evidenceSchema = S.object(Object.fromEntries(filled.map((f) => [f.key, S.string(true)])));
    const schema = S.object({
      variants: S.array(
        S.object({
          type: S.enumString(TYPES),
          text: S.string(),
          evidence: evidenceSchema,
          reasons: S.array(S.string()),
        }),
      ),
    });
    const user = JSON.stringify({
      card: { id: card.id, name: card.name },
      fields: filled,
      recipient,
      tone,
      requestStyle: STYLE_HINT.requestStyle[profile.requestStyle],
      sentenceLength: STYLE_HINT.sentenceLength[profile.sentenceLength],
      avoidPhrases: profile.avoidPhrases,
      preferred,
    });

    const started = Date.now();
    const run = (timeoutMs) => callJson({ system: GENERATE_SYSTEM, user, schema, timeoutMs }).then((result) => normalize(result.json, filled));
    let variants;
    try {
      variants = await run(TIMEOUT_MS);
    } catch (error) {
      // JSON 형식 오류만 1회 다시 부른다 (429·시간 초과는 다시 부르지 않음)
      if (!(error instanceof LlmError) || error.code !== "bad_json" || Date.now() - started > TIMEOUT_MS / 2) throw error;
      variants = await run(TIMEOUT_MS - (Date.now() - started));
    }
    return send(res, 200, { variants, reasons: variants[0].reasons });
  } catch (error) {
    return sendError(res, "generate", error);
  }
};

// AI 응답을 앱 형식으로 정리한다. 근거 구절이 본문에 글자 그대로 없으면 그 항목은 비운다(null).
function normalize(json, filled) {
  const list = (json && Array.isArray(json.variants) && json.variants) || [];
  return TYPES.map((type) => {
    const v = list.find((item) => item && item.type === type);
    if (!v || typeof v.text !== "string" || !v.text.trim()) throw new LlmError("bad_json");
    const body = v.text.trim();
    const evidence = {};
    filled.forEach((f) => {
      const e = v.evidence && typeof v.evidence[f.key] === "string" ? v.evidence[f.key].trim() : "";
      evidence[f.key] = e.length >= 2 && body.includes(e) ? e : null;
    });
    const reasons = (Array.isArray(v.reasons) ? v.reasons : [])
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.trim())
      .slice(0, 3);
    return { type, text: body, evidence, reasons };
  });
}
