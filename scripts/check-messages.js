// 말결 메시지 자동 점검 (가짜 AI 결과 품질 점검용 · 앱에는 포함되지 않음)
// ai.js·content.js와 같은 페이지에서 돌기 때문에 이름이 겹치지 않게 점검 쪽 이름에는 QA·qa를 붙인다.
// 실행: scripts/qa.html을 로컬 서버로 열기 (README '메시지 자동 점검' 참고)
//   이 PC에는 Node가 없어서 Node vm 대신 브라우저에서 ai.js·content.js를 그대로 불러와 돌린다.
//   ai.js·content.js는 고치지 않고, 이 파일은 generateMessages()의 결과만 본다.
//
// 점검 패턴·문구 목록은 아래 [점검 기준] 구역에 모여 있다. 새 패턴은 배열에 한 줄씩 추가하면 된다.

// ===================== [점검 기준] =====================

// 5) 문법 깨짐: 본문 어디에 나오든 문제인 글자 모양
const GRAMMAR_PATTERNS = [
  { re: /[.?!](?:을|를|은|는|이|가|으로|로|입니다|이에요|예요)/, desc: '문장부호 바로 뒤에 조사·서술어가 붙음 (예: "주세요.을")' },
  { re: /(?:어|아|해|세|게|에|죠|래)요(?:을|를|은|는|이|가|입니다|이에요|예요)/, desc: '"~요" 문장 끝 뒤에 조사·서술어가 붙음 (예: "좋겠어요를")' },
  { re: /(?:니|습|었|았|했|한|된)다(?:을|를|은|는|이|가|입니다|이에요|예요)/, desc: '"~다" 문장 끝 뒤에 조사·서술어가 붙음 (예: "있습니다를")' },
  { re: /(?:까지|내로|안에|이내|중으로)까지/, desc: '기한 끝에 "까지"가 또 붙음 (예: "오늘 내로까지")' },
  { re: /(?:니다|요)\s*(?:입니다|이에요|예요)/, desc: '서술어가 두 번 붙음 (예: "입니다입니다", "불가능한지입니다"류)' },
  { re: /(?<!까)지(?:입니다|이에요|예요)/, desc: '"~지" 뒤에 "입니다"가 붙음 (예: "가능한지 불가능한지입니다" · "오전까지입니다"는 정상이라 뺌)' },
  { re: /\{[^}]*\}|을를|은는|으로로/, desc: "조사 자리표시가 그대로 남음 (예: {을를}, 을를)" },
  { re: /\bnull\b|\bundefined\b/, desc: 'null·undefined가 본문에 나옴' },
  { re: / {2,}/, desc: "공백 두 칸 이상" },
  { re: /\.\./, desc: "마침표 두 개" },
  { re: /[?!]\./, desc: '물음표·느낌표 뒤에 마침표 (예: "?.")' },
];

// 1) B1: 앱이 덧붙이는 요청 문장 (사용자가 쓴 칸 값 밖에서 나오면 '추가한 요청'으로 본다)
const REQUEST_PHRASES = ["확인 부탁", "시간 되실 때", "편하실 때", "답변 부탁", "확인해 주시면", "검토 부탁"];
// 급한 기한 표현과 여유 있는 끝인사
const QA_URGENT_RE = /오늘|지금|바로|급히|즉시|금일|내일 오전/;
const RELAXED_PHRASES = ["시간 되실 때", "편하실 때", "여유 되실 때", "시간 될 때", "편할 때"];

// 3) B3: 칸이 비어 있을 때 수정 이유에 나오면 안 되는 단어 (칸 key → 단어)
const B3_KEYWORDS = {
  question: { situation: ["상황"], tried: ["해본 것"], blocker: ["막힌 지점"], options: ["선택지"], judgment: ["판단"], ask: ["질문", "묻고 싶은"] },
  request: { request: ["요청"], deadline: ["기한"], deliverable: ["필요한 결과", "결과물"], reason: ["이유", "배경"], alternative: ["대안", "조건"], consentNeeded: ["동의", "승인"] },
  status: { done: ["완료한 것"], inProgress: ["진행 중"], blocker: ["막힌 점"], helpNeeded: ["도움 요청"], nextEta: ["예상 시점", "다음 예정"] },
};
// 값이 있어도 '없음'을 뜻하는 칸 (T8: s05 막힌 점 "특별히 막힌 점은 없습니다.")
// "자료가 없습니다"처럼 문제를 설명하는 문장은 빼고, "특별히·별다른·딱히 … 없습니다" / "없음" / "해당 없음"만 본다.
const QA_MEANS_NONE_RE = /^(?:특별히|별다른|딱히|특이 ?사항).*(?:없|않)|^(?:없음|해당 없음|없습니다)\.?$/;

