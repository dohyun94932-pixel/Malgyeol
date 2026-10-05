const STORAGE_KEYS = {
  profile: "malgyeol.profile",
  preferred: "malgyeol.preferred",
  bannerSkipped: "malgyeol.bannerSkipped",
};

const MAX_PREFERRED = 5;

// 화면 사이에 넘겨줄 상태
const state = {
  selectedCardId: null, // 홈에서 고른 카드 (안 고르면 null)
  cardId: null, // 화면 2·3에서 쓰는 카드
  usedDefaultCard: false,
  input: "",
  recipient: null,
  fields: {},
  followups: {},
  variants: [],
  reasons: [],
  activeVariant: 0,
};

// 저장된 말투를 읽는다. 예전 버전 값(없어진 선택지·항목)이 남아 있어도 지금 선택지에 있는 값만 쓴다.
function loadProfile() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.profile)) || {};
  } catch (error) {
    saved = {};
  }
  const profile = { ...DEFAULT_PROFILE };
  PROFILE_OPTIONS.forEach((option) => {
    if (option.values.includes(saved[option.key])) profile[option.key] = saved[option.key];
  });
  if (typeof saved.avoid === "string") profile.avoid = saved.avoid;
  return profile;
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
    return Array.isArray(list) ? list.filter((text) => typeof text === "string" && text.trim()) : [];
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
    button.innerHTML = `
      <span class="card-title">${card.title}</span>
      <span class="card-desc">${card.desc}</span>
    `;
    if (card.comingSoon) {
      button.classList.add("coming-soon");
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = UI_TEXT.comingSoonBadge;
      button.querySelector(".card-title").appendChild(badge);
      button.addEventListener("click", () => showToast(UI_TEXT.comingSoonToast, "home-toast"));
    } else {
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => selectCard(state.selectedCardId === card.id ? null : card.id));
    }
    list.appendChild(button);
  });
}

function randomExample(card) {
  const examples = card.examples && card.examples.length ? card.examples : [card.placeholder];
  return `${UI_TEXT.examplePrefix}${examples[Math.floor(Math.random() * examples.length)]}`;
}

// 카드는 골라도 되고 안 골라도 된다. 같은 카드를 다시 누르면 선택이 풀린다.
function selectCard(cardId) {
  state.selectedCardId = cardId;
  const card = CARDS.find((c) => c.id === cardId);

  document.querySelectorAll(".card:not(.coming-soon)").forEach((el) => {
    const selected = el.dataset.cardId === cardId;
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-pressed", String(selected));
  });

  const input = $("home-input");
  const selectedLine = $("home-selected");
  if (card) {
    selectedLine.textContent = `${UI_TEXT.selectedCard}${card.title}${UI_TEXT.selectedCardHint}`;
    selectedLine.hidden = false;
    input.placeholder = randomExample(card);
    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    selectedLine.hidden = true;
    input.placeholder = randomExample(defaultCard());
  }
  updateSubmitButton();
}

function updateSubmitButton() {
  state.input = $("home-input").value.trim();
  $("home-submit").disabled = !state.input;
}

function defaultCard() {
  return CARDS.find((c) => c.id === DEFAULT_CARD_ID);
}

async function submitHome() {
  if (!state.input) return;

  // 카드를 고르지 않았으면 기본 카드(질문 준비실)로 정리한다.
  state.usedDefaultCard = !state.selectedCardId;
  state.cardId = state.selectedCardId || DEFAULT_CARD_ID;

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
    state.variants = [];
    renderStructure();
    showScreen("structure");
  } catch (error) {
    alert(UI_TEXT.errorStructure);
  } finally {
    button.textContent = label;
    updateSubmitButton();
  }
}

// ---------- 화면 2 · 상황·의도 구체화 ----------

function currentCard() {
  return CARDS.find((c) => c.id === state.cardId);
}

function isFilled(field) {
  if (field.type === "checkbox") return true;
  return Boolean(state.fields[field.key] && String(state.fields[field.key]).trim());
}

function fieldLabel(field) {
  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = field.label;
  if (field.required) {
    const star = document.createElement("span");
    star.className = "required";
    star.textContent = " *";
    label.appendChild(star);
  } else if (field.type !== "checkbox") {
    const optional = document.createElement("span");
    optional.className = "optional";
    optional.textContent = UI_TEXT.optionalMark;
    label.appendChild(optional);
  }
  return label;
}

function fieldHint(field) {
  const hint = document.createElement("p");
  hint.className = "field-hint";
  hint.id = `hint-${field.key}`;
  return hint;
}

