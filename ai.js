// 가짜 AI (목업). 나중에 실제 AI 호출로 바꿀 때 이 파일의 함수만 교체한다.
// 이 파일에는 로직만 둔다. 문장 틀은 content.js, 카드·칸·받는 사람·수정 이유 문구는 data/cards.json,
// 샘플은 data/malgyeol_sample_data.json을 쓴다. (main.js가 불러 DATA · SAMPLE_DATA에 넣는다)
// 입출력 형식은 코딩 레퍼런스 2장(8절 데이터·저장)과 기획안 10장 기준.

const MOCK_DELAY_MS = 500;

// 띄어쓰기·문장부호를 뺀 비교용 문자열
function normalizeLine(text) {
  return String(text || "").replace(/[\s.,!?~·]/g, "");
}

// 입력이 샘플의 한 줄(oneLine)과 같은지. 한쪽이 다른 쪽을 포함해도 같다고 본다.
function findSample(card, input) {
  const target = normalizeLine(input);
  if (target.length < 6) return null;
  const samples = (typeof SAMPLE_DATA !== "undefined" && SAMPLE_DATA && SAMPLE_DATA.samples) || [];
  return (
    samples.find((sample) => {
      if (sample.cardId !== card.id) return false;
      const line = normalizeLine(sample.oneLine);
      return line === target || line.includes(target) || target.includes(line);
    }) || null
  );
}

// 호출 1 · 구조화
// 입력: card(cards.json의 카드), input(한 줄)
// 출력: { fields: {칸키: 값 또는 null}, followups: {칸키: 되묻는 질문} }
// 한 줄에서 알 수 있는 칸만 채우고 나머지는 null로 둔다. 지어내지 않는다.
async function structurize(card, input) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const fields = {};
  card.fields.forEach((field) => {
    fields[field.key] = null;
  });

  const sample = findSample(card, input);
  const preset = (MOCK_PRESETS[card.id] || []).find((p) => p.keywords.some((word) => input.includes(word)));

  if (sample) {
    // 샘플과 같은 한 줄이면, 한 줄에서 보통 알 수 있는 칸만 샘플 값으로 채운다.
    (STRUCTURIZE_FILL[card.id] || []).forEach((key) => {
      if (sample.fields[key]) fields[key] = sample.fields[key];
    });
  } else if (preset) {
    Object.assign(fields, preset.fields);
  } else {
    // 준비된 응답이 없으면 입력 전체를 첫 칸에만 넣는다.
    fields[card.fields[0].key] = input;
  }

  // 비어 있는 필수 칸만 되묻는다. (코딩 레퍼런스 2장: 빈 필수 칸만 노란 강조)
  const followups = {};
  card.fields.forEach((field) => {
    if (field.required && !fields[field.key]) followups[field.key] = field.followUp;
  });

  return { fields, followups };
}

// ---------- 문장 다듬기 도우미 ----------
// 끝맺음 번호(form): 0 = 합니다체 · 1 = 해요체 · 2 = 반말(동기)

// 한글 한 글자를 초성·중성·종성 번호로 나누고 다시 합친다. (종성 0 = 받침 없음, 8 = ㄹ, 17 = ㅂ, 20 = ㅆ)
const HANGUL_BASE = 0xac00;
function isHangul(ch) {
  const code = String(ch || "").charCodeAt(0);
  return code >= HANGUL_BASE && code <= 0xd7a3;
}
function splitJamo(ch) {
  const n = ch.charCodeAt(0) - HANGUL_BASE;
  return { cho: Math.floor(n / 588), jung: Math.floor((n % 588) / 28), jong: n % 28 };
}
function joinJamo(cho, jung, jong) {
  return String.fromCharCode(HANGUL_BASE + cho * 588 + jung * 28 + jong);
}
function jongOf(ch) {
  return isHangul(ch) ? splitJamo(ch).jong : -1;
}
function withJong(ch, jong) {
  const j = splitJamo(ch);
  return joinJamo(j.cho, j.jung, jong);
}

// 마지막 글자에 받침이 있는지. 숫자는 읽는 소리 기준(영·일·삼·육·칠·팔은 받침 있음).
function hasBatchim(word) {
  const ch = String(word).trim().slice(-1);
  if (!ch) return false;
  if (isHangul(ch)) return splitJamo(ch).jong !== 0;
  return "013678".includes(ch);
}

function endsWithRieul(word) {
  return jongOf(String(word).trim().slice(-1)) === 8;
}