// 2·6) 문장 끝 모양 (목록 줄은 마침표가 없어서 마침표는 있어도 없어도 본다. "필요"처럼 요로 끝나는 낱말은 빼려고 앞 글자를 본다)
const HAEYO_END_RE = /(?:어|아|해|세|게|에|죠|래|네|대|여)요\.?$/;
const HAMNIDA_END_RE = /니다\.?$/;
const POLITE_END_RE = /(?:(?:어|아|해|세|게|에|죠|래|네|대|여)요|니다|니까)[.?!]?$/;

// 4) 받는 사람 규칙: 인차지는 결론 먼저 — 카드별 '결론' 칸
//    질문 준비실은 B2(묻고 싶은 것은 마지막 문장)와 겹치지 않게 '내 판단'을 결론으로 본다.
const QA_LEAD_FIELD = { question: "judgment", request: "request", status: "done" };

// 7) 마스킹 표현과, 점검용으로 넣는 피하고 싶은 표현
const MASK_TOKENS = ["A사", "X원"];
const AVOID_TEST = "죄송, 바쁘신";

// ===================== [시험 사례] =====================
// 샘플 30건 전부 + 일부 칸만 채운 사례. 사례마다 끝맺음 2종 × 요청 방식 3종을 돌리고, 결과의 탭 3종을 모두 본다.
const EXTRA_CASES = [
  {
    id: "T5",
    title: "상황보고 · 완료한 것만 채움",
    cardId: "status",
    partner: "선배",
    fields: { done: "매출 표본 40건 중 35건의 증빙 대사" },
  },
  {
    id: "X1",
    title: "예전 문제 사례 · 부탁 한 장 · 인차지",
    cardId: "request",
    partner: "인차지",
    fields: {
      request: "세무조사 대응업무를 저 대신 다른 사람이 나가주셨으면 좋겠어요",
      deadline: "오늘 내로",
      deliverable: "가능한지 불가능한지",
      reason: "X사 업무의 과중",
    },
  },
];

// ===================== [점검 로직] =====================

const ITEMS = [
  { id: "B1", name: "B1 · 빈 칸의 요청·기한 문장 추가 / 급한 기한에 여유 끝인사" },
  { id: "B2", name: "B2 · 질문 준비실 마지막 문장에 '묻고 싶은 것' / 해본 것·내 판단 포함" },
  { id: "B3", name: "B3 · 수정 이유가 빈 칸(또는 '없음' 칸)을 언급" },
  { id: "R", name: "받는 사람 규칙 (선배님 · 인차지 결론 먼저 · 동기 반말 · 클라이언트 담당자님·합니다체)" },
  { id: "G", name: "문법 깨짐" },
  { id: "T", name: "말투 혼합 (합니다체↔해요체)" },
  { id: "M", name: "마스킹(A사·X원) 유지" },
  { id: "E", name: "의도 체크 근거 구절이 본문에 있는지" },
  { id: "A", name: "피하고 싶은 표현이 본문에 들어감" },
];
const INFO = [{ id: "R3", name: "(참고) 탭 3종의 수정 이유가 모두 같음" }];

function qaSplitSentences(text) {
  const out = [];
  String(text)
    .split("\n")
    .forEach((line) => {
      const body = line.replace(/^-\s*[^:]+:\s*/, ""); // 목록 줄은 값 부분만
      (body.match(/[^.?!]+[.?!]+|[^.?!]+$/g) || []).forEach((s) => {
        const t = s.trim();
        if (t) out.push(t);
      });
    });
  return out;
}

const stripEnd = (v) => String(v || "").trim().replace(/[.?!\s]+$/, "");
const core = (v, n = 10) => stripEnd(v).slice(0, n);

// 사용자가 쓴 칸 값을 지운 나머지 = 앱이 붙인 글
function appText(text, values) {
  let rest = text;
  Object.values(values)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((v) => {
      rest = rest.split(stripEnd(v)).join(" ");
    });
  return rest;
}

