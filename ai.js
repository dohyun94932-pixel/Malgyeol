// 가짜 AI (목업). 나중에 실제 AI 호출로 바꿀 때 이 파일의 함수만 교체한다.
// 이 파일에는 로직만 둔다. 문장 틀은 content.js, 카드·칸·받는 사람은 data/cards.json,
// 샘플은 data/malgyeol_sample_data.json(main.js가 불러 SAMPLE_DATA에 넣음)을 쓴다.
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
  { suffix: "보임", formal: "보입니다", polite: "보여요" },
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
// 출력: { variants: [{ type: mine|concise|soft, text, evidence: {칸키: 근거 구절} }], reasons: [...] }
// 확정된 칸의 내용은 빠뜨리거나 바꾸지 않는다.
async function generateMessages({ card, fields, recipient, profile }) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const flow = MESSAGE_FLOW[card.id];
  const style = PARTNER_STYLE[recipient.id] || { greeting: "{h}," };
  // 가장 격식 있는 상대(클라이언트)는 말투 설정과 관계없이 합니다체로 쓴다.
  const polite = !style.formal && profile.ending === "haeyo" ? 1 : 0;
  const requestStyle = style.formal && profile.requestStyle === "direct" ? "soft" : profile.requestStyle;
  const pick = (template) => (Array.isArray(template) ? template[polite] : template);
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

  // 호칭이 비어 있으면(예: 동기) 인사 없이 시작한다.
  const greeting = recipient.honorific ? fixed(style.greeting.replace("{h}", recipient.honorific)) : "";
  const opener = style.formal ? flow.formalOpener : flow.opener;
  const closing = MESSAGE_CLOSINGS[requestStyle] || MESSAGE_CLOSINGS.soft;
  const softClosing = MESSAGE_CLOSINGS.careful;

  const values = {};
  card.fields.forEach((field) => {
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
  // 문장으로 이어 쓸 때는 질문 칸 끝에 마침표를 붙인다. (근거 구절은 마침표 없는 원래 값)
  const tailSentence = tail && !/[?!]$/.test(tail) ? `${tail}.` : tail;

  const mine = [
    line(greeting, fixed(opener)),
    body,
    tailSentence,
    profile.sentenceLength === "detailed" ? fixed(MESSAGE_EXTRA) : null,
    profile.sentenceLength === "short" ? null : fixed(closing, MESSAGE_CLOSINGS.direct),
  ];

  const soft = [
    line(greeting, fixed(flow.soft, opener)),
    body,
    tailSentence,
    fixed(softClosing, MESSAGE_CLOSINGS.soft, MESSAGE_CLOSINGS.direct),
  ];

  // 간결: 값을 그대로 항목으로 나열한다.
  const bulletKeys = [...flow.steps.map((step) => step.key), flow.tail].filter((key) => key && values[key]);
  const concise = [
    line(greeting, fixed(style.formal ? opener : flow.concise, opener)),
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
    reasons: [
      ...MESSAGE_REASONS[card.id],
      style.formal ? MESSAGE_FORMAL_REASON : MESSAGE_RECIPIENT_REASON(recipient.label),
      ...(removed.size ? [MESSAGE_AVOID_REASON([...removed])] : []),
    ],
  };
}
