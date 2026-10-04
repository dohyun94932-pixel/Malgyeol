// 상황 카드 정의 (기획서 5-1)
const CARDS = [
  {
    id: "question",
    title: "질문 준비실",
    desc: "막혀서 선배에게 물어봐야 할 때",
    placeholder: "재고평가충당금 계산이 안 맞는데 선배한테 물어보고 싶어요",
  },
  {
    id: "request",
    title: "부탁 한 장",
    desc: "자료 요청이나 일정 조정을 부탁할 때",
    placeholder: "오늘까지 끝내기 어려워서 내일 오전 10시로 미뤄도 될지 여쭤보고 싶어요",
  },
  {
    id: "report",
    title: "한 줄 상황보고",
    desc: "진행 상황을 짧게 알려야 할 때",
    placeholder: "매출채권 조회서 발송은 끝났고 회신 대사는 진행 중이에요",
  },
];

const STORAGE_KEYS = {
  profile: "malgyeol.profile",
  bannerSkipped: "malgyeol.bannerSkipped",
};

// 화면 사이에 넘겨줄 상태
const state = {
  cardId: null,
  input: "",
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

function submitHome() {
  if (!state.cardId || !state.input) return;

  const card = CARDS.find((c) => c.id === state.cardId);
  $("structure-debug").textContent = `[${card.title}] ${state.input}`;
  showScreen("structure");
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

  $("go-home").addEventListener("click", () => showScreen("home"));
  $("go-profile").addEventListener("click", () => showScreen("profile"));
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.go));
  });
});