function checkMessage(run, variant) {
  const problems = [];
  const add = (item, detail) => problems.push({ item, detail });
  const { card, values, partner, profile } = run;
  const text = variant.text;
  const app = appText(text, values);
  const sentences = qaSplitSentences(text);
  const reasons = variant.reasons || run.reasons;

  // B1
  const empty = (key) => !values[key];
  const hitRequest = REQUEST_PHRASES.find((p) => app.includes(p));
  if (card.id === "status" && empty("helpNeeded") && hitRequest) add("B1", `도움 요청이 비었는데 "${hitRequest}" 문장이 붙음`);
  if (card.id === "question" && hitRequest) add("B1", `질문 외에 요청 문장 "${hitRequest}"이 붙음`);
  const urgent = Object.values(values).some((v) => QA_URGENT_RE.test(v));
  const relaxed = RELAXED_PHRASES.find((p) => app.includes(p));
  if (urgent && relaxed) add("B1", `급한 기한인데 "${relaxed}" 끝인사`);

  // B2
  if (card.id === "question") {
    const last = sentences[sentences.length - 1] || "";
    if (values.ask && !last.includes(core(values.ask, 12))) add("B2", `마지막 문장에 묻고 싶은 것이 없음 (마지막: "${last}")`);
    ["tried", "judgment"].forEach((key) => {
      if (values[key] && !text.includes(core(values[key]))) add("B2", `${key === "tried" ? "해본 것" : "내 판단"}이 본문에 없음`);
    });
  }

  // B3
  const words = B3_KEYWORDS[card.id] || {};
  Object.entries(words).forEach(([key, list]) => {
    const none = values[key] && QA_MEANS_NONE_RE.test(String(values[key]).trim());
    if (!empty(key) && !none) return;
    reasons.forEach((reason) => {
      const w = list.find((word) => reason.includes(word));
      if (w) add("B3", `${none ? "'없음' 칸" : "빈 칸"}(${key})을 수정 이유가 언급: "${reason}"`);
    });
  });

  // 받는 사람 규칙
  const firstLine = text.split("\n")[0] || "";
  if (partner.id === "senior" && !firstLine.startsWith("선배님")) add("R", "선배인데 '선배님'으로 시작하지 않음");
  if (partner.id === "incharge") {
    if (!firstLine.startsWith("인차지님")) add("R", "인차지인데 '인차지님'으로 시작하지 않음");
    const lead = values[QA_LEAD_FIELD[card.id]];
    const firstTwo = sentences.slice(0, 2).join(" ");
    if (lead && !firstTwo.includes(core(lead, 8))) add("R", `인차지인데 결론(${QA_LEAD_FIELD[card.id]})이 앞 두 문장 안에 없음`);
  }
  if (partner.id === "peer") {
    if (/님[,.]/.test(firstLine)) add("R", "동기인데 호칭(~님)으로 시작");
    const polite = sentences.filter((s) => POLITE_END_RE.test(s));
    if (polite.length) add("R", `동기인데 존댓말 문장 ${polite.length}개 (예: "${polite[0]}")`);
  }
  if (partner.id === "client") {
    if (!text.includes("담당자님")) add("R", "클라이언트인데 '담당자님'이 없음");
    const yo = sentences.filter((s) => HAEYO_END_RE.test(s));
    if (yo.length) add("R", `클라이언트인데 해요체 문장 ${yo.length}개 (예: "${yo[0]}")`);
  }

  // 문법 깨짐
  GRAMMAR_PATTERNS.forEach((p) => {
    const m = text.match(p.re);
    if (m) {
      const at = text.indexOf(m[0]);
      add("G", `${p.desc} · "…${text.slice(Math.max(0, at - 12), at + m[0].length + 6).replace(/\n/g, " ")}…"`);
    }
  });

  // 말투 혼합 (동기는 반말 규칙, 클라이언트는 합니다체 고정으로 대신 본다)
  if (partner.id !== "peer") {
    const target = partner.id === "client" ? "hamnida" : profile.ending;
    const bad = sentences.filter((s) => (target === "hamnida" ? HAEYO_END_RE.test(s) : HAMNIDA_END_RE.test(s)));
    if (bad.length) add("T", `${target === "hamnida" ? "합니다체인데 '~요.'" : "해요체인데 '~니다.'"} 문장 ${bad.length}개 (예: "${bad[0]}")`);
  }

  // 마스킹
  MASK_TOKENS.forEach((token) => {
    if (Object.values(values).some((v) => v.includes(token)) && !text.includes(token)) add("M", `"${token}"이 본문에서 사라짐`);
  });

  // 의도 체크 근거 구절
  Object.keys(values).forEach((key) => {
    const phrase = variant.evidence && variant.evidence[key];
    if (!phrase) add("E", `${key} 근거 구절이 없음`);
    else if (!text.includes(phrase)) add("E", `${key} 근거 구절 "${phrase}"이 본문에 없음`);
  });

  // 피하고 싶은 표현
  if (profile.avoidPhrases) {
    profile.avoidPhrases
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean)
      .forEach((w) => {
        if (app.includes(w)) add("A", `피하고 싶은 표현 "${w}"이 앱이 붙인 문장에 있음`);
      });
  }

  return problems;
}

