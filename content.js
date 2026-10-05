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
// 수정 이유 문구는 data/cards.json의 reasons에 있다 (콘텐츠팀이 고친다).
//
// 문장 틀은 [합니다체, 해요체, 반말] 세 칸이다. 둘째·셋째가 없으면 앞 칸을 쓴다. (반말은 동기에게만 쓴다)
// 칸 값은 ai.js가 모양을 먼저 판별한다.
//   완성 문장(…니다. / …요. / …주세요.)·질문(…?) : 문장 틀에 끼우지 않고 그대로 쓴다. 앞에 connector만 붙이고 끝맺음만 맞춘다.
//   명사구 : noun 틀 (값이 nounIf의 re에 맞으면 그 틀)
//   메모체(~함·~음·~됨) : memo 틀 (없으면 "{c}{p}.")
//   "~지"형(가능한지 불가능한지) : ji 틀 (없으면 noun 틀)
// 문장 틀 안의 자리표시자:
//   {v}  칸에 적힌 값 그대로        {p}  메모체를 문장으로 마무리한 형태 (~않음 → ~않습니다 / ~않아요 / ~않아)
//   {c}  connector(연결어) + 띄어쓰기  {은는} {이가} {을를} {으로로} {입니다}  앞 값의 받침과 끝맺음에 맞춰 바뀐다
//
// 카드별로
//   opener      : 내 말투안의 첫 문장. 요청 방식(direct / soft / careful)마다 다르다
//   formalOpener: 가장 격식 있는 상대(클라이언트)에게 쓰는 첫 문장 (내 말투안 · 더 간결하게)
//   concise     : 더 간결하게의 첫 문장 / soft: 더 부드럽게의 첫 문장
//   steps       : 칸 순서대로 이어 붙인다. 값이 없는 칸은 건너뛴다 (빈 칸은 문장에서도 빠진다 · B1)
//   tail        : 마지막 문장으로 쓰는 칸 (질문 준비실의 '묻고 싶은 것' · B2)
const MESSAGE_FLOW = {
  question: {
    opener: {
      direct: ["질문드립니다.", "질문드려요.", "질문 하나만 할게."],
      soft: ["여쭤볼 게 있습니다.", "여쭤볼 게 있어요.", "물어볼 게 있어."],
      careful: ["바쁘신 중에 죄송하지만, 여쭤볼 게 있습니다.", "바쁘신 중에 죄송하지만, 여쭤볼 게 있어요.", "바쁜데 미안, 물어볼 게 있어."],
    },
    formalOpener: "문의드릴 사항이 있어 연락드립니다.",
    concise: ["질문 있습니다.", "질문 있어요.", "질문 하나 있어."],
    soft: ["바쁘신 중에 죄송한데, 여쭤봐도 될까요?", "바쁘신 중에 죄송한데, 여쭤봐도 될까요?", "바쁜데 미안, 하나 물어봐도 돼?"],
    steps: [
      { key: "situation", noun: "{v}{입니다}." },
      { key: "tried", connector: "먼저", noun: ["먼저 {v}{을를} 해 봤습니다.", "먼저 {v}{을를} 해 봤어요.", "먼저 {v}{을를} 해 봤어."] },
      { key: "blocker", connector: ["다만", "다만", "근데"], noun: ["다만 {v}에서 막혔습니다.", "다만 {v}에서 막혔어요.", "근데 {v}에서 막혔어."] },
      { key: "options", noun: "선택지는 {v}{입니다}." },
      {
        key: "judgment",
        // 반말 문장은 보통 "~생각해"로 끝나서 "내 생각엔"을 붙이면 겹친다 → 반말은 연결어 없음
        connector: ["제 판단으로는", "제 판단으로는", ""],
        noun: ["제 판단으로는 {v}{이가} 맞다고 생각합니다.", "제 판단으로는 {v}{이가} 맞다고 생각해요.", "내 생각엔 {v}{이가} 맞는 것 같아."],
      },
    ],
    tail: {
      key: "ask",
      noun: ["{v} 부탁드립니다.", "{v} 부탁드려요.", "{v} 부탁해."],
      ji: ["{v} 여쭤보고 싶습니다.", "{v} 여쭤보고 싶어요.", "{v} 궁금해."],
    },
  },
  request: {
    opener: {
      direct: ["부탁드릴 일이 있습니다.", "부탁드릴 일이 있어요.", "부탁할 게 있어."],
      soft: ["혹시 부탁 하나 드려도 될까요?", "혹시 부탁 하나 드려도 될까요?", "혹시 부탁 하나 해도 돼?"],
      careful: ["바쁘신 중에 죄송하지만, 부탁 하나만 드려도 될까요?", "바쁘신 중에 죄송하지만, 부탁 하나만 드려도 될까요?", "바쁜데 미안한데, 부탁 하나만 해도 될까?"],
    },
    formalOpener: "요청드릴 사항이 있어 연락드립니다.",
    concise: ["부탁드립니다.", "부탁드려요.", "부탁할게."],
    soft: ["바쁘신 중에 죄송한데, 부탁 하나만 드려도 될까요?", "바쁘신 중에 죄송한데, 부탁 하나만 드려도 될까요?", "바쁜데 미안, 부탁 하나 해도 될까?"],
    steps: [
      { key: "request", noun: ["{v}{을를} 부탁드립니다.", "{v}{을를} 부탁드려요.", "{v} 부탁해."] },
      // 이유는 요청 바로 뒤에 둔다 ("…해 주셨으면 좋겠습니다. X사 업무의 과중 때문입니다.")
      { key: "reason", noun: ["{v} 때문입니다.", "{v} 때문이에요.", "{v} 때문이야."] },
      { key: "deadline", noun: "기한은 {v}{입니다}." },
      {
        key: "deliverable",
        noun: "필요한 결과는 {v}{입니다}.",
        ji: ["{v} 알려 주시면 감사하겠습니다.", "{v} 알려 주시면 감사해요.", "{v} 알려 줘."],
      },
      { key: "alternative", noun: ["대안으로 {v}{이가} 가능합니다.", "대안으로 {v}{이가} 가능해요.", "대안으로 {v}{이가} 가능해."] },
      { key: "consentNeeded", noun: "(상대 확인: {v})" },
    ],
    tail: null,
  },
  status: {
    opener: {
      direct: ["진행 상황 보고드립니다.", "진행 상황 보고드려요.", "진행 상황 공유할게."],
      soft: ["진행 상황 공유드립니다.", "진행 상황 공유드려요.", "진행 상황 공유할게."],
      careful: ["바쁘신 중에 죄송하지만, 진행 상황 공유드립니다.", "바쁘신 중에 죄송하지만, 진행 상황 공유드려요.", "바쁜데 미안, 진행 상황 공유할게."],
    },
    formalOpener: "진행 상황을 공유드립니다.",
    concise: ["상황 보고드립니다.", "상황 공유드려요.", "상황 공유할게."],
    soft: ["진행 상황을 말씀드려도 괜찮을까요?", "진행 상황을 말씀드려도 괜찮을까요?", "진행 상황 잠깐 공유해도 될까?"],
    steps: [
      { key: "done", noun: ["{v}{은는} 완료했습니다.", "{v}{은는} 완료했어요.", "{v}{은는} 끝냈어."] },
      { key: "inProgress", noun: ["{v}{은는} 진행 중입니다.", "{v}{은는} 진행 중이에요.", "{v}{은는} 하는 중이야."] },
      { key: "blocker", connector: ["다만", "다만", "근데"], noun: ["다만 {v}{으로로} 막혀 있습니다.", "다만 {v}{으로로} 막혀 있어요.", "근데 {v}{으로로} 막혀 있어."] },
      { key: "helpNeeded", noun: ["{v}{을를} 부탁드립니다.", "{v}{을를} 부탁드려요.", "{v} 부탁해."] },
      {
        key: "nextEta",
        noun: ["{v} 예정입니다.", "{v} 예정이에요.", "{v} 예정이야."],
        nounIf: [{ re: /(?:예상|예정|가능|완료)$/, tpl: "{v}{입니다}." }],
      },
    ],
    tail: null,
  },
};

