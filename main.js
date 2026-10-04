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
  bannerSkipped: "malgyeol.bannerSkipped",
};

// 화면 사이에 넘겨줄 상태
const state = {
  cardId: null,
  input: "",
  recipient: null,
  fields: {},
  followups: {},
};

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.hidden = screen.id !== `screen-${name}`;
  });
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

function makeMessage() {
  const card = currentCard();
  const lines = card.fields.map((field) => `${field.label}: ${state.fields[field.key] || "(비어 있음)"}`);
  $("result-debug").textContent = `받는 사람: ${state.recipient}\n${lines.join("\n")}`;
  showScreen("result");
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

  $("go-home").addEventListener("click", () => showScreen("home"));
  $("go-profile").addEventListener("click", () => showScreen("profile"));
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.go));
  });
});
