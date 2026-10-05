// 서버 함수 공통: 요청 검사(POST만 · 글자 수 제한), 간단한 호출 제한, 응답 보내기.
// 사용자 입력·AI 응답·키는 로그에 남기지 않는다. 오류는 종류(code)만 남긴다.

const MAX_TEXT = 500; // 칸당·한 줄 입력 글자 수 제한
const MAX_FIELDS = 12;
const MAX_PREFERRED = 5;
const RATE_LIMIT = 10; // 한 브라우저 1분 10회
const RATE_WINDOW_MS = 60 * 1000;

class BadRequest extends Error {}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.method !== "POST") throw Object.assign(new BadRequest("method"), { status: 405 });
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      throw new BadRequest("json");
    }
  }
  if (!body || typeof body !== "object") throw new BadRequest("body");
  return body;
}

// 글자 칸: 문자열이고 500자 이하 (빈 값은 null)
function text(value, { required = false, max = MAX_TEXT } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new BadRequest("required");
    return null;
  }
  if (typeof value !== "string") throw new BadRequest("type");
  const v = value.trim();
  if (v.length > max) throw new BadRequest("too_long");
  if (required && !v) throw new BadRequest("required");
  return v || null;
}

// 요청에 담겨 온 카드 정의 (cards.json의 카드) 검사
function cardDef(card) {
  if (!card || typeof card !== "object" || !Array.isArray(card.fields)) throw new BadRequest("card");
  if (card.fields.length === 0 || card.fields.length > MAX_FIELDS) throw new BadRequest("card_fields");
  const fields = card.fields.map((field) => {
    const key = text(field && field.key, { required: true, max: 40 });
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new BadRequest("field_key");
    return {
      key,
      label: text(field.label, { required: true, max: 40 }),
      required: Boolean(field.required),
      followUp: text(field.followUp, { max: 120 }),
    };
  });
  return { id: text(card.id, { required: true, max: 40 }), name: text(card.name, { max: 40 }) || "", fields };
}

// 아주 간단한 호출 제한: 서버 인스턴스 메모리에 브라우저별(X-Malgyeol-Client) 최근 호출 시각을 둔다.
// 서버가 여러 대로 나뉘면 정확하지 않지만, 한 브라우저가 짧은 시간에 몰아 부르는 것은 막는다.
// (같은 회사 와이파이는 IP가 같아서 IP 기준으로 막지 않는다)
const hits = new Map();
function rateLimited(req) {
  const id = String(req.headers["x-malgyeol-client"] || "").slice(0, 64) || "anonymous";
  const now = Date.now();
  const recent = (hits.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 5000) hits.clear(); // 메모리 보호
  return recent.length > RATE_LIMIT;
}

// 오류를 응답으로. 가짜 AI 대체는 브라우저(ai.js)가 한다.
function sendError(res, where, error) {
  if (error instanceof BadRequest) return send(res, error.status || 400, { error: "bad_request" });
  const code = (error && error.code) || "server";
  console.error(`[api/${where}] ${code}`); // 오류 종류만 (입력·응답·키는 남기지 않음)
  const status = code === "rate_limit" ? 429 : code === "timeout" ? 504 : 502;
  return send(res, status, { error: code });
}

module.exports = { MAX_TEXT, MAX_PREFERRED, BadRequest, send, readBody, text, cardDef, rateLimited, sendError };
