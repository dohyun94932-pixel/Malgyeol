// 상황 카드 정의 (기획서 5-1)
const CARDS = [
  {
    id: "question",
    title: "질문 준비실",
    desc: "막혀서 선배에게 물어봐야 할 때",
    placeholder: "재고평가충당금 계산이 안 맞는데 선배한테 물어보고 싶어요",
    fields: [
      { key: "상황", label: "상황", required: true, question: "어떤 상황인가요?" },
      { key: "해본것", label: "해본 것", required: true, question: "어떤 걸 먼저 확인해 보셨나요?" },
      { key: "막힌지점", label: "막힌 지점", required: true, question: "어디서 막혔나요?" },
      { key: "선택지", label: "선택지", required: false },
      { key: "내판단", label: "내 판단", required: false },
      { key: "묻고싶은것", label: "묻고 싶은 것", required: true, question: "선배에게 정확히 무엇을 묻고 싶으신가요?" },
    ],
  },
  {
    id: "request",
    title: "부탁 한 장",
    desc: "자료 요청이나 일정 조정을 부탁할 때",
    placeholder: "오늘까지 끝내기 어려워서 내일 오전 10시로 미뤄도 될지 여쭤보고 싶어요",
    fields: [
      { key: "요청내용", label: "요청 내용", required: true, question: "무엇을 부탁하고 싶으신가요?" },
      { key: "기한", label: "기한", required: true, question: "언제까지 필요한가요?" },
      { key: "필요한결과", label: "필요한 결과(형태)", required: false },
      { key: "이유배경", label: "이유·배경", required: false },
      { key: "대안조건", label: "대안·조건", required: false },
      { key: "동의필요", label: "상대 동의 필요 여부", required: false, type: "checkbox", checkLabel: "상대 동의가 필요해요" },
    ],
  },
  {
    id: "report",
    title: "한 줄 상황보고",
    desc: "진행 상황을 짧게 알려야 할 때",
    placeholder: "매출채권 조회서 발송은 끝났고 회신 대사는 진행 중이에요",
    fields: [
      { key: "완료한것", label: "완료한 것", required: true, question: "어디까지 끝내셨나요?" },
      { key: "진행중인것", label: "진행 중인 것", required: false },
      { key: "막힌점", label: "막힌 점", required: false },
      { key: "도움요청", label: "도움 요청", required: false },
      { key: "다음예정", label: "다음 예정·완료 예상 시점", required: false },
    ],
  },
];

const RECIPIENTS = ["선배", "인차지", "동기"];

const STORAGE_KEYS = {
  profile: "malgyeol.profile",
  preferred: "malgyeol.preferred",
  bannerSkipped: "malgyeol.bannerSkipped",
};

const MAX_PREFERRED = 5;

// 건너뛴 경우의 기본 말투 (기획서 5-4)
const DEFAULT_PROFILE = { length: "보통", request: "부드럽게", ending: "합니다체", avoid: "" };

// 말투 설정 선택지 (기획서 5-4)
const PROFILE_OPTIONS = [
  { key: "length", label: "문장 길이", values: ["짧게", "보통", "충분히 설명"] },
  { key: "request", label: "요청 방식", values: ["직접적으로", "부드럽게", "매우 조심스럽게"] },
  { key: "ending", label: "끝맺음", values: ["합니다체", "해요체"] },
];

