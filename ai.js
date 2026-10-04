// 가짜 AI (목업). 나중에 실제 AI 호출로 바꿀 때 이 파일의 함수만 교체한다.
// 입출력 형식은 기획서 5-5와 동일하다.

// 시연용으로 준비해 둔 응답. 입력에 keyword가 들어 있으면 이 값을 쓴다.
const MOCK_PRESETS = {
  question: [
    {
      keyword: "재고평가충당금",
      fields: {
        상황: "재고평가충당금 계산이 맞지 않음",
        막힌지점: "당기 계산 금액이 맞지 않는 원인을 찾지 못함",
      },
    },
  ],
  request: [
    {
      keyword: "내일 오전 10시",
      fields: {
        요청내용: "작업 기한을 내일 오전 10시로 조정",
        기한: "내일 오전 10시",
        이유배경: "오늘 안에 끝내기 어려움",
      },
    },
  ],
  report: [
    {
      keyword: "조회서",
      fields: {
        완료한것: "매출채권 조회서 발송",
        진행중인것: "회신 대사",
      },
    },
  ],
};

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

// 카드별 문장 재료. [정상형(합니다체), 해요체] 순서.
const MESSAGE_PARTS = {
  question: {
    parts: [["상황", "상황"], ["해본것", "해본 것"], ["막힌지점", "막힌 지점"], ["선택지", "선택지"], ["내판단", "제 판단"]],
    tail: { key: "묻고싶은것", label: "질문" },
    opener: ["여쭤볼 게 있습니다.", "여쭤볼 게 있어요."],
    concise: ["질문 있습니다.", "질문 있어요."],
    soft: ["바쁘신 중에 죄송한데, 여쭤봐도 될까요?", "바쁘신 중에 죄송한데, 여쭤봐도 될까요?"],
  },
  request: {
    parts: [["요청내용", "요청"], ["기한", "기한"], ["필요한결과", "필요한 결과"], ["이유배경", "이유"], ["대안조건", "대안"]],
    tail: null,
    opener: ["부탁드릴 게 있습니다.", "부탁드릴 게 있어요."],
    concise: ["부탁드립니다.", "부탁드려요."],
    soft: ["바쁘신 중에 죄송한데, 부탁 하나만 드려도 될까요?", "바쁘신 중에 죄송한데, 부탁 하나만 드려도 될까요?"],
  },
  report: {
    parts: [["완료한것", "완료한 것"], ["진행중인것", "진행 중인 것"], ["막힌점", "막힌 점"], ["도움요청", "도움 요청"], ["다음예정", "다음 예정"]],
    tail: null,
    opener: ["진행 상황 보고드립니다.", "진행 상황 공유드려요."],
    concise: ["상황 보고드립니다.", "상황 공유드려요."],
    soft: ["진행 상황을 말씀드려도 괜찮을까요?", "진행 상황을 말씀드려도 괜찮을까요?"],
  },
};

const MESSAGE_GREETINGS = { 선배: "선배님,", 인차지: "인차지님,", 동기: "안녕하세요," };

// 요청 방식(내 말투 설정)에 따른 끝인사
const MESSAGE_CLOSINGS = {
  "직접적으로": ["답변 부탁드립니다.", "답변 부탁드려요."],
  "부드럽게": ["시간 되실 때 확인 부탁드립니다.", "시간 되실 때 확인 부탁드려요."],
  "매우 조심스럽게": [
    "바쁘신 중에 죄송하지만, 편하실 때 확인해 주시면 감사하겠습니다.",
    "바쁘신 중에 죄송하지만, 편하실 때 확인해 주시면 정말 감사해요.",
  ],
};

const MESSAGE_EXTRA = ["필요하시면 자료도 바로 공유드리겠습니다.", "필요하시면 자료도 바로 공유드릴게요."];

const MESSAGE_REASONS = {
  question: [
    "막힌 지점과 질문을 분명히 적어서 선배가 바로 답할 수 있게 했어요.",
    "해본 것을 먼저 보여 줘서 \"그래서 뭘 해봤어?\"라는 되물음을 줄였어요.",
  ],
  request: [
    "요청과 기한을 앞쪽에 두어서 무엇을 언제까지 해 달라는 건지 바로 보이게 했어요.",
    "이유와 대안을 함께 적어서 상대가 판단하기 쉽게 했어요.",
  ],
  report: [
    "완료한 것부터 적어서 지금 어디까지 왔는지 한눈에 보이게 했어요.",
    "막힌 점과 도움 요청을 나눠 적어서 상대가 무엇을 해 주면 되는지 알 수 있게 했어요.",
  ],
};

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