function resolveParticle(token, word, form) {
  const batchim = hasBatchim(word);
  switch (token) {
    case "은는":
      return batchim ? "은" : "는";
    case "이가":
      return batchim ? "이" : "가";
    case "을를":
      return batchim ? "을" : "를";
    case "으로로":
      return batchim && !endsWithRieul(word) ? "으로" : "로";
    case "입니다":
      return ["입니다", batchim ? "이에요" : "예요", batchim ? "이야" : "야"][form];
    default:
      return "";
  }
}

// 메모처럼 적힌 끝(~않음, ~못함 …)을 문장 끝으로 바꾼다. [합니다체, 해요체, 반말]
// '생각함·판단함'처럼 지금 생각을 말하는 끝은 과거형(~했습니다)이 아니라 현재형으로 바꾼다.
const PREDICATE_RULES = [
  { suffix: "생각함", forms: ["생각합니다", "생각해요", "생각해"] },
  { suffix: "판단함", forms: ["판단합니다", "판단해요", "판단해"] },
  { suffix: "예상함", forms: ["예상합니다", "예상해요", "예상해"] },
  { suffix: "필요함", forms: ["필요합니다", "필요해요", "필요해"] },
  { suffix: "않음", forms: ["않습니다", "않아요", "않아"] },
  { suffix: "못함", forms: ["못했습니다", "못했어요", "못했어"] },
  { suffix: "없음", forms: ["없습니다", "없어요", "없어"] },
  { suffix: "있음", forms: ["있습니다", "있어요", "있어"] },
  { suffix: "됨", forms: ["됐습니다", "됐어요", "됐어"] },
  { suffix: "함", forms: ["했습니다", "했어요", "했어"] },
  { suffix: "보임", forms: ["보입니다", "보여요", "보여"] },
  { suffix: "임", copula: true },
];

// 두 글의 같은 앞부분. 의도 체크 근거 구절은 끝맺음을 바꾼 뒤에도 본문에 그대로 남는 이 앞부분을 쓴다.
function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const prefix = a.slice(0, i).trimEnd();
  return prefix.length >= Math.min(4, a.length) ? prefix : b;
}

// 반환: { text: 문장 끝까지 바뀐 값, evidence: 바뀌고 난 뒤에도 본문에 그대로 남는 앞부분 }
function toPredicate(value, form) {
  for (const rule of PREDICATE_RULES) {
    if (!value.endsWith(rule.suffix) || value.length === rule.suffix.length) continue;
    const stem = value.slice(0, -rule.suffix.length);
    const text = rule.copula ? stem + resolveParticle("입니다", stem, form) : stem + rule.forms[form];
    return { text, evidence: commonPrefix(value, text) };
  }
  return { text: value, evidence: value };
}

const TEMPLATE_TOKEN = /\{(v|p|은는|이가|을를|으로로|입니다)\}/g;

// 문장 틀 하나를 값으로 채운다. evidence는 의도 체크가 본문에서 찾을 구절이다.
function renderTemplate(template, value, form) {
  let last = "";
  let evidence = value;

  const text = template.replace(TEMPLATE_TOKEN, (_, token) => {
    if (token === "v") {
      last = value;
      evidence = value;
      return value;
    }
    if (token === "p") {
      const result = toPredicate(value, form);
      last = result.text;
      evidence = result.evidence;
      return result.text;
    }
    return resolveParticle(token, last, form);
  });

  // 값이 ?/! 로 끝나면 틀의 마침표는 뺀다.
  return { text: text.replace(/([?!])\./g, "$1"), evidence };
}

// 문장 끝 마침표와 공백만 정리한다. (?와 !는 그대로 둔다)
function cleanValue(value) {
  return String(value || "").trim().replace(/[.\s]+$/, "");
}

// '특별히 막힌 점은 없습니다'처럼 값이 있어도 '없음'을 뜻하는 칸 (수정 이유에서 언급하지 않고, 연결어도 붙이지 않는다)
const MEANS_NONE_RE = /^(?:특별히|별다른|딱히|특이 ?사항).*(?:없|않)|^(?:없음|해당 없음|없습니다)\.?$/;

// ---------- 칸 값의 모양 판별 ----------
// question(…?) / sentence(완성 문장) / ji("~지"형) / memo(~함·~음) / noun(명사구)
const SENTENCE_END_RE = /(?:니다|[어아여해세게에네죠래워줘봐돼려]요|겠어|었어|았어|했어|있어|없어|줘)$/;
const JI_END_RE = /(?:는지|은지|인지|한지|할지|을지|일지|던지|될지|된지)$/;