// 인차지(결론 먼저)에게 맨 앞으로 옮기는 '결론' 칸. 질문 준비실은 '묻고 싶은 것'이 마지막(B2)이라 '내 판단'을 앞에 둔다.
const LEAD_FIELD = { question: "judgment", request: "request", status: "done" };

// 받는 사람별 인사 방식. 호칭은 cards.json partners의 honorific을 쓴다. (호칭이 비어 있으면 인사 없이 시작)
//   greeting : {h} 자리에 호칭이 들어간다
//   ending   : 말투 설정보다 우선하는 끝맺음 (banmal = 반말 · hamnida = 합니다체)
//   formal   : 가장 격식 있는 문체 — formalOpener, '직접적으로'도 '부드럽게' 끝인사, 질문도 "~습니까?"로
//   leadFirst: 결론(LEAD_FIELD)을 맨 앞에
// [확인 필요] 동기 반말 · 클라이언트 합니다체 고정은 팀 확정 전 임시안 (docs/decision-log.md)
const PARTNER_STYLE = {
  senior: { greeting: "{h}," },
  incharge: { greeting: "{h},", leadFirst: true },
  peer: { greeting: "{h},", ending: "banmal" },
  client: { greeting: "안녕하세요, {h}.", ending: "hamnida", formal: true },
};