function renderStructure() {
  const card = currentCard();
  $("structure-card").textContent = card.title;
  $("structure-note").textContent = state.usedDefaultCard ? `${UI_TEXT.defaultCardNote} · ` : "";
  $("structure-input").textContent = `“${state.input}”`;

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
      wrap.append(fieldLabel(field), label);
    } else if (field.type === "choice") {
      // 선택지 중 하나를 고르는 칸 (예: 거절 / 부분 수락 / 대안 제시)
      const chips = document.createElement("div");
      chips.className = "chips";
      chips.setAttribute("role", "group");
      chips.setAttribute("aria-label", field.label);
      field.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip";
        button.textContent = option;
        button.addEventListener("click", () => {
          state.fields[field.key] = option;
          updateChoice(field);
          updateFieldState(field);
          updateMakeButton();
        });
        chips.appendChild(button);
      });
      wrap.append(fieldLabel(field), chips, fieldHint(field));
    } else {
      const label = fieldLabel(field);
      const labelTag = document.createElement("label");
      labelTag.htmlFor = `field-${field.key}`;
      labelTag.appendChild(label);

      const textarea = document.createElement("textarea");
      textarea.id = `field-${field.key}`;
      textarea.rows = 1;
      textarea.value = state.fields[field.key] || "";
      textarea.addEventListener("input", () => {
        state.fields[field.key] = textarea.value;
        autoGrow(textarea);
        updateFieldState(field);
        updateMakeButton();
      });

      wrap.append(labelTag, textarea, fieldHint(field));
    }

    list.appendChild(wrap);
    if (field.type === "choice") updateChoice(field);
    if (field.type !== "checkbox") updateFieldState(field);
  });

  // 화면이 보인 뒤에 높이를 재야 해서 다음 프레임에 맞춘다.
  requestAnimationFrame(() => list.querySelectorAll("textarea").forEach(autoGrow));
  updateMakeButton();
}

// 칸 안의 글이 길어지면 상자 높이를 늘린다.
function autoGrow(textarea) {
  textarea.style.height = "auto";
  const border = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = `${textarea.scrollHeight + border}px`;
}

