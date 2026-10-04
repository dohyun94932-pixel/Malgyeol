// 가짜 AI (목업). 나중에 실제 AI 호출로 바꿀 때 이 파일의 함수만 교체한다.
// 이 파일에는 로직만 둔다. 샘플 응답과 문장 틀은 모두 content.js의 임시 데이터를 쓴다.
// 입출력 형식은 기획서 5-5와 동일하다.

const MOCK_DELAY_MS = 500;

// 호출 1 · 구조화: { fields: {칸키: 값 또는 null}, followups: {칸키: 되묻는 질문} }
// 입력에 없는 내용은 null로 두고 지어내지 않는다.
async function structurize(card, input) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const preset = (MOCK_PRESETS[card.id] || []).find((p) => p.keywords.some((word) => input.includes(word)));

  const fields = {};
  card.fields.forEach((field) => {
    fields[field.key] = null;
  });

  if (preset) {
    Object.assign(fields, preset.fields);
  } else {
    // 준비된 응답이 없으면 입력 전체를 첫 칸에만 넣는다.
    fields[card.fields[0].key] = input;
  }

  const followups = {};
  card.fields.forEach((field) => {
    if (field.type !== "checkbox" && field.required && !fields[field.key]) {
      followups[field.key] = field.question;
    }
  });

  return { fields, followups };
}

// ---------- 문장 다듬기 도우미 ----------
// 칸 값을 문장 틀(content.js의 MESSAGE_FLOW)에 끼워 넣을 때 조사와 끝맺음을 맞춘다.

// 마지막 글자에 받침이 있는지. 숫자는 읽는 소리 기준(영·일·삼·육·칠·팔은 받침 있음).
function hasBatchim(word) {
  const ch = String(word).trim().slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return "013678".includes(ch);
}

function endsWithRieul(word) {
  const code = String(word).trim().slice(-1).charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
}

function resolveParticle(token, word, polite) {
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
      return polite ? (batchim ? "이에요" : "예요") : "입니다";
    default:
      return "";
  }
}

// 메모처럼 적힌 끝(~않음, ~못함 …)을 문장 끝으로 바꾼다. 해당되지 않으면 값을 그대로 둔다.
const PREDICATE_RULES = [
  { suffix: "않음", formal: "않습니다", polite: "않아요" },
  { suffix: "못함", formal: "못했습니다", polite: "못했어요" },
  { suffix: "없음", formal: "없습니다", polite: "없어요" },
  { suffix: "있음", formal: "있습니다", polite: "있어요" },
  { suffix: "됨", formal: "됐습니다", polite: "됐어요" },
  { suffix: "함", formal: "했습니다", polite: "했어요" },
  { suffix: "임", copula: true },
];

// 반환: { text: 문장 끝까지 바뀐 값, evidence: 바뀌고 난 뒤에도 본문에 그대로 남는 앞부분 }
function toPredicate(value, polite) {
  for (const rule of PREDICATE_RULES) {
    if (!value.endsWith(rule.suffix) || value.length === rule.suffix.length) continue;

    const stem = value.slice(0, -rule.suffix.length);
    if (rule.copula) {
      return { text: stem + resolveParticle("입니다", stem, polite), evidence: stem };
    }

    const form = polite ? rule.polite : rule.formal;
    let keep = 0;
    while (keep < rule.suffix.length && rule.suffix[keep] === form[keep]) keep += 1;
    return { text: stem + form, evidence: stem + rule.suffix.slice(0, keep) };
  }
  return { text: value, evidence: value };
}

const TEMPLATE_TOKEN = /\{(v|p|은는|이가|을를|으로로|입니다)\}/g;

// 문장 틀 하나를 값으로 채운다. evidence는 의도 체크가 본문에서 찾을 구절이다.
function renderTemplate(template, value, polite) {
  let last = "";
  let evidence = value;

  const text = template.replace(TEMPLATE_TOKEN, (_, token) => {
    if (token === "v") {
      last = value;
      evidence = value;
      return value;
    }
    if (token === "p") {
      const result = toPredicate(value, polite);
      last = result.text;
      evidence = result.evidence;
      return result.text;
    }
    return resolveParticle(token, last, polite);
  });

  // 값이 ?/! 로 끝나면 틀의 마침표는 뺀다.
  return { text: text.replace(/([?!])\./g, "$1"), evidence };
}

// 근거 구절로 쓰려고 문장 끝 마침표와 공백만 정리한다. (?와 !는 그대로 둔다)
function cleanValue(value) {
  return String(value || "").trim().replace(/[.\s]+$/, "");
}

// ---------- 호출 2 · 메시지 생성 ----------

// 입력: { card, fields, recipient, profile, preferred }
// 출력: { variants: [{ type, text, evidence: {칸키: 근거 구절} }], reasons: [...] }
// 확정된 칸의 내용은 빠뜨리거나 바꾸지 않는다.
async function generateMessages({ card, fields, recipient, profile }) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const flow = MESSAGE_FLOW[card.id];
  const polite = profile.ending === "해요체" ? 1 : 0;
  const greeting = MESSAGE_GREETINGS[recipient] || "안녕하세요,";
  const closing = MESSAGE_CLOSINGS[profile.request] || MESSAGE_CLOSINGS["부드럽게"];
  const softClosing = MESSAGE_CLOSINGS["매우 조심스럽게"];
  const pick = (template) => (Array.isArray(template) ? template[polite] : template);
  const labelOf = (key) => card.fields.find((field) => field.key === key).label;

  const values = {};
  card.fields.forEach((field) => {
    if (field.type === "checkbox") return;
    const value = cleanValue(fields[field.key]);
    if (value) values[field.key] = value;
  });

  // 내 말투안·부드럽게: 칸마다 한 문장씩 이어 붙인다.
  const evidence = {};
  const sentences = [];
  flow.steps.forEach((step) => {
    if (!values[step.key]) return;
    const rendered = renderTemplate(pick(step.tpl), values[step.key], polite);
    sentences.push(rendered.text);
    evidence[step.key] = rendered.evidence;
  });
  const body = sentences.join(" ");

  const tail = flow.tail ? values[flow.tail] : null;
  if (tail) evidence[flow.tail] = tail;

  const mine = [
    `${greeting} ${pick(flow.opener)}`,
    body,
    tail,
    profile.length === "충분히 설명" ? MESSAGE_EXTRA[polite] : null,
    profile.length === "짧게" ? null : closing[polite],
  ];

  const soft = [`${greeting} ${pick(flow.soft)}`, body, tail, softClosing[polite]];

  // 간결: 값을 그대로 항목으로 나열한다.
  const bulletKeys = [...flow.steps.map((step) => step.key), flow.tail].filter((key) => key && values[key]);
  const concise = [
    `${greeting} ${pick(flow.concise)}`,
    ...bulletKeys.map((key) => `- ${labelOf(key)}: ${values[key]}`),
  ];
  const conciseEvidence = Object.fromEntries(bulletKeys.map((key) => [key, values[key]]));

  const join = (lines) => lines.filter(Boolean).join("\n");

  return {
    variants: [
      { type: "mine", text: join(mine), evidence },
      { type: "concise", text: join(concise), evidence: conciseEvidence },
      { type: "soft", text: join(soft), evidence },
    ],
    reasons: [...MESSAGE_REASONS[card.id], MESSAGE_RECIPIENT_REASON(recipient)],
  };
}