// 모든 사례를 돌려 { runs, results } 를 만든다. generate는 ai.js의 generateMessages.
async function runAll(DATA, SAMPLES, generate) {
  const partnerByLabel = Object.fromEntries(DATA.partners.map((p) => [p.label, p]));
  const cases = [
    ...SAMPLES.samples.map((s) => ({ id: s.id, title: s.oneLine, cardId: s.cardId, partner: s.partner, fields: s.fields })),
    ...EXTRA_CASES,
  ];
  const profiles = [];
  ["hamnida", "haeyo"].forEach((ending) =>
    ["direct", "soft", "careful"].forEach((requestStyle) =>
      profiles.push({ sentenceLength: "normal", requestStyle, ending, avoidPhrases: "", preferredExamples: [] }),
    ),
  );

  const jobs = [];
  cases.forEach((c) => {
    const card = DATA.cards.find((x) => x.id === c.cardId);
    const fields = Object.fromEntries(card.fields.map((f) => [f.key, c.fields[f.key] || null]));
    const values = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && String(v).trim()));
    const partner = partnerByLabel[c.partner];
    const list = [...profiles];
    // 피하고 싶은 표현 점검용 1회 (합니다체 · 매우 조심스럽게 — 앱 문장에 '죄송'이 들어가는 조건)
    list.push({ sentenceLength: "normal", requestStyle: "careful", ending: "hamnida", avoidPhrases: AVOID_TEST, preferredExamples: [] });
    list.forEach((profile) => jobs.push({ c, card, fields, values, partner, profile }));
  });

  const runs = await Promise.all(
    jobs.map(async (job) => {
      const out = await generate({ card: job.card, fields: job.fields, recipient: job.partner, profile: job.profile, preferred: [] });
      return { ...job, variants: out.variants, reasons: out.reasons };
    }),
  );

  const results = [];
  runs.forEach((run) => {
    const reasonSets = run.variants.map((v) => JSON.stringify(v.reasons || run.reasons));
    run.sameReasons = new Set(reasonSets).size === 1;
    run.variants.forEach((variant) => {
      checkMessage(run, variant).forEach((p) =>
        results.push({ ...p, caseId: run.c.id, cardId: run.card.id, partner: run.partner.label, profile: run.profile, tab: variant.type, text: variant.text }),
      );
    });
  });
  return { runs, results, caseCount: cases.length };
}

function summarize({ runs, results, caseCount }) {
  const messages = runs.length * 3;
  const rows = ITEMS.map((item) => {
    const list = results.filter((r) => r.item === item.id);
    const msgKeys = new Set(list.map((r) => `${r.caseId}|${JSON.stringify(r.profile)}|${r.tab}`));
    return { ...item, count: list.length, messages: msgKeys.size };
  });
  const sameReasons = runs.filter((r) => r.sameReasons).length;
  return { messages, runs: runs.length, caseCount, rows, sameReasons };
}

const TAB_LABEL = { mine: "내 말투안", concise: "더 간결하게", soft: "더 부드럽게" };
const ENDING_LABEL = { hamnida: "합니다체", haeyo: "해요체" };
const STYLE_LABEL = { direct: "직접적으로", soft: "부드럽게", careful: "매우 조심스럽게" };

function toMarkdown(data, { title, date }) {
  const s = summarize(data);
  const lines = [];
  lines.push(`# ${title}`, "");
  lines.push(`- 실행일: ${date}`);
  lines.push(`- 방법: \`scripts/qa.html\`(브라우저)에서 \`ai.js\`의 generateMessages()를 그대로 실행 · 점검 기준은 \`scripts/check-messages.js\` 위쪽`);
  lines.push(`- 대상: 사례 ${s.caseCount}개(샘플 30건 + T5·X1) × 말투 7조건(끝맺음 2 × 요청 방식 3 + 피하고 싶은 표현 1) = 생성 ${s.runs}회 × 탭 3종 = 메시지 ${s.messages}개`);
  lines.push("", "## 항목별 요약", "", "| 항목 | 문제 수 | 문제 난 메시지 수 |", "|---|---:|---:|");
  s.rows.forEach((r) => lines.push(`| ${r.name} | ${r.count} | ${r.messages} |`));
  lines.push(`| **합계** | **${s.rows.reduce((a, r) => a + r.count, 0)}** | |`);
  lines.push("", `${INFO[0].name}: 생성 ${s.runs}회 중 ${s.sameReasons}회`, "");

  lines.push("## 문제 예시 (항목별 최대 12개 · 같은 사례·같은 문제는 한 번만)", "");
  ITEMS.forEach((item) => {
    const list = data.results.filter((r) => r.item === item.id);
    if (!list.length) return;
    lines.push(`### ${item.name} — ${list.length}건`, "");
    const seen = new Set();
    let n = 0;
    for (const r of list) {
      const key = `${r.caseId}|${r.detail.replace(/\d+개/, "")}|${r.tab}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`- **${r.caseId}** · ${r.partner} · ${TAB_LABEL[r.tab]} · ${ENDING_LABEL[r.profile.ending]} · ${STYLE_LABEL[r.profile.requestStyle]}${r.profile.avoidPhrases ? " · 피할 표현 있음" : ""} — ${r.detail}`);
      if (++n >= 12) break;
    }
    lines.push("");
  });
  return lines.join("\n");
}