function classifyValue(value) {
  const v = String(value).trim();
  if (/\?$/.test(v)) return "question";
  const body = v.replace(/[.!\s]+$/, "");
  if (JI_END_RE.test(body)) return "ji";
  if (/[.!]$/.test(v) || SENTENCE_END_RE.test(body)) return "sentence";
  if (PREDICATE_RULES.some((r) => body.endsWith(r.suffix) && body.length > r.suffix.length)) return "memo";
  return "noun";
}

// ---------- 끝맺음 바꾸기 ----------
// 자주 쓰는 끝은 표로 바로 바꾼다. [합니다체, 해요체, 반말] (긴 것부터)
const SPECIAL_ENDINGS = [
  ["부탁드리겠습니다", "부탁드릴게요", "부탁할게"],
  ["공유드리겠습니다", "공유드릴게요", "공유할게"],
  ["요청드립니다", "요청드려요", "부탁해"],
  ["부탁드립니다", "부탁드려요", "부탁해"],
  ["감사하겠습니다", "감사해요", "고마워"],
  ["감사합니다", "감사해요", "고마워"],
  ["드리겠습니다", "드릴게요", "줄게"],
  ["요청합니다", "요청해요", "부탁해"],
  ["괜찮습니다", "괜찮아요", "괜찮아"],
];
// "~주세요" 같은 부탁 문장은 끝맺음에 맞는 부탁 의문형으로
const REQUEST_FORMS = ["주시겠습니까?", "주실 수 있을까요?", "줄 수 있어?"];

// 받침 없는 동사 끝 글자를 해요체 모양으로 (하→해, 되→돼, 리→려, 보→봐, 주→줘, 쓰→써, 시→세)
function haeyoSyllable(ch) {
  if (ch === "하") return "해";
  if (ch === "되") return "돼";
  if (ch === "시") return "세";
  const { cho, jung } = splitJamo(ch);
  const next = { 8: 9, 13: 14, 20: 6, 18: 4 }[jung]; // ㅗ→ㅘ ㅜ→ㅝ ㅣ→ㅕ ㅡ→ㅓ
  return next === undefined ? ch : joinJamo(cho, next, 0);
}

// 합니다체(…니다) → 해요체. 바꿀 수 없으면 null
function toHaeyo(body) {
  if (body.endsWith("습니다")) {
    const stem = body.slice(0, -3);
    const last = stem.slice(-1);
    if (!isHangul(last)) return null;
    const { jung, jong } = splitJamo(last);
    if (jong === 20) return stem + "어요"; // 했습니다 → 했어요, 겠습니다 → 겠어요
    if (jong === 17) return stem.slice(0, -1) + withJong(last, 0) + "워요"; // 어렵습니다 → 어려워요
    return stem + ([0, 2, 8].includes(jung) ? "아요" : "어요"); // 같습니다 → 같아요, 없습니다 → 없어요
  }
  if (body.endsWith("니다")) {
    const stem = body.slice(0, -2);
    const last = stem.slice(-1);
    if (jongOf(last) !== 17) return null;
    const base = withJong(last, 0);
    const pre = stem.slice(0, -1);
    if (base === "이") return pre + (hasBatchim(pre) ? "이에요" : "예요"); // 중입니다 → 중이에요
    return pre + haeyoSyllable(base) + "요"; // 합니다 → 해요, 드립니다 → 드려요
  }
  return null;
}

// 해요체(…요) → 합니다체. 바꿀 수 없으면 null
function toHamnida(body) {
  if (/(?:이에요|예요)$/.test(body)) return body.replace(/(?:이에요|예요)$/, "입니다");
  if (body.endsWith("세요")) return body.slice(0, -2) + "십니다";
  if (!body.endsWith("요")) return null;
  const core = body.slice(0, -1);
  const last = core.slice(-1);
  const pre = core.slice(0, -1);
  const prev = pre.slice(-1);
  if (last === "어" || last === "아") return prev && hasBatchim(prev) ? pre + "습니다" : null; // 좋겠어요 → 좋겠습니다
  if (last === "해") return pre + "합니다";
  if (last === "돼") return pre + "됩니다";
  if (last === "게" && jongOf(prev) === 8) return pre.slice(0, -1) + withJong(prev, 0) + "겠습니다"; // 드릴게요 → 드리겠습니다
  if (!isHangul(last) || splitJamo(last).jong !== 0) return null;
  const { cho, jung } = splitJamo(last);
  if (cho === 11 && jung === 14 && isHangul(prev)) return pre.slice(0, -1) + withJong(prev, 17) + "습니다"; // 어려워요 → 어렵습니다
  const back = { 9: 8, 14: 13, 6: 20 }[jung]; // ㅘ→ㅗ ㅝ→ㅜ ㅕ→ㅣ
  if (back === undefined && ![0, 1, 4, 5].includes(jung)) return null;
  return pre + joinJamo(cho, back === undefined ? jung : back, 17) + "니다"; // 드려요 → 드립니다, 봐요 → 봅니다
}

