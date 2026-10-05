// ⚠ 가짜 AI용 임시 데이터 ⚠
// 카드·입력 칸·받는 사람·버전 탭·온보딩·말투 옵션·화면 문구(uiCopy)는 data/cards.json에 있다. (콘텐츠팀 기준)
// 문구를 바꿀 때는 이 파일이 아니라 data/cards.json을 고친다.
//
// 이 파일에는 가짜 AI(ai.js)가 쓰는 임시 데이터만 둔다. 실제 AI를 붙이면 대부분 폐기 대상이다.
//   1. 구조화: 한 줄 입력에서 채울 칸, 키워드 샘플 응답
//   2. 메시지 문구: 문장 틀, 받는 사람별 인사 방식, 끝인사, 수정 이유
//   3. 화면 안내 문구 중 cards.json에 없는 것: 토스트, 오류 알림, 로딩 문구, 빈 목록 안내
//
// [연결용 이름이라 바꾸지 않는 것]
//   - 카드 id(question / request / status)와 칸 key(situation, tried, blocker …): cards.json과 같아야 한다
//   - 받는 사람 id(senior / incharge / peer / client), 요청 방식 id(direct / soft / careful)
// 이름이 어긋나면 브라우저 콘솔에 "[content.js]" 또는 "[cards.json]"으로 시작하는 오류가 뜬다.

// ===== 1. 구조화 (가짜 AI 호출 1) =====
// [임시] 샘플 데이터(data/malgyeol_sample_data.json)의 oneLine과 같은 입력이 오면 그 샘플의 fields를 참고하되,
// 한 줄에서 보통 알 수 있는 아래 칸만 채우고 나머지는 null로 둔다. (지어내지 않기 · 빈 필수 칸은 노란 칸으로 되묻기)
const STRUCTURIZE_FILL = {
  question: ["situation", "blocker"],
  request: ["request"],
  status: ["done"],
};

// [임시] 샘플 oneLine과 맞지 않을 때 쓰는 키워드 응답. 입력에 keywords 중 하나라도 있으면 fields를 쓴다. (위에서부터 먼저 맞는 것)
// 값을 쓸 때 요령: 문장으로 이어질 칸은 끝을 "~않음 / ~못함 / ~없음 / ~있음 / ~함 / ~됨 / ~임"으로 맞추면
// 2번 구역의 문장 틀이 "~않습니다 / ~못했습니다 …"로 자연스럽게 바꿔 준다. 그 밖의 칸은 짧은 명사구로 쓴다.
// 시연(cards.json demo)의 "재고평가충당금" 입력은 'tried'가 비어 나와야 한다.
const MOCK_PRESETS = {
  question: [
    {
      keywords: ["재고평가충당금"],
      fields: {
        situation: "재고평가충당금 계산이 맞지 않음",
        blocker: "당기 계산 금액이 맞지 않는 원인을 찾지 못함",
      },
    },
    {
      keywords: ["감가상각"],
      fields: {
        situation: "당기 감가상각비가 전기보다 크게 증가함",
        blocker: "증가 원인을 찾지 못함",
      },
    },
    {
      keywords: ["조회서"],
      fields: {
        situation: "조회서 회신이 오지 않은 거래처가 있음",
        blocker: "대체 절차를 어떻게 적용할지 정하지 못함",
      },
    },
    {
      keywords: ["표본", "샘플"],
      fields: {
        situation: "표본 추출 기준이 확정되지 않음",
        blocker: "모집단 범위를 어디까지 잡을지 판단하지 못함",
      },
    },
    {
      keywords: ["코멘트", "다시 보라"],
      fields: {
        situation: "조서 검토 코멘트를 반영했는데 재검토 요청을 받은 상태임",
        tried: "코멘트 반영",
        blocker: "추가로 보완할 부분을 파악하지 못함",
      },
    },
  ],
  request: [
    {
      keywords: ["내일 오전 10시"],
      fields: {
        request: "작업 기한 조정",
        deadline: "내일 오전 10시",
        reason: "오늘 안에 완료하기 어려운 상황",
      },
    },
    {
      keywords: ["실사 자료"],
      fields: {
        request: "재고 실사 자료 전달",
        deadline: "이번 주 금요일",
      },
    },
    {
      keywords: ["조서 검토"],
      fields: {
        request: "조서 검토",
        deadline: "월요일 오전",
      },
    },
    {
      keywords: ["미팅"],
      fields: {
        request: "거래처 미팅 일정 변경",
        deadline: "다음 주 화요일 오후",
      },
    },
    {
      keywords: ["시산표"],
      fields: {
        request: "시산표 전달",
        deliverable: "엑셀 파일",
      },
    },
  ],
  status: [
    {
      keywords: ["조회서"],
      fields: {
        done: "매출채권 조회서 발송",
        inProgress: "회신 대사",
      },
    },
    {
      keywords: ["실사 참관"],
      fields: {
        done: "재고 실사 참관",
        inProgress: "참관 결과 정리",
        nextEta: "오늘 중 정리 완료",
      },
    },
    {
      keywords: ["재계산", "고정자산"],
      fields: {
        done: "감가상각 재계산",
        blocker: "고정자산 대장 미수령",
        helpNeeded: "고정자산 대장 요청 전달",
      },
    },
    {
      keywords: ["법인세", "초안"],
      fields: {
        done: "법인세 조서 초안 작성",
        inProgress: "인차지 검토",
        nextEta: "검토 코멘트 반영",
      },
    },
  ],
};