// 온보딩: 같은 뜻의 두 문장 중 고르면 설정값으로 바로 바뀐다. (AI 없이 규칙으로 매핑)
const ONBOARDING = [
  {
    key: "length",
    title: "1. 문장 길이",
    options: [
      { text: "재고평가충당금 건으로 질문드립니다. 전기 산식은 확인했고, 당기 데이터에서 막혀 있습니다.", value: "짧게" },
      {
        text: "재고평가충당금 계산이 맞지 않아 여쭤봅니다. 전기 산식을 먼저 확인했고 당기 재고 데이터도 다시 봤는데 원인을 찾지 못했습니다. 두 가지 방식 중 A가 맞다고 생각합니다.",
        value: "충분히 설명",
      },
    ],
  },
  {
    key: "request",
    title: "2. 요청 방식",
    options: [
      { text: "내일 오전 10시까지 확인 부탁드립니다.", value: "직접적으로" },
      { text: "바쁘시겠지만 시간 되실 때 확인해 주시면 감사하겠습니다.", value: "부드럽게" },
    ],
  },
  {
    key: "ending",
    title: "3. 끝맺음",
    options: [
      { text: "확인해 보았습니다. 내일까지 드리겠습니다.", value: "합니다체" },
      { text: "확인해 봤어요. 내일까지 드릴게요.", value: "해요체" },
    ],
  },
];

const VARIANT_LABELS = { mine: "내 말투안", concise: "더 간결하게", soft: "더 부드럽게" };

// 화면 사이에 넘겨줄 상태
const state = {
  cardId: null,
  input: "",
  recipient: null,
  fields: {},
  followups: {},
  variants: [],
  reasons: [],
  activeVariant: 0,
};

function loadProfile() {
  try {
    return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.profile)) };
  } catch (error) {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
    $("profile-banner").hidden = true;
    return true;
  } catch (error) {
    return false;
  }
}

function loadPreferred() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.preferred));
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.hidden = screen.id !== `screen-${name}`;
  });
  if (name === "profile") renderProfile();
  window.scrollTo(0, 0);
}

// ---------- 화면 1 · 홈 ----------

function renderCards() {
  const list = $("card-list");
  list.innerHTML = "";

  CARDS.forEach((card) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.dataset.cardId = card.id;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `
      <span class="card-title">${card.title}</span>
      <span class="card-desc">${card.desc}</span>
    `;
    button.addEventListener("click", () => selectCard(card.id));
    list.appendChild(button);
  });
}

function selectCard(cardId) {
  state.cardId = cardId;
  const card = CARDS.find((c) => c.id === cardId);

  document.querySelectorAll(".card").forEach((el) => {
    const selected = el.dataset.cardId === cardId;
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-pressed", String(selected));
  });

  const input = $("home-input");
  input.disabled = false;
  input.placeholder = `예: ${card.placeholder}`;
  input.focus();
  updateSubmitButton();
}

function updateSubmitButton() {
  state.input = $("home-input").value.trim();
  $("home-submit").disabled = !(state.cardId && state.input);
}

async function submitHome() {
  if (!state.cardId || !state.input) return;

  const card = currentCard();
  const button = $("home-submit");
  button.disabled = true;
  button.textContent = "정리하는 중…";

  try {
    const result = await structurize(card, state.input);
    state.fields = result.fields;
    state.followups = result.followups;
    state.recipient = null;
    renderStructure();
    showScreen("structure");
  } catch (error) {
    alert("정리하는 중 문제가 생겼어요. 다시 시도해 주세요.");
  } finally {
    button.textContent = "정리하기";
    updateSubmitButton();
  }
}

// ---------- 화면 2 · 구조화 확인 ----------

function currentCard() {
  return CARDS.find((c) => c.id === state.cardId);
}

function isFilled(field) {
  if (field.type === "checkbox") return true;
  return Boolean(state.fields[field.key] && String(state.fields[field.key]).trim());
}

