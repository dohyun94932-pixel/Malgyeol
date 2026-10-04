const STORAGE_KEYS = {
  profile: "malgyeol.profile",
  preferred: "malgyeol.preferred",
  bannerSkipped: "malgyeol.bannerSkipped",
};

const MAX_PREFERRED = 5;

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
  input.placeholder = `${UI_TEXT.examplePrefix}${card.placeholder}`;
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
  const label = button.textContent;
  button.disabled = true;
  button.textContent = UI_TEXT.loadingStructure;

  try {
    const result = await structurize(card, state.input);
    state.fields = result.fields;
    state.followups = result.followups;
    state.recipient = null;
    renderStructure();
    showScreen("structure");
  } catch (error) {
    alert(UI_TEXT.errorStructure);
  } finally {
    button.textContent = label;
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
  const label = button.textContent;
  button.disabled = true;
  button.textContent = UI_TEXT.loadingMessage;

  try {
    await buildResult();
    showScreen("result");
  } catch (error) {
    alert(UI_TEXT.errorMessage);
  } finally {
    button.textContent = label;
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
    item.textContent = `${included ? "✓" : "⚠"} ${field.label} — ${included ? UI_TEXT.intentIncluded : UI_TEXT.intentMissing}`;
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
    showToast(UI_TEXT.copied);
  } catch (error) {
    textarea.select();
    const copied = document.execCommand("copy");
    showToast(copied ? UI_TEXT.copied : UI_TEXT.copyFailed);
  }
}

async function regenerate() {
  const button = $("regenerate");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = UI_TEXT.loadingMessage;

  try {
    await buildResult();
    showToast(UI_TEXT.regenerated);
  } catch (error) {
    showToast(UI_TEXT.errorRegenerate);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// 지금 보는 문장을 선호 문장으로 저장한다. 최근 5개만 남기고 같은 문장은 중복 저장하지 않는다.
function savePreferred() {
  const text = $("message-text").value.trim();
  if (!text) return;

  const list = [text, ...loadPreferred().filter((saved) => saved !== text)].slice(0, MAX_PREFERRED);
  try {
    localStorage.setItem(STORAGE_KEYS.preferred, JSON.stringify(list));
    showToast(UI_TEXT.preferredSaved);
  } catch (error) {
    showToast(UI_TEXT.errorSave);
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
    title.textContent = `${question.title} · ${UI_TEXT.onboardingAsk}`;
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
    showToast(UI_TEXT.errorSave, "profile-toast");
    return;
  }
  ONBOARDING.forEach((q) => delete onboardingAnswers[q.key]);
  renderProfile();
  showToast(UI_TEXT.onboardingApplied, "profile-toast");
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
          showToast(UI_TEXT.settingSaved, "profile-toast");
        } else {
          showToast(UI_TEXT.errorSave, "profile-toast");
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
    empty.textContent = UI_TEXT.preferredEmpty;
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
    remove.textContent = UI_TEXT.deleteButton;
    remove.addEventListener("click", () => {
      const next = loadPreferred().filter((_, i) => i !== index);
      try {
        localStorage.setItem(STORAGE_KEYS.preferred, JSON.stringify(next));
      } catch (error) {
        showToast(UI_TEXT.errorDelete, "profile-toast");
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

// ---------- content.js 검사 ----------
// 콘텐츠를 고치다가 서로 연결된 이름이 어긋나면 콘솔에 알려 준다. (화면 동작에는 영향 없음)

function validateContent() {
  const problems = [];
  const optionValues = Object.fromEntries(PROFILE_OPTIONS.map((o) => [o.key, o.values]));

  CARDS.forEach((card) => {
    const keys = card.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) problems.push(`${card.id}: 칸 key가 겹쳐요.`);

    (MOCK_PRESETS[card.id] || []).forEach((preset) => {
      Object.keys(preset.fields).forEach((key) => {
        if (!keys.includes(key)) problems.push(`샘플 응답(${card.id}): "${key}" 칸이 CARDS에 없어요.`);
      });
    });

    const config = MESSAGE_PARTS[card.id];
    if (!config) {
      problems.push(`MESSAGE_PARTS에 "${card.id}"가 없어요.`);
      return;
    }
    const used = [...config.parts.map((part) => part[0]), config.tail && config.tail.key].filter(Boolean);
    used.forEach((key) => {
      if (!keys.includes(key)) problems.push(`MESSAGE_PARTS(${card.id}): "${key}" 칸이 CARDS에 없어요.`);
    });
    card.fields.forEach((field) => {
      if (field.type !== "checkbox" && !used.includes(field.key)) {
        problems.push(`MESSAGE_PARTS(${card.id}): "${field.key}" 칸이 빠져 있어서 메시지에 안 들어가요.`);
      }
    });
    if (!MESSAGE_REASONS[card.id]) problems.push(`MESSAGE_REASONS에 "${card.id}"가 없어요.`);
  });

  ONBOARDING.forEach((question) => {
    question.options.forEach((option) => {
      if (!(optionValues[question.key] || []).includes(option.value)) {
        problems.push(`ONBOARDING(${question.key}): value "${option.value}"가 PROFILE_OPTIONS에 없어요.`);
      }
    });
  });

  Object.entries(DEFAULT_PROFILE).forEach(([key, value]) => {
    if (key !== "avoid" && !(optionValues[key] || []).includes(value)) {
      problems.push(`DEFAULT_PROFILE: ${key} 값 "${value}"가 PROFILE_OPTIONS에 없어요.`);
    }
  });

  (optionValues.request || []).forEach((value) => {
    if (!MESSAGE_CLOSINGS[value]) problems.push(`MESSAGE_CLOSINGS에 "${value}"가 없어요.`);
  });
  RECIPIENTS.forEach((name) => {
    if (!MESSAGE_GREETINGS[name]) problems.push(`MESSAGE_GREETINGS에 "${name}"가 없어요.`);
  });

  problems.forEach((message) => console.error(`[content.js] ${message}`));
}

// ---------- 시작 ----------

document.addEventListener("DOMContentLoaded", () => {
  validateContent();
  renderCards();
  initBanner();
  if (typeof initReviewBar === "function") initReviewBar(); // review.js가 있을 때만

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