// ===== 2. 메시지 문구 (가짜 AI 호출 2) =====
// [임시] 전부 가짜 AI용 문장 틀. 실제 AI를 붙이면 AI가 문장을 쓰므로 교체 대상이 아니라 폐기 대상이다.

// 카드별 문장 틀. [합니다체, 해요체] 쌍이거나, 둘이 같으면 문자열 하나.
//   opener / concise / soft : 인사 뒤에 붙는 첫 문장 (내 말투안 / 더 간결하게 / 더 부드럽게)
//   formalOpener : 가장 격식 있는 상대(클라이언트)에게 쓰는 첫 문장 (내 말투안 · 더 간결하게)
//   steps : { key: 칸 이름, tpl: 문장 틀 }. 위에서부터 차례로 이어 붙인다. 값이 없는 칸은 건너뛴다.
//   tail  : 마지막 줄에 그대로 쓰는 칸 (질문 준비실은 '묻고 싶은 것')
// 문장 틀 안의 자리표시자:
//   {v}  칸에 적힌 값 그대로
//   {p}  값을 문장으로 마무리한 형태 (~않음 → ~않습니다 / ~못함 → ~못했습니다 / ~함 → ~했습니다 등)
//   {은는} {이가} {을를} {으로로} {입니다}  바로 앞 값의 받침에 맞춰 조사·서술어가 바뀐다 (해요체면 이에요/예요)
const MESSAGE_FLOW = {
  question: {
    opener: ["여쭤볼 게 있습니다.", "여쭤볼 게 있어요."],
    formalOpener: "문의드릴 사항이 있어 연락드립니다.",
    concise: ["질문 있습니다.", "질문 있어요."],
    soft: "바쁘신 중에 죄송한데, 여쭤봐도 될까요?",
    steps: [
      { key: "situation", tpl: "{p}." },
      { key: "tried", tpl: ["먼저 {v}{을를} 해 봤습니다.", "먼저 {v}{을를} 해 봤어요."] },
      { key: "blocker", tpl: "그런데 {p}." },
      { key: "options", tpl: "선택지는 {v}{입니다}." },
      { key: "judgment", tpl: "제 판단으로는 {p}." },
    ],
    tail: "ask",
  },
  request: {
    opener: ["부탁드릴 게 있습니다.", "부탁드릴 게 있어요."],
    formalOpener: "요청드릴 사항이 있어 연락드립니다.",
    concise: ["부탁드립니다.", "부탁드려요."],
    soft: "바쁘신 중에 죄송한데, 부탁 하나만 드려도 될까요?",
    steps: [
      { key: "request", tpl: ["{v}{을를} 부탁드립니다.", "{v}{을를} 부탁드려요."] },
      { key: "deadline", tpl: "기한은 {v}{입니다}." },
      { key: "deliverable", tpl: "필요한 결과는 {v}{입니다}." },
      { key: "reason", tpl: "이유는 {v}{입니다}." },
      { key: "alternative", tpl: ["대안으로 {v}{이가} 가능합니다.", "대안으로 {v}{이가} 가능해요."] },
      { key: "consentNeeded", tpl: "(동의 필요 여부: {v})" },
    ],
    tail: null,
  },
  status: {
    opener: ["진행 상황 보고드립니다.", "진행 상황 공유드려요."],
    formalOpener: "진행 상황을 공유드립니다.",
    concise: ["상황 보고드립니다.", "상황 공유드려요."],
    soft: "진행 상황을 말씀드려도 괜찮을까요?",
    steps: [
      { key: "done", tpl: ["{v}{은는} 완료했습니다.", "{v}{은는} 완료했어요."] },
      { key: "inProgress", tpl: ["{v}{은는} 진행 중입니다.", "{v}{은는} 진행 중이에요."] },
      { key: "blocker", tpl: "막힌 점은 {v}{입니다}." },
      { key: "helpNeeded", tpl: ["{v}{을를} 부탁드립니다.", "{v}{을를} 부탁드려요."] },
      { key: "nextEta", tpl: "다음 예정은 {v}{입니다}." },
    ],
    tail: null,
  },
};