// 해요체 → 반말. 바꿀 수 없으면 null
function toBanmal(body) {
  if (body.endsWith("이에요")) return body.slice(0, -3) + "이야";
  if (body.endsWith("예요")) return body.slice(0, -2) + "야";
  if (body.endsWith("세요")) return null;
  return body.endsWith("요") ? body.slice(0, -1) : null;
}

// 마침표를 뺀 완성 문장의 끝맺음만 form에 맞춘다. 앞부분(사용자가 쓴 내용)은 그대로 둔다.
function convertEnding(body, form) {
  for (const set of SPECIAL_ENDINGS) {
    const i = set.findIndex((ending) => body.endsWith(ending));
    if (i !== -1) return body.slice(0, body.length - set[i].length) + set[form];
  }
  let haeyo;
  if (body.endsWith("니다")) {
    if (form === 0) return body;
    haeyo = toHaeyo(body);
  } else if (body.endsWith("요")) {
    if (form === 1) return body;
    if (form === 0) return toHamnida(body) || body;
    haeyo = body;
  } else if (/(?:어|아|해|돼|줘|봐|와|워|려|겨)$/.test(body)) {
    // 반말로 쓴 문장
    if (form === 2) return body;
    haeyo = body + "요";
    if (form === 0) return toHamnida(haeyo) || body;
  } else {
    return body;
  }
  if (!haeyo) return body;
  return form === 1 ? haeyo : toBanmal(haeyo) || haeyo;
}

// 질문 문장은 그대로 쓰되 받는 사람 규칙에 맞게 끝만 다듬는다.
function convertQuestion(body, form, formal) {
  if (form === 2) {
    const q = body
      .replace(/주실 수 있(?:나요|을까요|으세요)$/, "줄 수 있어")
      .replace(/드려도 (될까요|되나요)$/, (_, end) => `해도 ${end}`)
      .replace(/주실/g, "줄")
      .replace(/하실/g, "할");
    return q.endsWith("요") ? q.slice(0, -1) : q;
  }
  if (form === 0 && formal) {
    // 가장 격식: "있나요?" → "있습니까?", "되나요?" → "됩니까?"
    return body.replace(/(.)나요$/, (_, ch) => (hasBatchim(ch) ? `${ch}습니까` : `${withJong(ch, 17)}니까`));
  }
  // 반말 질문을 높임으로 ("알려줄 수 있어?" → "알려줄 수 있어요?")
  return /(?:어|아|까|나|래)$/.test(body) ? `${body}요` : body;
}

// 완성 문장·질문을 그대로 쓰되 끝맺음만 맞춘다. 반환: { text, evidence }
function conjugate(raw, form, formal) {
  const text = String(raw).trim();
  const isQuestion = text.endsWith("?");
  const body = text.replace(/[.!?\s]+$/, "");
  const request = !isQuestion && body.match(/^(.*?)(?:주세요|주십시오|줘요|줘)$/);
  if (request && request[1].trim()) {
    return { text: request[1] + REQUEST_FORMS[form], evidence: request[1].trim() };
  }
  if (isQuestion) {
    const q = convertQuestion(body, form, formal);
    return { text: `${q}?`, evidence: commonPrefix(body, q) };
  }
  const out = convertEnding(body, form);
  return { text: `${out}.`, evidence: commonPrefix(body, out) };
}

const pickForm = (template, form) => (Array.isArray(template) ? template[form] ?? template[template.length - 1] : template || "");

