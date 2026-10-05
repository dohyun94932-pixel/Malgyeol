// 미리보기 전용 상태 확인: /api/health
//   → { env, keySet: "예"|"아니오", model, thinking, test: { ok, ms, error? } }
// 키 값은 절대 보여 주지 않는다 (설정 여부만). 실제 배포(VERCEL_ENV=production)에서는 404.
// test는 Gemini에 아주 짧은 시험 호출을 1번 한다 (무료 한도 1회 사용 · 키가 있을 때만).
const { callJson, S, DEFAULT_MODEL } = require("./_lib/llm");
const { send } = require("./_lib/common");

const TEST_TIMEOUT_MS = 8000;

module.exports = async function handler(req, res) {
  if (process.env.VERCEL_ENV === "production") return send(res, 404, { error: "not_found" });
  if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });

  const keySet = Boolean(process.env.GEMINI_API_KEY);
  const out = {
    env: process.env.VERCEL_ENV || "local",
    keySet: keySet ? "예" : "아니오",
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    thinking: process.env.GEMINI_THINKING || "minimal",
    test: null,
  };
  if (keySet) {
    const started = Date.now();
    try {
      const { json } = await callJson({
        system: 'Reply with JSON {"ok":"yes"} only.',
        user: "ping",
        schema: S.object({ ok: S.string() }),
        timeoutMs: TEST_TIMEOUT_MS,
      });
      out.test = { ok: Boolean(json && json.ok), ms: Date.now() - started };
    } catch (error) {
      // 오류 종류와 상태 숫자만 (응답 내용·키는 보내지 않음)
      out.test = { ok: false, ms: Date.now() - started, error: (error && error.code) || "server", status: (error && error.status) || undefined };
    }
  }
  return send(res, 200, out);
};
