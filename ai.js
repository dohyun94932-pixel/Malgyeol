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