// 앱이 붙이는 요청 끝인사. 요청을 담은 칸(부탁 한 장 '요청 내용', 상황보고 '도움 요청')이 명사구로 채워졌을 때만 붙는다.
// 그 칸이 이미 요청·질문 문장이거나, 질문 준비실이면 붙이지 않는다. (B1)
const CLOSING_FIELD = { question: null, request: "request", status: "helpNeeded" };

// 요청 방식(내 말투 설정 requestStyle)에 따른 끝인사
const MESSAGE_CLOSINGS = {
  direct: ["확인 부탁드립니다.", "확인 부탁드려요.", "확인 부탁해."],
  soft: ["시간 되실 때 확인 부탁드립니다.", "시간 되실 때 확인 부탁드려요.", "시간 될 때 봐 줘."],
  careful: [
    "바쁘신 중에 죄송하지만, 편하실 때 확인해 주시면 감사하겠습니다.",
    "바쁘신 중에 죄송하지만, 편하실 때 확인해 주시면 정말 감사해요.",
    "바쁜데 미안, 편할 때 봐 줘.",
  ],
};

// 급한 기한(오늘·지금·바로·내일 오전 등)일 때 끝인사 — "시간 되실 때"처럼 여유 있는 말은 쓰지 않는다. (B1)
const URGENT_RE = /오늘|지금|바로|급히|즉시|금일|내일 오전/;
const MESSAGE_CLOSINGS_URGENT = {
  direct: ["확인 부탁드립니다.", "확인 부탁드려요.", "확인 부탁해."],
  soft: ["확인해 주시면 감사하겠습니다.", "확인해 주시면 감사해요.", "확인해 주면 고마워."],
  careful: [
    "바쁘신 중에 죄송하지만, 확인해 주시면 감사하겠습니다.",
    "바쁘신 중에 죄송하지만, 확인해 주시면 정말 감사해요.",
    "바쁜데 미안, 확인해 주면 고마워.",
  ],
};

// 문장 길이 '충분히 설명'일 때 끝인사(또는 질문) 앞에 붙는 문장 (동기에게는 짧게 쓰려고 붙이지 않는다)
const MESSAGE_EXTRA = ["필요하시면 자료도 바로 공유드리겠습니다.", "필요하시면 자료도 바로 공유드릴게요.", "필요하면 자료도 바로 보내 줄게."];

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