function updateChoice(field) {
  document.querySelectorAll(`.field[data-key="${field.key}"] .chip`).forEach((button) => {
    const selected = state.fields[field.key] === button.textContent;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
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

// 비어 있는 칸은 노란색 + 되묻는 질문으로 표시한다. (필수 칸만 버튼을 막는다)
// 글 칸은 되묻는 질문을 칸 안(값 자리)에 보여 주고, 고르는 칸은 아래 줄에 보여 준다.
function updateFieldState(field) {
  const wrap = document.querySelector(`.field[data-key="${field.key}"]`);
  const hint = $(`hint-${field.key}`);
  const textarea = $(`field-${field.key}`);
  const question = isFilled(field) ? "" : state.followups[field.key] || field.question || "";

  wrap.classList.toggle("missing", Boolean(question) || (field.required && !isFilled(field)));
  if (textarea) {
    textarea.placeholder = state.followups[field.key] || field.question || "";
    hint.textContent = "";
  } else {
    hint.textContent = question;
  }
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
  state.activeVariant = Math.min(state.activeVariant, result.variants.length - 1);
  renderResult();
}

async function makeMessage() {
  const button = $("make-message");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = UI_TEXT.loadingMessage;

  try {
    state.activeVariant = 0;
    await buildResult();
    showScreen("result");
  } catch (error) {
    alert(UI_TEXT.errorMessage);
  } finally {
    button.textContent = label;
    updateMakeButton();
  }
}

// ---------- 화면 3 · 표현 비교 + 의도 확인 ----------

function renderResult() {
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
    button.textContent = VARIANT_LABELS[variant.type] || variant.type;
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
  const box = $("message-text");
  box.value = state.variants[state.activeVariant].text;
  requestAnimationFrame(() => autoGrow(box)); // 화면이 보인 뒤 글 길이에 맞춰 높이를 늘린다
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
    const mark = document.createElement("span");
    mark.className = "check-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = included ? "✓" : "⚠";
    const label = document.createElement("span");
    label.textContent = `${field.label} — ${included ? UI_TEXT.intentIncluded : UI_TEXT.intentMissing}`;
    item.append(mark, label);
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

// 지금 보는 문장을 선호 예문으로 저장한다. 최근 5개만 남기고 같은 문장은 중복 저장하지 않는다.
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
// 저장 전까지 바꾼 값. [저장]을 눌러야 localStorage에 들어간다.
let profileDraft = { ...DEFAULT_PROFILE };

function renderProfile() {
  const hasProfile = Boolean(localStorage.getItem(STORAGE_KEYS.profile));
  const skipped = Boolean(localStorage.getItem(STORAGE_KEYS.bannerSkipped));
  $("onboarding").hidden = hasProfile || skipped;
  syncProfileTitle();
  $("profile-back-result").hidden = state.variants.length === 0;

  profileDraft = loadProfile();
  renderOnboarding();
  renderSettings();
  renderPreferred();
}

// 첫 방문 질문이 보일 때는 "어느 쪽이 나답나요?", 아니면 설정 제목을 보여 준다.
function syncProfileTitle() {
  const onboarding = !$("onboarding").hidden;
  $("profile-title-onboarding").hidden = !onboarding;
  $("profile-title-settings").hidden = onboarding;
}

function renderOnboarding() {
  const wrap = $("onboarding-questions");
  wrap.innerHTML = "";

  ONBOARDING.forEach((question) => {
    const block = document.createElement("div");
    block.className = "question";
    block.setAttribute("role", "group");
    block.setAttribute("aria-label", `${question.title} · ${UI_TEXT.onboardingAsk}`);

    const title = document.createElement("h3");
    title.className = "question-title";
    title.textContent = question.title;
    block.appendChild(title);

    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      const selected = onboardingAnswers[question.key] === option.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.textContent = option.text;

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
  syncProfileTitle();
}

function reopenOnboarding() {
  ONBOARDING.forEach((q) => delete onboardingAnswers[q.key]);
  renderOnboarding();
  $("onboarding").hidden = false;
  syncProfileTitle();
  $("onboarding").scrollIntoView({ behavior: "smooth" });
}

function isProfileChanged() {
  const saved = loadProfile();
  return Object.keys(saved).some((key) => saved[key] !== profileDraft[key]);
}

function updateProfileSaveButton() {
  $("profile-save").disabled = !isProfileChanged();
}

function renderSettings() {
  const wrap = $("profile-settings");
  wrap.innerHTML = "";

  PROFILE_OPTIONS.forEach((option) => {
    const group = document.createElement("div");
    group.className = "setting";

    const title = document.createElement("span");
    title.className = "block-label";
    title.textContent = option.label;
    group.appendChild(title);

    const chips = document.createElement("div");
    chips.className = "segmented";
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", option.label);
    option.values.forEach((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "segment";
      button.textContent = value;
      const selected = profileDraft[option.key] === value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.addEventListener("click", () => {
        profileDraft = { ...profileDraft, [option.key]: value };
        renderSettings();
        if (isProfileChanged()) showToast(UI_TEXT.profileUnsaved, "profile-toast");
      });
      chips.appendChild(button);
    });
    group.appendChild(chips);
    wrap.appendChild(group);
  });

  $("profile-avoid").value = profileDraft.avoid;
  updateProfileSaveButton();
}

function saveProfileDraft() {
  if (saveProfile({ ...profileDraft, avoid: profileDraft.avoid.trim() })) {
    profileDraft = loadProfile();
    renderSettings();
    showToast(UI_TEXT.profileSaved, "profile-toast");
  } else {
    showToast(UI_TEXT.errorSave, "profile-toast");
  }
}

function renderPreferred() {
  const list = $("preferred-list");
  list.innerHTML = "";
  const preferred = loadPreferred();
  $("preferred-count").textContent = preferred.length ? `(${preferred.length})` : "";

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
    remove.className = "text-button";
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

  const fallback = CARDS.find((card) => card.id === DEFAULT_CARD_ID);
  if (!fallback || fallback.comingSoon) {
    problems.push(`DEFAULT_CARD_ID "${DEFAULT_CARD_ID}"가 CARDS에 없거나 준비 중 카드예요.`);
  }

  CARDS.forEach((card) => {
    if (card.comingSoon) return; // 준비 중 카드는 입력 칸·문장 틀이 없다.

    const keys = card.fields.map((f) => f.key);
    const fieldOf = (key) => card.fields.find((f) => f.key === key);
    if (new Set(keys).size !== keys.length) problems.push(`${card.id}: 칸 key가 겹쳐요.`);

    card.fields.forEach((field) => {
      if (field.type === "choice" && !(Array.isArray(field.options) && field.options.length)) {
        problems.push(`${card.id}: 고르는 칸 "${field.key}"에 options가 없어요.`);
      }
    });

    const presets = MOCK_PRESETS[card.id] || [];
    presets.forEach((preset) => {
      if (!Array.isArray(preset.keywords) || preset.keywords.length === 0) {
        problems.push(`샘플 응답(${card.id}): keywords가 비어 있어요.`);
      }
      Object.entries(preset.fields).forEach(([key, value]) => {
        const field = fieldOf(key);
        if (!field) problems.push(`샘플 응답(${card.id}): "${key}" 칸이 CARDS에 없어요.`);
        else if (field.type === "choice" && !(field.options || []).includes(value)) {
          problems.push(`샘플 응답(${card.id}): "${key}" 값 "${value}"가 options에 없어요.`);
        }
      });
    });

    // 예시 문장을 넣으면 샘플 응답이 걸리는지 (안 걸리면 입력 전체가 첫 칸에만 들어간다)
    (card.examples || []).forEach((example) => {
      if (!presets.some((p) => (p.keywords || []).some((word) => example.includes(word)))) {
        problems.push(`예시 문장(${card.id}): "${example}"에 맞는 샘플 응답 keywords가 없어요.`);
      }
    });

    const flow = MESSAGE_FLOW[card.id];
    if (!flow) {
      problems.push(`MESSAGE_FLOW에 "${card.id}"가 없어요.`);
      return;
    }
    if (!flow.opener) problems.push(`MESSAGE_FLOW(${card.id}): opener가 없어요.`);
    const lead = flow.clear && Array.isArray(flow.clear.lead) ? flow.clear.lead : null;
    if (!lead) problems.push(`MESSAGE_FLOW(${card.id}): clear.lead가 없어요.`);

    const allSteps = [...flow.steps, ...(lead || [])];
    const used = [...allSteps.map((step) => step.key), flow.tail].filter(Boolean);
    used.forEach((key) => {
      if (!keys.includes(key)) problems.push(`MESSAGE_FLOW(${card.id}): "${key}" 칸이 CARDS에 없어요.`);
    });
    card.fields.forEach((field) => {
      if (field.type !== "checkbox" && !used.includes(field.key)) {
        problems.push(`MESSAGE_FLOW(${card.id}): "${field.key}" 칸이 빠져 있어서 메시지에 안 들어가요.`);
      }
    });
    allSteps.forEach((step) => {
      const field = fieldOf(step.key);
      if (!field || field.type !== "choice") return;
      (field.options || []).forEach((option) => {
        if (!step.tpl || !step.tpl[option]) {
          problems.push(`MESSAGE_FLOW(${card.id}): "${step.key}" 문장 틀에 선택지 "${option}"가 없어요.`);
        }
      });
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
    if (!MESSAGE_CLOSINGS_SHORT[value]) problems.push(`MESSAGE_CLOSINGS_SHORT에 "${value}"가 없어요.`);
  });
  RECIPIENTS.forEach((name) => {
    if (!MESSAGE_GREETINGS[name]) problems.push(`MESSAGE_GREETINGS에 "${name}"가 없어요.`);
  });
  ["concise", "soft", "clear"].forEach((type) => {
    if (!VARIANT_LABELS[type]) problems.push(`VARIANT_LABELS에 "${type}"가 없어요.`);
  });

  problems.forEach((message) => console.error(`[content.js] ${message}`));
}

// ---------- 시작 ----------

document.addEventListener("DOMContentLoaded", () => {
  validateContent();
  renderCards();
  selectCard(null);
  initBanner();
  if (typeof initReviewBar === "function") initReviewBar(); // review.js가 있을 때만

  $("home-input").addEventListener("input", updateSubmitButton);
  $("home-submit").addEventListener("click", submitHome);
  $("home-profile").addEventListener("click", () => showScreen("profile"));
  $("make-message").addEventListener("click", makeMessage);

  $("message-text").addEventListener("input", () => {
    state.variants[state.activeVariant].text = $("message-text").value;
    autoGrow($("message-text"));
    renderIntentCheck();
  });
  $("copy-message").addEventListener("click", copyMessage);
  $("regenerate").addEventListener("click", regenerate);
  $("save-preferred").addEventListener("click", savePreferred);

  $("onboarding-apply").addEventListener("click", applyOnboarding);
  $("onboarding-skip").addEventListener("click", skipOnboarding);
  $("onboarding-reopen").addEventListener("click", reopenOnboarding);
  $("profile-avoid").addEventListener("input", () => {
    profileDraft = { ...profileDraft, avoid: $("profile-avoid").value };
    updateProfileSaveButton();
  });
  $("profile-save").addEventListener("click", saveProfileDraft);

  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.go));
  });
});