// 칸 하나를 문장으로. 값의 모양에 따라 그대로 쓰거나 알맞은 문장 틀에 끼운다.
function renderStep(step, raw, form, formal) {
  const shape = classifyValue(raw);
  // "특별히 막힌 점은 없습니다"처럼 '없음'을 말하는 값에는 "다만" 같은 연결어를 붙이지 않는다.
  const connector = MEANS_NONE_RE.test(String(raw).trim()) ? "" : pickForm(step.connector, form);
  if (shape === "sentence" || shape === "question") {
    const r = conjugate(raw, form, formal);
    return { text: connector ? `${connector} ${r.text}` : r.text, evidence: r.evidence };
  }
  const value = cleanValue(raw);
  let template;
  if (shape === "ji" && step.ji) template = step.ji;
  else if (shape === "memo") template = step.memo || "{c}{p}.";
  else {
    const alt = (step.nounIf || []).find((a) => a.re.test(value));
    template = alt ? alt.tpl : step.noun;
  }
  return renderTemplate(pickForm(template, form).replace("{c}", connector ? `${connector} ` : ""), value, form);
}

// 더 간결하게의 목록 줄: 완성 문장은 끝맺음만 맞추고(마침표 없이), 나머지는 값 그대로
function renderBullet(raw, form, formal) {
  const shape = classifyValue(raw);
  if (shape !== "sentence" && shape !== "question") return { text: cleanValue(raw), evidence: cleanValue(raw) };
  const r = conjugate(raw, form, formal);
  return { text: r.text.replace(/\.$/, ""), evidence: r.evidence };
}