// 받는 사람별 인사 방식. 호칭은 cards.json partners의 honorific을 쓴다. (호칭이 비어 있으면 인사 없이 시작)
//   greeting : 호칭 앞뒤 형식. {h} 자리에 호칭이 들어간다
//   formal   : true면 가장 격식 있는 문체 — 말투 설정과 관계없이 합니다체, formalOpener, '직접적으로'도 '부드럽게' 끝인사
const PARTNER_STYLE = {
  senior: { greeting: "{h}," },
  incharge: { greeting: "{h}," },
  peer: { greeting: "{h}," },
  client: { greeting: "안녕하세요, {h}.", formal: true },
};

// 요청 방식(내 말투 설정 requestStyle)에 따른 끝인사
const MESSAGE_CLOSINGS = {
  direct: ["답변 부탁드립니다.", "답변 부탁드려요."],
  soft: ["시간 되실 때 확인 부탁드립니다.", "시간 되실 때 확인 부탁드려요."],
  careful: [
    "바쁘신 중에 죄송하지만, 편하실 때 확인해 주시면 감사하겠습니다.",
    "바쁘신 중에 죄송하지만, 편하실 때 확인해 주시면 정말 감사해요.",
  ],
};

// 문장 길이 '충분히 설명'일 때 끝인사 앞에 붙는 문장
const MESSAGE_EXTRA = ["필요하시면 자료도 바로 공유드리겠습니다.", "필요하시면 자료도 바로 공유드릴게요."];

const MESSAGE_REASONS = {
  question: [
    "막힌 지점과 질문을 분명히 적어서 상대가 바로 답할 수 있게 했어요.",
    "해본 것을 먼저 보여 줘서 \"그래서 뭘 해봤어?\"라는 되물음을 줄였어요.",
  ],
  request: [
    "요청과 기한을 앞쪽에 두어서 무엇을 언제까지 해 달라는 건지 바로 보이게 했어요.",
    "이유와 대안을 함께 적어서 상대가 판단하기 쉽게 했어요.",
  ],
  status: [
    "완료한 것부터 적어서 지금 어디까지 왔는지 한눈에 보이게 했어요.",
    "막힌 점과 도움 요청을 나눠 적어서 상대가 무엇을 해 주면 되는지 알 수 있게 했어요.",
  ],
};

// 받는 사람별 마지막 수정 이유 한 줄
const MESSAGE_RECIPIENT_REASON = (label) => `${label}에게 보내는 글이라 호칭과 말투를 거기에 맞췄어요.`;

// 가장 격식 있는 상대(클라이언트)에게 붙는 수정 이유
const MESSAGE_FORMAL_REASON = "회사 대 회사로 보내는 글이라 가장 격식 있는 합니다체로 맞췄어요.";

// 피하고 싶은 표현이 든 인사·끝인사 문장을 뺐을 때 붙는 수정 이유
const MESSAGE_AVOID_REASON = (words) => `피하고 싶은 표현(${words.join(", ")})이 들어간 문장은 빼고 만들었어요.`;

// ===== 3. 화면 안내 문구 (cards.json uiCopy에 없는 것) =====
// [임시] 토스트·오류 알림·로딩 문구. 제목·버튼 문구는 cards.json uiCopy에 있다.
const UI_TEXT = {
  loadingStructure: "정리하는 중…",
  loadingMessage: "만드는 중…",
  errorStructure: "정리하는 중 문제가 생겼어요. 다시 시도해 주세요.",
  errorMessage: "메시지를 만드는 중 문제가 생겼어요. 다시 시도해 주세요.",
  errorRegenerate: "다시 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
  errorSave: "저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.",
  errorDelete: "삭제하지 못했어요.",
  copied: "복사했어요.",
  copyFailed: "복사하지 못했어요. 직접 선택해서 복사해 주세요.",
  regenerated: "다시 만들었어요.",
  preferredSaved: "내 말투에 반영했어요.",
  settingSaved: "저장했어요.",
  onboardingApplied: "내 말투를 설정했어요.",
  preferredEmpty: "아직 반영한 문장이 없어요. 결과 화면에서 '이 표현을 내 말투에 반영'을 눌러 보세요.",
  deleteButton: "삭제",
};
