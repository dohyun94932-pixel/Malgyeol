// 가짜 AI (목업). 나중에 실제 AI 호출로 바꿀 때 이 파일의 함수만 교체한다.
// 입출력 형식은 기획서 5-5와 동일하다.

const MOCK_DELAY_MS = 500;

// 호출 1 · 구조화: { fields: {칸키: 값 또는 null}, followups: {칸키: 되묻는 질문} }
// 입력에 없는 내용은 null로 두고 지어내지 않는다.
async function structurize(card, input) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const preset = (MOCK_PRESETS[card.id] || []).find((p) => input.includes(p.keyword));

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

// ---------- 호출 2 · 메시지 생성 ----------

// 근거 구절로 쓰려고 문장 끝 마침표와 공백만 정리한다. (?와 !는 그대로 둔다)
function cleanValue(value) {
  return String(value || "").trim().replace(/[.\s]+$/, "");
}

function labeledSentence(label, value) {
  return `${label}: ${value}${/[?!]$/.test(value) ? "" : "."}`;
}

// 입력: { card, fields, recipient, profile, preferred }
// 출력: { variants: [{ type, text, evidence: {칸키: 근거 구절} }], reasons: [...] }
// 확정된 칸의 내용은 빠뜨리거나 바꾸지 않는다.
async function generateMessages({ card, fields, recipient, profile }) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const config = MESSAGE_PARTS[card.id];
  const polite = profile.ending === "해요체" ? 1 : 0;
  const greeting = MESSAGE_GREETINGS[recipient] || "안녕하세요,";
  const closing = MESSAGE_CLOSINGS[profile.request] || MESSAGE_CLOSINGS["부드럽게"];
  const softClosing = MESSAGE_CLOSINGS["매우 조심스럽게"];

  const values = {};
  const evidence = {};
  card.fields.forEach((field) => {
    if (field.type === "checkbox") return;
    const value = cleanValue(fields[field.key]);
    if (value) {
      values[field.key] = value;
      evidence[field.key] = value;
    }
  });

  const filledParts = config.parts.filter(([key]) => values[key]);
  const tailValue = config.tail ? values[config.tail.key] : null;

  const body = filledParts.map(([key, label]) => labeledSentence(label, values[key]));

  const mine = [
    `${greeting} ${config.opener[polite]}`,
    body.join(" "),
    tailValue,
    profile.length === "충분히 설명" ? MESSAGE_EXTRA[polite] : null,
    profile.length === "짧게" ? null : closing[polite],
  ];

  const concise = [
    `${greeting} ${config.concise[polite]}`,
    ...filledParts.map(([key, label]) => `- ${label}: ${values[key]}`),
    tailValue ? `- ${config.tail.label}: ${tailValue}` : null,
  ];

  const soft = [
    `${greeting} ${config.soft[polite]}`,
    body.join(" "),
    tailValue,
    softClosing[polite],
  ];

  const join = (lines) => lines.filter(Boolean).join("\n");

  return {
    variants: [
      { type: "mine", text: join(mine), evidence },
      { type: "concise", text: join(concise), evidence },
      { type: "soft", text: join(soft), evidence },
    ],
    reasons: [...MESSAGE_REASONS[card.id], `${recipient}에게 보내는 글이라 호칭과 말투를 거기에 맞췄어요.`],
  };
}