function renderStructure() {
  const card = currentCard();
  $("structure-card").textContent = card.title;
  $("structure-input").textContent = state.input;

  renderRecipients();

  const list = $("field-list");
  list.innerHTML = "";

  card.fields.forEach((field) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.dataset.key = field.key;

    if (field.type === "checkbox") {
      const label = document.createElement("label");
      label.className = "check-label";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = Boolean(state.fields[field.key]);
      box.addEventListener("change", () => {
        state.fields[field.key] = box.checked;
      });
      label.append(box, ` ${field.checkLabel}`);
      const title = document.createElement("span");
      title.className = "field-label";
      title.textContent = field.label;
      wrap.append(title, label);
    } else {
      const label = document.createElement("label");
      label.className = "field-label";
      label.htmlFor = `field-${field.key}`;
      label.textContent = field.label;
      if (field.required) {
        const star = document.createElement("span");
        star.className = "required";
        star.textContent = " *";
        label.appendChild(star);
      }

      const textarea = document.createElement("textarea");
      textarea.id = `field-${field.key}`;
      textarea.rows = 2;
      textarea.value = state.fields[field.key] || "";
      textarea.addEventListener("input", () => {
        state.fields[field.key] = textarea.value;
        updateFieldState(field);
        updateMakeButton();
      });

      const hint = document.createElement("p");
      hint.className = "field-hint";
      hint.id = `hint-${field.key}`;

      wrap.append(label, textarea, hint);
    }

    list.appendChild(wrap);
    if (field.type !== "checkbox") updateFieldState(field);
  });

  updateMakeButton();
}

function renderRecipients() {
  const group = $("recipient-list");
  group.innerHTML = "";

  RECIPIENTS.forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = name;
    button.setAttribute("aria-pressed", String(state.recipient === name));
    button.classList.toggle("selected", state.recipient === name);
    button.addEventListener("click", () => {
      state.recipient = name;
      renderRecipients();
      updateMakeButton();
    });
    group.appendChild(button);
  });
}

// 비어 있는 필수 칸은 노란색 + 되묻는 질문으로 표시한다.
function updateFieldState(field) {
  const wrap = document.querySelector(`.field[data-key="${field.key}"]`);
  const hint = $(`hint-${field.key}`);
  const missing = field.required && !isFilled(field);

  wrap.classList.toggle("missing", missing);
  hint.textContent = missing ? state.followups[field.key] || field.question : "";
}

function updateMakeButton() {
  const card = currentCard();
  const allFilled = card.fields.every((field) => !field.required || isFilled(field));
  $("make-message").disabled = !(state.recipient && allFilled);
}

// 호출 2(메시지 생성)를 부르고 결과 상태를 채운다.
async function buildResult() {
  const result = await generateMessages({
    card: currentCard(),
    fields: state.fields,
    recipient: state.recipient,
    profile: loadProfile(),
    preferred: loadPreferred(),
  });
  state.variants = result.variants;
  state.reasons = result.reasons;
  state.activeVariant = 0;
  renderResult();
}

async function makeMessage() {
  const button = $("make-message");
  button.disabled = true;
  button.textContent = "만드는 중…";

  try {
    await buildResult();
    showScreen("result");
  } catch (error) {
    alert("메시지를 만드는 중 문제가 생겼어요. 다시 시도해 주세요.");
  } finally {
    button.textContent = "메시지 만들기";
    updateMakeButton();
  }
}

// ---------- 화면 3 · 결과 ----------

function renderResult() {
  $("result-card").textContent = currentCard().title;
  $("result-recipient").textContent = state.recipient;

  renderVariantTabs();
  showVariant();

  const reasons = $("reason-list");
  reasons.innerHTML = "";
  state.reasons.forEach((reason) => {
    const item = document.createElement("li");
    item.textContent = reason;
    reasons.appendChild(item);
  });
}

function renderVariantTabs() {
  const tabs = $("variant-tabs");
  tabs.innerHTML = "";

  state.variants.forEach((variant, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.setAttribute("role", "tab");
    button.textContent = VARIANT_LABELS[variant.type];
    button.classList.toggle("selected", index === state.activeVariant);
    button.setAttribute("aria-selected", String(index === state.activeVariant));
    button.addEventListener("click", () => {
      state.activeVariant = index;
      renderVariantTabs();
      showVariant();
    });
    tabs.appendChild(button);
  });
}

function showVariant() {
  $("message-text").value = state.variants[state.activeVariant].text;
  renderIntentCheck();
}