// 피하고 싶은 표현: 쉼표·줄바꿈으로 나눠 적은 목록
function parseAvoid(text) {
  return String(text || "")
    .split(/[,，、\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function splitSentences(text) {
  return (String(text).match(/[^.?!]+[.?!]*/g) || []).map((s) => s.trim()).filter(Boolean);
}


// ---------- 호출 2 · 메시지 생성 ----------

// 입력: { card, fields, recipient, profile, preferred }
//   recipient: cards.json partners 항목 { id, label, honorific }
//   profile: { sentenceLength: short|normal|detailed, requestStyle: direct|soft|careful, ending: hamnida|haeyo, avoidPhrases }
// 출력: { variants: [{ type: mine|concise|soft, text, evidence: {칸키: 근거 구절}, reasons: [...] }], reasons: [...] }
//   맨 바깥 reasons는 '내 말투안'의 수정 이유와 같다. 탭마다 수정 이유가 다르다. (B3)
// 확정된 칸의 내용은 빠뜨리거나 바꾸지 않는다. 바꾸는 것은 문장 끝맺음뿐이다.
async function generateMessages({ card, fields, recipient, profile }) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const flow = MESSAGE_FLOW[card.id];
  const style = PARTNER_STYLE[recipient.id] || { greeting: "{h}," };
  // 받는 사람 규칙이 말투 설정보다 먼저: 동기는 반말, 클라이언트는 합니다체 [확인 필요]
  const ending = style.ending || profile.ending;
  const form = ending === "banmal" ? 2 : ending === "haeyo" ? 1 : 0;
  const requestStyle = style.formal && profile.requestStyle === "direct" ? "soft" : profile.requestStyle;
  const pick = (template) => pickForm(template, form);
  const labelOf = (key) => card.fields.find((field) => field.key === key).label;

  // 피하고 싶은 표현은 앱이 붙이는 문장(인사·첫 문장·끝인사 등)에서만 뺀다.
  // 사용자가 직접 적은 칸 값은 의도를 바꾸지 않도록 그대로 둔다.
  const avoid = parseAvoid(profile.avoidPhrases);
  const removed = new Set();
  // 후보를 차례로 보고, 피하고 싶은 표현이 든 문장을 뺀 결과가 남는 첫 후보를 쓴다.
  const fixed = (...candidates) => {
    for (const candidate of candidates) {
      if (!candidate) continue;
      const kept = splitSentences(pick(candidate)).filter((sentence) => {
        const hit = avoid.find((word) => sentence.includes(word));
        if (hit) removed.add(hit);
        return !hit;
      });
      if (kept.length) return kept.join(" ");
    }
    return "";
  };
  const line = (...parts) => parts.filter(Boolean).join(" ");
  const join = (lines) => lines.filter(Boolean).join("\n");

  // 채워진 칸만 쓴다. 비어 있는 칸은 문장에서도 빠진다. (B1)
  const raw = {};
  card.fields.forEach((field) => {
    const value = String(fields[field.key] || "").trim();
    if (value) raw[field.key] = value;
  });

  // 인차지는 결론 칸을 맨 앞으로
  let steps = flow.steps.filter((step) => raw[step.key]);
  const lead = style.leadFirst ? LEAD_FIELD[card.id] : null;
  if (lead && steps.some((step) => step.key === lead)) {
    steps = [steps.find((step) => step.key === lead), ...steps.filter((step) => step.key !== lead)];
  }
  const tailStep = flow.tail && raw[flow.tail.key] ? flow.tail : null;

  const evidence = {};
  const body = steps
    .map((step) => {
      const r = renderStep(step, raw[step.key], form, style.formal);
      evidence[step.key] = r.evidence;
      return r.text;
    })
    .join(" ");
  let tail = null; // 질문 준비실은 '묻고 싶은 것'을 마지막 문장에 그대로 (B2)
  if (tailStep) {
    const r = renderStep(tailStep, raw[tailStep.key], form, style.formal);
    evidence[tailStep.key] = r.evidence;
    tail = r.text;
  }

  // 요청 끝인사: 요청을 담은 칸이 명사구로 채워졌을 때만. 급한 기한이면 여유 있는 말을 뺀 끝인사. (B1)
  const closingKey = CLOSING_FIELD[card.id];
  const allowClosing = Boolean(closingKey && raw[closingKey] && !["sentence", "question"].includes(classifyValue(raw[closingKey])));
  const urgent = Object.values(raw).some((value) => URGENT_RE.test(value));
  const closings = urgent ? MESSAGE_CLOSINGS_URGENT : MESSAGE_CLOSINGS;
  const softer = { direct: "soft", soft: "careful", careful: "careful" };
  const closing = (styleKey) => (allowClosing ? fixed(closings[styleKey], closings.direct) : null);
  const extra = profile.sentenceLength === "detailed" && form !== 2 ? fixed(MESSAGE_EXTRA) : null;
  const greeting = recipient.honorific ? fixed(style.greeting.replace("{h}", recipient.honorific)) : "";
  const opener = style.formal ? flow.formalOpener : flow.opener[requestStyle] || flow.opener.soft;

  // 내 말투안: 칸마다 한 문장 → (충분히 설명) → 질문 → 끝인사
  const mine = join([
    line(greeting, fixed(opener)),
    body,
    extra,
    tail,
    profile.sentenceLength === "short" ? null : closing(requestStyle),
  ]);

  // 더 간결하게: 칸 이름과 값만 항목으로 (질문은 마지막 줄)
  const bulletKeys = [...steps.map((step) => step.key), tailStep && tailStep.key].filter(Boolean);
  const conciseEvidence = {};
  const bullets = bulletKeys.map((key) => {
    const r = renderBullet(raw[key], form, style.formal);
    conciseEvidence[key] = r.evidence;
    return `- ${labelOf(key)}: ${r.text}`;
  });
  const concise = join([
    line(greeting, fixed(style.formal ? opener : flow.concise, opener)),
    ...bullets,
    profile.sentenceLength === "short" ? null : closing("direct"),
  ]);

  // 더 부드럽게: 배려하는 첫 문장 + 한 단계 더 부드러운 끝인사
  const soft = join([line(greeting, fixed(flow.soft, opener)), body, extra, tail, closing(softer[requestStyle])]);

  // 수정 이유: cards.json reasons에서 채워진 칸·탭·받는 사람에 맞는 문구만 골라 최대 3줄 (B3)
  const copy = typeof DATA !== "undefined" && DATA && DATA.reasons;
  const filled = (key) => raw[key] && !MEANS_NONE_RE.test(raw[key]);
  const reasonsFor = (tab, index) => {
    if (!copy) return [];
    const matches = ((copy.byField || {})[card.id] || []).filter((r) => r.requires.every(filled));
    const fieldLine = matches.length ? matches[Math.min(index, matches.length - 1)].text : null;
    const lastLine = removed.size ? copy.avoid.replace("{words}", [...removed].join(", ")) : (copy.byPartner || {})[recipient.id];
    return [(copy.byTab || {})[tab], fieldLine, lastLine].filter(Boolean).slice(0, 3);
  };

  const variants = [
    { type: "mine", text: mine, evidence, reasons: reasonsFor("mine", 0) },
    { type: "concise", text: concise, evidence: conciseEvidence, reasons: reasonsFor("concise", 1) },
    { type: "soft", text: soft, evidence, reasons: reasonsFor("soft", 2) },
  ];
  return { variants, reasons: variants[0].reasons };
}