// 의도 체크: 사용자가 확정한 칸마다 AI가 준 근거 구절이 본문에 실제로 있는지 문자열로 확인한다.
function renderIntentCheck() {
  const variant = state.variants[state.activeVariant];
  const text = $("message-text").value;
  const list = $("intent-list");
  list.innerHTML = "";

  currentCard().fields.forEach((field) => {
    if (field.type === "checkbox" || !isFilled(field)) return;

    const phrase = variant.evidence[field.key];
    const included = Boolean(phrase) && text.includes(phrase);

    const item = document.createElement("li");
    item.className = included ? "check-ok" : "check-warn";
    item.textContent = `${included ? "✓" : "⚠"} ${field.label} — ${included ? "포함됨" : "누락 가능"}`;
    list.appendChild(item);
  });
}

let toastTimer = null;

function showToast(message, targetId = "result-toast") {
  const clearAll = () => document.querySelectorAll(".toast").forEach((el) => (el.textContent = ""));
  clearAll();
  $(targetId).textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(clearAll, 2500);
}

async function copyMessage() {
  const textarea = $("message-text");
  try {
    await navigator.clipboard.writeText(textarea.value);
    showToast("복사했어요.");
  } catch (error) {
    textarea.select();
    const copied = document.execCommand("copy");
    showToast(copied ? "복사했어요." : "복사하지 못했어요. 직접 선택해서 복사해 주세요.");
  }
}

async function regenerate() {
  const button = $("regenerate");
  button.disabled = true;
  button.textContent = "만드는 중…";

  try {
    await buildResult();
    showToast("다시 만들었어요.");
  } catch (error) {
    showToast("다시 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  } finally {
    button.disabled = false;
    button.textContent = "다시 만들기";
  }
}

// 지금 보는 문장을 선호 문장으로 저장한다. 최근 5개만 남기고 같은 문장은 중복 저장하지 않는다.
function savePreferred() {
  const text = $("message-text").value.trim();
  if (!text) return;

  const list = [text, ...loadPreferred().filter((saved) => saved !== text)].slice(0, MAX_PREFERRED);
  try {
    localStorage.setItem(STORAGE_KEYS.preferred, JSON.stringify(list));
    showToast("내 말투에 반영했어요.");
  } catch (error) {
    showToast("저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.");
  }
}

// ---------- 화면 4 · 내 말투 ----------

const onboardingAnswers = {};

function renderProfile() {
  const hasProfile = Boolean(localStorage.getItem(STORAGE_KEYS.profile));
  const skipped = Boolean(localStorage.getItem(STORAGE_KEYS.bannerSkipped));
  $("onboarding").hidden = hasProfile || skipped;

  renderOnboarding();
  renderSettings();
  renderPreferred();
}

function renderOnboarding() {
  const wrap = $("onboarding-questions");
  wrap.innerHTML = "";

  ONBOARDING.forEach((question) => {
    const block = document.createElement("div");
    block.className = "question";

    const title = document.createElement("h3");
    title.className = "question-title";
    title.textContent = `${question.title} · 어느 쪽이 나답나요?`;
    block.appendChild(title);

    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      const selected = onboardingAnswers[question.key] === option.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));

      const mark = document.createElement("strong");
      mark.textContent = index === 0 ? "A" : "B";
      button.append(mark, ` ${option.text}`);

      button.addEventListener("click", () => {
        onboardingAnswers[question.key] = option.value;
        renderOnboarding();
      });
      block.appendChild(button);
    });

    wrap.appendChild(block);
  });

  $("onboarding-apply").disabled = !ONBOARDING.every((q) => onboardingAnswers[q.key]);
}

function applyOnboarding() {
  const saved = saveProfile({ ...loadProfile(), ...onboardingAnswers });
  if (!saved) {
    showToast("저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.", "profile-toast");
    return;
  }
  ONBOARDING.forEach((q) => delete onboardingAnswers[q.key]);
  renderProfile();
  showToast("내 말투를 설정했어요.", "profile-toast");
}

function skipOnboarding() {
  localStorage.setItem(STORAGE_KEYS.bannerSkipped, "1");
  $("profile-banner").hidden = true;
  $("onboarding").hidden = true;
}

function reopenOnboarding() {
  ONBOARDING.forEach((q) => delete onboardingAnswers[q.key]);
  renderOnboarding();
  $("onboarding").hidden = false;
  $("onboarding").scrollIntoView({ behavior: "smooth" });
}

function renderSettings() {
  const profile = loadProfile();
  const wrap = $("profile-settings");
  wrap.innerHTML = "";

  PROFILE_OPTIONS.forEach((option) => {
    const group = document.createElement("div");
    group.className = "setting";

    const title = document.createElement("span");
    title.className = "field-label";
    title.textContent = option.label;
    group.appendChild(title);

    const chips = document.createElement("div");
    chips.className = "chips";
    option.values.forEach((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = value;
      const selected = profile[option.key] === value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.addEventListener("click", () => {
        if (saveProfile({ ...loadProfile(), [option.key]: value })) {
          renderSettings();
          showToast("저장했어요.", "profile-toast");
        } else {
          showToast("저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.", "profile-toast");
        }
      });
      chips.appendChild(button);
    });
    group.appendChild(chips);
    wrap.appendChild(group);
  });

  $("profile-avoid").value = profile.avoid;
}

function renderPreferred() {
  const list = $("preferred-list");
  list.innerHTML = "";
  const preferred = loadPreferred();

  if (preferred.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "아직 반영한 문장이 없어요. 결과 화면에서 '이 표현을 내 말투에 반영'을 눌러 보세요.";
    list.appendChild(empty);
    return;
  }

  preferred.forEach((text, index) => {
    const item = document.createElement("li");
    item.className = "preferred-item";

    const body = document.createElement("p");
    body.textContent = text;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary small";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => {
      const next = loadPreferred().filter((_, i) => i !== index);
      try {
        localStorage.setItem(STORAGE_KEYS.preferred, JSON.stringify(next));
      } catch (error) {
        showToast("삭제하지 못했어요.", "profile-toast");
        return;
      }
      renderPreferred();
    });

    item.append(body, remove);
    list.appendChild(item);
  });
}

function initBanner() {
  const hasProfile = localStorage.getItem(STORAGE_KEYS.profile);
  const skipped = localStorage.getItem(STORAGE_KEYS.bannerSkipped);
  $("profile-banner").hidden = Boolean(hasProfile || skipped);

  $("banner-setup").addEventListener("click", () => showScreen("profile"));
  $("banner-skip").addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEYS.bannerSkipped, "1");
    $("profile-banner").hidden = true;
  });
}

// ---------- 시작 ----------

document.addEventListener("DOMContentLoaded", () => {
  renderCards();
  initBanner();

  $("home-input").addEventListener("input", updateSubmitButton);
  $("home-submit").addEventListener("click", submitHome);
  $("make-message").addEventListener("click", makeMessage);

  $("message-text").addEventListener("input", () => {
    state.variants[state.activeVariant].text = $("message-text").value;
    renderIntentCheck();
  });
  $("copy-message").addEventListener("click", copyMessage);
  $("regenerate").addEventListener("click", regenerate);
  $("save-preferred").addEventListener("click", savePreferred);

  $("onboarding-apply").addEventListener("click", applyOnboarding);
  $("onboarding-skip").addEventListener("click", skipOnboarding);
  $("onboarding-reopen").addEventListener("click", reopenOnboarding);
  $("profile-avoid").addEventListener("input", () => {
    saveProfile({ ...loadProfile(), avoid: $("profile-avoid").value });
  });

  $("go-home").addEventListener("click", () => showScreen("home"));
  $("go-profile").addEventListener("click", () => showScreen("profile"));
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.go));
  });
});
