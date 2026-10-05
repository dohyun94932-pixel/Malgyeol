// AI 호출 (브라우저 쪽). structurize()·generateMessages()가 서버 함수(api/ · Gemini)를 부르고,
// 실패하면(서버 오류·시간 초과·호출 한도 429·형식 오류·네트워크 끊김) 아래 가짜 AI(mock…) 결과로 자동 대체한다.
// 주소에 ?mock 을 붙이면 항상 가짜 AI를 쓴다 (시연 비상용). 키는 서버에만 있고 이 파일에는 없다.
//
// 가짜 AI (목업): 대체용으로 남겨 둔다.
// 이 파일에는 로직만 둔다. 문장 틀은 content.js, 카드·칸·받는 사람·수정 이유 문구는 data/cards.json,
// 샘플은 data/malgyeol_sample_data.json을 쓴다. (main.js가 불러 DATA · SAMPLE_DATA에 넣는다)
// 입출력 형식은 코딩 레퍼런스 2장(8절 데이터·저장)과 기획안 10장 기준.

const MOCK_DELAY_MS = 500;

// 띄어쓰기·문장부호를 뺀 비교용 문자열
function normalizeLine(text) {
  return String(text || "").replace(/[\s.,!?~·]/g, "");
}

// 입력이 샘플의 한 줄(oneLine)과 같은지. 한쪽이 다른 쪽을 포함해도 같다고 본다.
function findSample(card, input) {
  const target = normalizeLine(input);
  if (target.length < 6) return null;
  const samples = (typeof SAMPLE_DATA !== "undefined" && SAMPLE_DATA && SAMPLE_DATA.samples) || [];
  return (
    samples.find((sample) => {
      if (sample.cardId !== card.id) return false;
      const line = normalizeLine(sample.oneLine);
      return line === target || line.includes(target) || target.includes(line);
    }) || null
  );
}

// 가짜 AI 호출 1 · 구조화
// 입력: card(cards.json의 카드), input(한 줄)
// 출력: { fields: {칸키: 값 또는 null}, followups: {칸키: 되묻는 질문} }
// 한 줄에서 알 수 있는 칸만 채우고 나머지는 null로 둔다. 지어내지 않는다.
async function mockStructurize(card, input) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const fields = {};
  card.fields.forEach((field) => {
    fields[field.key] = null;
  });

  const sample = findSample(card, input);
  const preset = (MOCK_PRESETS[card.id] || []).find((p) => p.keywords.some((word) => input.includes(word)));

  if (sample) {
    // 샘플과 같은 한 줄이면, 한 줄에서 보통 알 수 있는 칸만 샘플 값으로 채운다.
    (STRUCTURIZE_FILL[card.id] || []).forEach((key) => {
      if (sample.fields[key]) fields[key] = sample.fields[key];
    });
  } else if (preset) {
    Object.assign(fields, preset.fields);
  } else {
    // 준비된 응답이 없으면 입력 전체를 첫 칸에만 넣는다.
    fields[card.fields[0].key] = input;
  }

  // 비어 있는 필수 칸만 되묻는다. (코딩 레퍼런스 2장: 빈 필수 칸만 노란 강조)
  const followups = {};
  card.fields.forEach((field) => {
    if (field.required && !fields[field.key]) followups[field.key] = field.followUp;
  });

  return { fields, followups };
}

// ---------- 문장 다듬기 도우미 ----------
// 끝맺음 번호(form): 0 = 합니다체 · 1 = 해요체 · 2 = 반말(동기)

// 한글 한 글자를 초성·중성·종성 번호로 나누고 다시 합친다. (종성 0 = 받침 없음, 8 = ㄹ, 17 = ㅂ, 20 = ㅆ)
const HANGUL_BASE = 0xac00;
function isHangul(ch) {
  const code = String(ch || "").charCodeAt(0);
  return code >= HANGUL_BASE && code <= 0xd7a3;
}
function splitJamo(ch) {
  const n = ch.charCodeAt(0) - HANGUL_BASE;
  return { cho: Math.floor(n / 588), jung: Math.floor((n % 588) / 28), jong: n % 28 };
}
function joinJamo(cho, jung, jong) {
  return String.fromCharCode(HANGUL_BASE + cho * 588 + jung * 28 + jong);
}
function jongOf(ch) {
  return isHangul(ch) ? splitJamo(ch).jong : -1;
}
function withJong(ch, jong) {
  const j = splitJamo(ch);
  return joinJamo(j.cho, j.jung, jong);
}

// 마지막 글자에 받침이 있는지. 숫자는 읽는 소리 기준(영·일·삼·육·칠·팔은 받침 있음).
function hasBatchim(word) {
  const ch = String(word).trim().slice(-1);
  if (!ch) return false;
  if (isHangul(ch)) return splitJamo(ch).jong !== 0;
  return "013678".includes(ch);
}

function endsWithRieul(word) {
  return jongOf(String(word).trim().slice(-1)) === 8;
}

function resolveParticle(token, word, form) {
  const batchim = hasBatchim(word);
  switch (token) {
    case "은는":
      return batchim ? "은" : "는";
    case "이가":
      return batchim ? "이" : "가";
    case "을를":
      return batchim ? "을" : "를";
    case "으로로":
      return batchim && !endsWithRieul(word) ? "으로" : "로";
    case "입니다":
      return ["입니다", batchim ? "이에요" : "예요", batchim ? "이야" : "야"][form];
    default:
      return "";
  }
}

// 메모처럼 적힌 끝(~함 · ~음 · ~임 · ~됨)을 문장 끝으로 바꾸는 규칙은 content.js의 TONE_TABLE.memo에 있다.
const PREDICATE_RULES = TONE_TABLE.memo;

// 두 글의 같은 앞부분. 의도 체크 근거 구절은 끝맺음을 바꾼 뒤에도 본문에 그대로 남는 이 앞부분을 쓴다.
function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const prefix = a.slice(0, i).trimEnd();
  return prefix.length >= Math.min(4, a.length) ? prefix : b;
}

// 메모체 규칙 하나가 값에 맞는지 ('~음'은 앞 글자에 받침이 있을 때만: 많음 O / 다음 X)
function memoRuleFor(value) {
  return PREDICATE_RULES.find((rule) => {
    if (!value.endsWith(rule.suffix) || value.length === rule.suffix.length) return false;
    const stem = value.slice(0, -rule.suffix.length);
    if (rule.stemRe && !rule.stemRe.test(stem)) return false;
    return !rule.stem || hasBatchim(stem);
  });
}

// 반환: { text: 문장 끝까지 바뀐 값, evidence: 바뀌고 난 뒤에도 본문에 그대로 남는 앞부분 }
// fact: 사실을 말하는 칸이면 규칙의 fact 형태(있으면)를 쓴다. '내 판단' 칸은 forms(생각 표현).
function toPredicate(value, form, fact) {
  const rule = memoRuleFor(value);
  if (!rule) return { text: value, evidence: value };
  const stem = value.slice(0, -rule.suffix.length);
  let text;
  if (rule.copula) text = stem + resolveParticle("입니다", stem, form);
  else if (rule.stem) text = form === 0 ? `${stem}습니다` : convertDeclarative(`${stem}습니다`, form) || `${stem}습니다`;
  else text = stem + (fact && rule.fact ? rule.fact : rule.forms)[form];
  return { text, evidence: commonPrefix(value, text) };
}

const TEMPLATE_TOKEN = /\{(v|p|은는|이가|을를|으로로|입니다)\}/g;

// 문장 틀 하나를 값으로 채운다. evidence는 의도 체크가 본문에서 찾을 구절이다.
function renderTemplate(template, value, form, fact) {
  let last = "";
  let evidence = value;

  const text = template.replace(TEMPLATE_TOKEN, (_, token) => {
    if (token === "v") {
      last = value;
      evidence = value;
      return value;
    }
    if (token === "p") {
      const result = toPredicate(value, form, fact);
      last = result.text;
      evidence = result.evidence;
      return result.text;
    }
    return resolveParticle(token, last, form);
  });

  // 값이 ?/! 로 끝나면 틀의 마침표는 뺀다.
  return { text: text.replace(/([?!])\./g, "$1"), evidence };
}

// 문장 끝 마침표와 공백만 정리한다. (?와 !는 그대로 둔다)
function cleanValue(value) {
  return String(value || "").trim().replace(/[.\s]+$/, "");
}

// '특별히 막힌 점은 없습니다'처럼 값이 있어도 '없음'을 뜻하는 칸 (수정 이유에서 언급하지 않고, 연결어도 붙이지 않는다)
const MEANS_NONE_RE = /^(?:특별히|별다른|딱히|특이 ?사항).*(?:없|않)|^(?:없음|해당 없음|없습니다)\.?$/;

// ---------- 칸 값의 모양 판별 ----------
// question(…?) / sentence(완성 문장) / ji("~지"형) / memo(~함·~음) / noun(명사구)
const SENTENCE_END_RE = /(?:니다|[어아여해세게에네죠래워줘봐돼려]요|겠어|었어|았어|했어|있어|없어|줘)$/;
const JI_END_RE = /(?:는지|은지|인지|한지|할지|을지|일지|던지|될지|된지)$/;

// 물음표가 없어도 질문 끝(~나요 · ~까요 · ~습니까)이면 질문으로 본다 ("어떻게 해야하나요" → 질문)
const QUESTION_END_RE = /(?:나요|까요|가요|니까|는지요|을까|ㄹ까)$/;

function classifyValue(value) {
  const v = String(value).trim();
  if (/\?$/.test(v) || QUESTION_END_RE.test(v.replace(/[.!\s]+$/, ""))) return "question";
  const body = v.replace(/[.!\s]+$/, "");
  if (JI_END_RE.test(body)) return "ji";
  if (/[.!]$/.test(v) || SENTENCE_END_RE.test(body)) return "sentence";
  if (memoRuleFor(body)) return "memo";
  return "noun";
}

// ---------- 끝맺음 맞추기 (메시지 한 통 = 문체 하나) ----------
// 끝맺음 번호(form): 0 = 합니다체 · 1 = 해요체 · 2 = 반말. 변환 표는 content.js의 TONE_TABLE.
// 표에 없는 끝은 아래 기본 규칙(받침으로 바꾸기)으로 바꾸고, 그래도 안 되면 그대로 둔다.

// 이 문장 끝이 이미 정한 문체인지. 합니다체 의문문은 "~ㄹ까요?"도 허용 (팀 결정 10/05)
const BANMAL_END_RE = /(?:어|아|해|돼|야|줘|봐|와|워|려|겨|라|러|게|래|까|나|지|자|네|군)$/;
function toneValid(body, isQuestion, form) {
  if (form === 0) return /(?:니다|니까|십시오)$/.test(body) || (isQuestion && /까요$/.test(body));
  if (form === 1) return /요$/.test(body);
  return BANMAL_END_RE.test(body) && !/요$/.test(body);
}

// 표의 한 칸을 실제 끝 글자 목록으로 ({이에요} → 이에요·예요, {이야} → 이야·야)
function expandEnding(ending) {
  if (ending === "{이에요}") return ["이에요", "예요"];
  if (ending === "{이야}") return ["이야", "야"];
  return [ending];
}
function resolveEnding(ending, stem) {
  if (ending === "{이에요}") return hasBatchim(stem) ? "이에요" : "예요";
  if (ending === "{이야}") return hasBatchim(stem) ? "이야" : "야";
  return ending;
}

// 표에서 가장 긴 끝을 찾아 정한 문체로 바꾼다. 반환: null(표에 없음) 또는 { body, punct, changed }
function tableEnding(body, rows, form) {
  let best = null;
  rows.forEach((row) => {
    const members = [];
    row.forms.forEach((ending, tone) => expandEnding(ending).forEach((e) => members.push({ e, tone, valid: tone === form })));
    (row.also || []).forEach((list, tone) => list.forEach((e) => members.push({ e, tone, valid: tone === form })));
    members.forEach((m) => {
      if (body.endsWith(m.e) && (!best || m.e.length > best.m.e.length)) best = { row, m };
    });
  });
  if (!best) return null;
  if (best.m.valid) return { body, punct: null, changed: false };
  const stem = body.slice(0, body.length - best.m.e.length);
  return { body: stem + resolveEnding(best.row.forms[form], stem), punct: best.row.punct ? best.row.punct[form] : null, changed: true };
}

// 받침 없는 마지막 글자(base)를 해요체 어간으로 (요를 붙이기 전). pre는 그 앞 글자들
function haeyoStem(pre, base) {
  if (base === "하") return `${pre}해`;
  if (base === "되") return `${pre}돼`;
  if (base === "시") return `${pre}세`;
  if (base === "르" && isHangul(pre.slice(-1))) {
    // 르 불규칙: 다르 → 달라, 부르 → 불러
    const p = pre.slice(-1);
    return pre.slice(0, -1) + withJong(p, 8) + ([0, 8].includes(splitJamo(p).jung) ? "라" : "러");
  }
  const { cho, jung } = splitJamo(base);
  const next = { 8: 9, 13: 14, 20: 6, 18: 4, 11: 10 }[jung]; // ㅗ→ㅘ ㅜ→ㅝ ㅣ→ㅕ ㅡ→ㅓ ㅚ→ㅙ
  if (next !== undefined) return pre + joinJamo(cho, next, 0);
  if (jung === 16 || jung === 19) return `${pre}${base}어`; // ㅟ·ㅢ: 바뀌어, 띄어
  return pre + base; // ㅏ ㅓ ㅐ ㅔ ㅕ 등은 그대로 (가요, 서요, 내요)
}

// 합니다체(…니다) → 해요체. 바꿀 수 없으면 null
function toHaeyo(body) {
  if (body.endsWith("습니다")) {
    const stem = body.slice(0, -3);
    const last = stem.slice(-1);
    if (!isHangul(last)) return null;
    const { jung, jong } = splitJamo(last);
    if (jong === 20) return `${stem}어요`; // 했습니다 → 했어요
    if (jong === 17) return `${stem.slice(0, -1)}${withJong(last, 0)}워요`; // 어렵습니다 → 어려워요
    return stem + ([0, 2, 8].includes(jung) ? "아요" : "어요"); // 같습니다 → 같아요, 없습니다 → 없어요
  }
  if (body.endsWith("니다")) {
    const stem = body.slice(0, -2);
    const last = stem.slice(-1);
    if (jongOf(last) !== 17) return null;
    const base = withJong(last, 0);
    const pre = stem.slice(0, -1);
    if (base === "이") return pre + (hasBatchim(pre) ? "이에요" : "예요"); // 중입니다 → 중이에요
    return `${haeyoStem(pre, base)}요`; // 합니다 → 해요, 드립니다 → 드려요, 바뀝니다 → 바뀌어요
  }
  return null;
}

// 해요체(…요) → 합니다체. 바꿀 수 없으면 null
function toHamnida(body) {
  if (/(?:이에요|예요)$/.test(body)) return body.replace(/(?:이에요|예요)$/, "입니다");
  if (body.endsWith("세요")) return `${body.slice(0, -2)}십니다`;
  if (!body.endsWith("요")) return null;
  const core = body.slice(0, -1);
  const last = core.slice(-1);
  const pre = core.slice(0, -1);
  const prev = pre.slice(-1);
  if (last === "어" || last === "아") {
    if (!isHangul(prev)) return null;
    return hasBatchim(prev) ? `${pre}습니다` : `${pre.slice(0, -1)}${withJong(prev, 17)}니다`; // 좋겠어요 → 좋겠습니다, 바뀌어요 → 바뀝니다
  }
  if (last === "해") return `${pre}합니다`;
  if (last === "돼") return `${pre}됩니다`;
  if (last === "게" && jongOf(prev) === 8) return `${pre.slice(0, -1)}${withJong(prev, 0)}겠습니다`; // 드릴게요 → 드리겠습니다
  if (!isHangul(last) || splitJamo(last).jong !== 0) return null;
  const { cho, jung } = splitJamo(last);
  if (cho === 11 && jung === 14 && isHangul(prev)) return `${pre.slice(0, -1)}${withJong(prev, 17)}습니다`; // 어려워요 → 어렵습니다
  const back = { 9: 8, 14: 13, 6: 20, 10: 11 }[jung]; // ㅘ→ㅗ ㅝ→ㅜ ㅕ→ㅣ ㅙ→ㅚ
  if (back === undefined && ![0, 1, 4, 5].includes(jung)) return null;
  return `${pre}${joinJamo(cho, back === undefined ? jung : back, 17)}니다`; // 드려요 → 드립니다, 봐요 → 봅니다
}

// 해요체 → 반말. 바꿀 수 없으면 null
function toBanmal(body) {
  if (body.endsWith("이에요")) return `${body.slice(0, -3)}이야`;
  if (body.endsWith("예요")) return `${body.slice(0, -2)}야`;
  if (body.endsWith("세요")) return null;
  return body.endsWith("요") ? body.slice(0, -1) : null;
}

// 평서문 기본 규칙. 바꿀 수 없으면 null
function convertDeclarative(body, form) {
  let out = null;
  if (body.endsWith("니다")) {
    const haeyo = toHaeyo(body);
    out = form === 0 ? body : haeyo && (form === 1 ? haeyo : toBanmal(haeyo));
  } else if (body.endsWith("요")) {
    out = form === 1 ? body : form === 0 ? toHamnida(body) : toBanmal(body);
  } else if (/(?:어|아|해|돼|줘|봐|와|워|려|겨)$/.test(body)) {
    const haeyo = `${body}요`;
    out = form === 2 ? body : form === 1 ? haeyo : toHamnida(haeyo);
  }
  return out && toneValid(out, false, form) ? out : null;
}

// 어간 + ㄹ까 (되 → 될까, 남기 → 남길까, 있 → 있을까)
function addKka(stem) {
  const last = stem.slice(-1);
  if (!isHangul(last)) return `${stem}까`;
  const jong = splitJamo(last).jong;
  if (jong === 0) return `${stem.slice(0, -1)}${withJong(last, 8)}까`;
  return jong === 8 ? `${stem}까` : `${stem}을까`;
}

// 의문문 기본 규칙. 합니다체·반말은 "~ㄹ까(요)?"로, 해요체는 "~나요?"도 그대로. 바꿀 수 없으면 null
function convertQuestionBody(body, form) {
  let stem = null;
  let m;
  if ((m = body.match(/^(.+)나요$/))) stem = m[1];
  else if ((m = body.match(/^(.+)습니까$/))) stem = m[1];
  else if ((m = body.match(/^(.+)니까$/)) && jongOf(m[1].slice(-1)) === 17) stem = m[1].slice(0, -1) + withJong(m[1].slice(-1), 0);
  let out = null;
  if (stem) out = addKka(stem) + (form === 2 ? "" : "요");
  else if (/까요$/.test(body)) out = form === 2 ? body.slice(0, -1) : body;
  else if (/까$/.test(body)) out = form === 2 ? body : `${body}요`;
  else if (/(?:어|아|해|돼)요$/.test(body)) out = form === 2 ? body.slice(0, -1) : null;
  else if (/(?:어|아|해|돼)$/.test(body)) {
    if (form === 2) out = body;
    else if (form === 1) out = `${body}요`;
    else if (/해$/.test(body)) out = `${body.slice(0, -1)}할까요`;
    else if (/돼$/.test(body)) out = `${body.slice(0, -1)}될까요`;
    else if (isHangul(body.slice(-2, -1)) && hasBatchim(body.slice(-2, -1))) out = `${body.slice(0, -1)}을까요`; // 괜찮아 → 괜찮을까요
  }
  if (out && form === 2) {
    // 반말에서는 높임을 뺀다 (주실 → 줄, 하실 → 할, 부탁드려도 → 부탁해도)
    out = out.replace(/주실/g, "줄").replace(/하실/g, "할").replace(/드려도 /g, "해도 ");
  }
  return out && toneValid(out, true, form) ? out : null;
}

// 문장 하나의 끝맺음을 정한 문체로. 반환: { text, status: changed | same | unknown | skip }
function convertSentence(sentence, form) {
  const m = String(sentence).match(/^([\s\S]*?)([.?!]*)$/);
  const body = m[1].trimEnd();
  const punct = m[2];
  // 한글로 끝나지 않는 줄(괄호 등)과 인사("안녕하세요, 담당자님.")는 문장 끝맺음이 아니라서 그대로 둔다.
  if (!body || !isHangul(body.slice(-1)) || /님$/.test(body)) return { text: sentence, status: "skip" };
  const isQuestion = punct.includes("?");
  const rows = isQuestion ? TONE_TABLE.question : [...TONE_TABLE.request, ...TONE_TABLE.statement];
  const hit = tableEnding(body, rows, form);
  if (hit) return { text: hit.body + (hit.punct || punct || "."), status: hit.changed ? "changed" : "same" };
  if (toneValid(body, isQuestion, form)) return { text: sentence, status: "same" };
  const out = isQuestion ? convertQuestionBody(body, form) : convertDeclarative(body, form);
  if (out) return { text: out + (punct || "."), status: "changed" };
  return { text: sentence, status: "unknown" };
}

// 마지막 단계: 메시지 전체의 모든 문장을 나눠 끝맺음을 정한 문체로 맞춘다.
// 목록 줄("- 기한: …")은 값이 완성 문장·질문일 때만 바꾸고(마침표 없이), 괄호 줄은 그대로 둔다.
function unifyTone(text, form) {
  return polishText(convertTone(text, form), form);
}

// 맞춤법·띄어쓰기(content.js SPELLING_FIXES)와 존댓말 1인칭(나 → 저)을 고친다. 내용은 바꾸지 않는다.
function polishText(text, form) {
  let out = text;
  SPELLING_FIXES.forEach(([re, to]) => {
    out = out.replace(re, to);
  });
  if (form !== 2) {
    FIRST_PERSON_POLITE.forEach(([from, to]) => {
      out = out.replace(new RegExp(`(^|[\\s"'(])${from}(?=[\\s,.?!]|$)`, "g"), `$1${to}`);
    });
    out = out.replace(/(^|[\s"'(])내(?= )/g, "$1제"); // 내 판단 → 제 판단
  }
  return out;
}

function convertTone(text, form) {
  return text
    .split("\n")
    .map((line) => {
      const bullet = line.match(/^(-\s*[^:]+:\s*)(.*)$/);
      if (bullet) {
        if (!["sentence", "question"].includes(classifyValue(bullet[2]))) return line;
        return bullet[1] + convertSentence(bullet[2], form).text.replace(/\.$/, "");
      }
      return (line.match(/[^.?!]+[.?!]*\s*/g) || [line])
        .map((part) => {
          const space = part.match(/\s*$/)[0];
          return convertSentence(part.trim(), form).text + space;
        })
        .join("")
        .trimEnd();
    })
    .join("\n");
}

// 끝맺음을 바꾼 뒤에도 근거 구절이 본문에 글자 그대로 있도록, 본문에 있는 앞부분까지만 남긴다.
// form을 주면 근거 구절에도 본문과 같은 맞춤법·1인칭 다듬기를 먼저 적용한다 (해봄 → 해 봄, 나를 → 저를)
function fitEvidence(evidence, text, form) {
  const out = {};
  Object.entries(evidence).forEach(([key, original]) => {
    const phrase = original && form !== undefined ? polishText(original, form) : original;
    let p = phrase;
    while (p && !text.includes(p)) p = p.slice(0, -1);
    p = p.trimEnd();
    out[key] = p.length >= Math.min(4, phrase.length) ? p : phrase;
  });
  return out;
}

const pickForm = (template, form) => (Array.isArray(template) ? template[form] ?? template[template.length - 1] : template || "");

// 칸 하나를 문장으로. 완성 문장·질문은 그대로 두고(끝맺음은 마지막 단계에서 맞춘다), 나머지는 알맞은 문장 틀에 끼운다.
function renderStep(step, raw, form) {
  const shape = classifyValue(raw);
  // "특별히 막힌 점은 없습니다"처럼 '없음'을 말하는 값에는 "다만" 같은 연결어를 붙이지 않는다.
  const connector = MEANS_NONE_RE.test(String(raw).trim()) ? "" : pickForm(step.connector, form);
  if (shape === "sentence" || shape === "question") {
    const value = String(raw).trim();
    // 질문은 물음표로, 나머지는 마침표로 끝낸다 (질문 뒤에 "입니다"·요청 틀을 붙이지 않는다)
    const sentence = /[.?!]$/.test(value) ? value : `${value}${shape === "question" ? "?" : "."}`;
    return { text: connector ? `${connector} ${sentence}` : sentence, evidence: value.replace(/[.?!\s]+$/, "") };
  }
  const value = cleanValue(raw);
  let template;
  if (shape === "ji") template = step.ji || JI_DEFAULT; // "~지"형에는 조사를 붙이지 않는다
  else if (shape === "memo") template = step.memo || "{c}{p}.";
  else {
    const alt = (step.nounIf || []).find((a) => a.re.test(value));
    template = alt ? alt.tpl : step.noun;
  }
  // '내 판단'(opinion) 칸이 아니면 메모체를 사실 표현으로 ("~해야함" → "~해야 합니다")
  return renderTemplate(pickForm(template, form).replace("{c}", connector ? `${connector} ` : ""), value, form, !step.opinion);
}

// 더 간결하게의 목록 줄: 값 그대로 (마침표만 뺌 · 끝맺음은 마지막 단계에서 맞춘다)
function renderBullet(raw) {
  let value = cleanValue(raw);
  if (classifyValue(value) === "question" && !/[?!]$/.test(value)) value += "?"; // 물음표 없는 질문
  return { text: value, evidence: value.replace(/[?!]+$/, "") };
}

// 피하고 싶은 표현: 쉼표·줄바꿈으로 나눠 적은 목록
function parseAvoid(text) {
  return String(text || "")
    .split(/[,，、\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function splitSentences(text) {
  return (String(text).match(/[^.?!]+[.?!]*/g) || []).map((s) => s.trim()).filter(Boolean);
}


// 메시지 한 통 = 문체 하나. 먼저 문체를 정한다: 클라이언트 = 합니다체, 동기 = 반말 [확인 필요],
// 선배·인차지 = 내 말투 끝맺음 설정. (CLAUDE.md '반드시 지킬 것') 반환: 0 합니다체 · 1 해요체 · 2 반말
function toneFormFor(recipient, profile) {
  const style = PARTNER_STYLE[recipient.id] || {};
  const ending = style.ending || profile.ending;
  return ending === "banmal" ? 2 : ending === "haeyo" ? 1 : 0;
}

// ---------- 가짜 AI 호출 2 · 메시지 생성 ----------

// 입력: { card, fields, recipient, profile, preferred }
//   recipient: cards.json partners 항목 { id, label, honorific }
//   profile: { sentenceLength: short|normal|detailed, requestStyle: direct|soft|careful, ending: hamnida|haeyo, avoidPhrases }
// 출력: { variants: [{ type: mine|concise|soft, text, evidence: {칸키: 근거 구절}, reasons: [...] }], reasons: [...] }
//   맨 바깥 reasons는 '내 말투안'의 수정 이유와 같다. 탭마다 수정 이유가 다르다. (B3)
// 확정된 칸의 내용은 빠뜨리거나 바꾸지 않는다. 바꾸는 것은 문장 끝맺음뿐이다.
async function mockGenerateMessages({ card, fields, recipient, profile }) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const flow = MESSAGE_FLOW[card.id];
  const style = PARTNER_STYLE[recipient.id] || { greeting: "{h}," };
  const form = toneFormFor(recipient, profile);
  const requestStyle = style.formal && profile.requestStyle === "direct" ? "soft" : profile.requestStyle;
  const pick = (template) => pickForm(template, form);
  const labelOf = (key) => card.fields.find((field) => field.key === key).label;

  // 피하고 싶은 표현은 앱이 붙이는 문장(인사·첫 문장·끝인사 등)에서만 뺀다.
  // 사용자가 직접 적은 칸 값은 의도를 바꾸지 않도록 그대로 둔다.
  const avoid = parseAvoid(profile.avoidPhrases);
  const removed = new Set();
  // 후보를 차례로 보고, 피하고 싶은 표현이 든 문장을 뺀 결과가 남는 첫 후보를 쓴다.
  const fixed = (...candidates) => {
    for (const candidate of candidates) {
      if (!candidate) continue;
      const kept = splitSentences(pick(candidate)).filter((sentence) => {
        const hit = avoid.find((word) => sentence.includes(word));
        if (hit) removed.add(hit);
        return !hit;
      });
      if (kept.length) return kept.join(" ");
    }
    return "";
  };
  const line = (...parts) => parts.filter(Boolean).join(" ");
  const join = (lines) => lines.filter(Boolean).join("\n");

  // 채워진 칸만 쓴다. 비어 있는 칸은 문장에서도 빠진다. (B1)
  const raw = {};
  card.fields.forEach((field) => {
    const value = String(fields[field.key] || "").trim();
    if (value) raw[field.key] = value;
  });

  // 인차지는 결론 칸을 맨 앞으로
  let steps = flow.steps.filter((step) => raw[step.key]);
  const lead = style.leadFirst ? LEAD_FIELD[card.id] : null;
  if (lead && steps.some((step) => step.key === lead)) {
    steps = [steps.find((step) => step.key === lead), ...steps.filter((step) => step.key !== lead)];
  }
  const tailStep = flow.tail && raw[flow.tail.key] ? flow.tail : null;

  const evidence = {};
  const body = steps
    .map((step) => {
      const r = renderStep(step, raw[step.key], form);
      evidence[step.key] = r.evidence;
      return r.text;
    })
    .join(" ");
  let tail = null; // 질문 준비실은 '묻고 싶은 것'을 마지막 문장에 그대로 (B2)
  if (tailStep) {
    const r = renderStep(tailStep, raw[tailStep.key], form);
    evidence[tailStep.key] = r.evidence;
    tail = r.text;
  }

  // 요청 끝인사: 요청을 담은 칸이 명사구로 채워졌을 때만. 급한 기한이면 여유 있는 말을 뺀 끝인사. (B1)
  const closingKey = CLOSING_FIELD[card.id];
  const allowClosing = Boolean(closingKey && raw[closingKey] && !["sentence", "question"].includes(classifyValue(raw[closingKey])));
  const urgent = Object.values(raw).some((value) => URGENT_RE.test(value));
  const closings = urgent ? MESSAGE_CLOSINGS_URGENT : MESSAGE_CLOSINGS;
  const softer = { direct: "soft", soft: "careful", careful: "careful" };
  const closing = (styleKey) => (allowClosing ? fixed(closings[styleKey], closings.direct) : null);
  const extra = profile.sentenceLength === "detailed" && form !== 2 ? fixed(MESSAGE_EXTRA) : null;
  const greeting = recipient.honorific ? fixed(style.greeting.replace("{h}", recipient.honorific)) : "";
  const opener = style.formal ? flow.formalOpener : flow.opener[requestStyle] || flow.opener.soft;

  // 내 말투안: 칸마다 한 문장 → (충분히 설명) → 질문 → 끝인사
  const mine = join([
    line(greeting, fixed(opener)),
    body,
    extra,
    tail,
    profile.sentenceLength === "short" ? null : closing(requestStyle),
  ]);

  // 더 간결하게: 칸 이름과 값만 항목으로 (질문은 마지막 줄)
  const bulletKeys = [...steps.map((step) => step.key), tailStep && tailStep.key].filter(Boolean);
  const conciseEvidence = {};
  const bullets = bulletKeys.map((key) => {
    const r = renderBullet(raw[key]);
    conciseEvidence[key] = r.evidence;
    return `- ${labelOf(key)}: ${r.text}`;
  });
  const concise = join([
    line(greeting, fixed(style.formal ? opener : flow.concise, opener)),
    ...bullets,
    profile.sentenceLength === "short" ? null : closing("direct"),
  ]);

  // 더 부드럽게: 배려하는 첫 문장 + 한 단계 더 부드러운 끝인사
  const soft = join([line(greeting, fixed(flow.soft, opener)), body, extra, tail, closing(softer[requestStyle])]);

  // 수정 이유: cards.json reasons에서 채워진 칸·탭·받는 사람에 맞는 문구만 골라 최대 3줄 (B3)
  const copy = typeof DATA !== "undefined" && DATA && DATA.reasons;
  const filled = (key) => raw[key] && !MEANS_NONE_RE.test(raw[key]);
  const reasonsFor = (tab, index) => {
    if (!copy) return [];
    const matches = ((copy.byField || {})[card.id] || []).filter((r) => r.requires.every(filled));
    const fieldLine = matches.length ? matches[Math.min(index, matches.length - 1)].text : null;
    const lastLine = removed.size ? copy.avoid.replace("{words}", [...removed].join(", ")) : (copy.byPartner || {})[recipient.id];
    return [(copy.byTab || {})[tab], fieldLine, lastLine].filter(Boolean).slice(0, 3);
  };

  // 마지막 단계: 탭 3종 모두 문장을 나눠 끝맺음을 정한 문체 하나로 맞추고, 근거 구절을 바뀐 본문에 맞춘다.
  const finish = (text, ev) => {
    const unified = unifyTone(text, form);
    return { text: unified, evidence: fitEvidence(ev, unified, form) };
  };
  const variants = [
    { type: "mine", ...finish(mine, evidence), reasons: reasonsFor("mine", 0) },
    { type: "concise", ...finish(concise, conciseEvidence), reasons: reasonsFor("concise", 1) },
    { type: "soft", ...finish(soft, evidence), reasons: reasonsFor("soft", 2) },
  ];
  return { variants, reasons: variants[0].reasons };
}

// ---------- 실제 AI (Gemini · api/ 서버 함수) + 가짜 AI 대체 ----------
// 입출력 형식은 가짜 AI와 같다. 결과에 어디서 만들었는지가 붙는다:
//   source: "gemini"(방금 Gemini가 만듦) · "cache"(10분 안에 Gemini가 만든 결과를 다시 씀) · "mock"(가짜 AI)
//   reason: source가 "mock"일 때 이유 — forced(?mock) · client_limit(브라우저 1분 10회) · timeout · network ·
//           no_key · rate_limit · http · blocked · empty · bad_json · bad_request · shape(응답 모양 이상) ·
//           not_found(서버 함수 없음 · 내 PC의 py -m http.server로 열 때) · server
// 가짜 AI 결과는 저장하지 않는다. Gemini가 성공한 결과만 저장한다.

const AI_TIMEOUT_MS = { structurize: 8000, generate: 15000 };
const CLIENT_LIMIT = 10; // 한 브라우저 1분 10회 (넘으면 서버를 부르지 않고 가짜 AI)
const CLIENT_WINDOW_MS = 60 * 1000;
const AI_CACHE_TTL_MS = 10 * 60 * 1000; // 같은 입력은 10분 동안 저장해 둔 결과를 다시 쓴다 (무료 등급 호출 아끼기)

function forceMock() {
  try {
    return new URLSearchParams(location.search).has("mock");
  } catch (error) {
    return false;
  }
}

// 브라우저마다 다른 임의의 값 (서버의 간단한 호출 제한용 · 개인정보 아님)
function aiClientId() {
  try {
    let id = localStorage.getItem("malgyeol.clientId");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("malgyeol.clientId", id);
    }
    return id;
  } catch (error) {
    return "anonymous";
  }
}

function takeCallSlot() {
  try {
    const now = Date.now();
    const recent = (JSON.parse(sessionStorage.getItem("malgyeol.aiCalls")) || []).filter((t) => now - t < CLIENT_WINDOW_MS);
    if (recent.length >= CLIENT_LIMIT) return false;
    recent.push(now);
    sessionStorage.setItem("malgyeol.aiCalls", JSON.stringify(recent));
    return true;
  } catch (error) {
    return true;
  }
}

// 같은 입력인지 비교하려고 입력을 짧은 값으로 바꾼다 (저장 열쇠)
function aiCacheKey(prefix, payload) {
  const s = JSON.stringify(payload);
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `malgyeol.ai.${prefix}.${(h >>> 0).toString(36)}${s.length.toString(36)}`;
}
function aiCacheGet(key) {
  try {
    const item = JSON.parse(sessionStorage.getItem(key));
    return item && Date.now() - item.at < AI_CACHE_TTL_MS ? item.value : null;
  } catch (error) {
    return null;
  }
}
function aiCacheSet(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch (error) {
    // 저장 공간이 없으면 저장하지 않고 넘어간다
  }
}

// 실패 이유를 담은 오류 (reason은 위 목록 중 하나 · status는 HTTP 상태 숫자)
class AiCallError extends Error {
  constructor(reason, status) {
    super(reason);
    this.reason = reason;
    this.status = status || 0;
  }
}

async function callServer(path, payload, timeoutMs) {
  if (!takeCallSlot()) throw new AiCallError("client_limit");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 1500); // 서버 시간 제한보다 조금 길게
  try {
    let response;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Malgyeol-Client": aiClientId() },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      throw new AiCallError(error && error.name === "AbortError" ? "timeout" : "network");
    }
    if (!response.ok) {
      // 서버가 알려 준 오류 종류를 읽는다 (429도 여기서 바로 가짜 AI로 · 다시 부르지 않음)
      let body = null;
      try {
        body = await response.json();
      } catch (error) {
        body = null;
      }
      if (body && typeof body.error === "string") throw new AiCallError(body.error, body.status);
      throw new AiCallError([404, 405, 501].includes(response.status) ? "not_found" : response.status === 429 ? "rate_limit" : "server", response.status);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new AiCallError("bad_json");
    }
  } finally {
    clearTimeout(timer);
  }
}

// 결과 출처를 사람이 읽는 글로: "Gemini" · "Gemini (저장된 결과)" · "가짜 AI · no_key"
function aiSourceLabel(result) {
  if (!result || !result.source) return "";
  if (result.source === "gemini") return "Gemini";
  if (result.source === "cache") return "Gemini (저장된 결과)";
  return `가짜 AI · ${result.reason || "server"}${result.status ? ` (${result.status})` : ""}`;
}

// 어디서 만들었는지 브라우저 콘솔에 남긴다 (입력·결과 내용은 남기지 않음)
function logAiSource(step, result) {
  try {
    console.info(`[말결 AI] ${step}: ${aiSourceLabel(result)}`);
  } catch (error) {
    // 콘솔이 없어도 넘어간다
  }
  return result;
}

function mockReason(error) {
  return { reason: (error && error.reason) || "server", status: (error && error.status) || 0 };
}

// 서버로 보낼 카드 정의 (cards.json의 카드 그대로 · 카드를 고쳐도 서버 코드는 그대로)
function cardPayload(card) {
  return {
    id: card.id,
    name: card.name,
    fields: card.fields.map((f) => ({ key: f.key, label: f.label, required: Boolean(f.required), followUp: f.followUp || null })),
  };
}

// 호출 1 · 구조화 — 입력: card(cards.json의 카드), input(한 줄) / 출력: { fields, followups, source, reason? }
async function structurize(card, input) {
  if (forceMock()) return logAiSource("구조화", { ...(await mockStructurize(card, input)), source: "mock", reason: "forced" });
  const payload = { card: cardPayload(card), input: String(input).slice(0, 500) };
  const key = aiCacheKey("s", payload);
  const cached = aiCacheGet(key);
  if (cached) return logAiSource("구조화", { ...cached, source: "cache" });
  try {
    const data = await callServer("/api/structurize", payload, AI_TIMEOUT_MS.structurize);
    const fields = {};
    const followups = {};
    card.fields.forEach((f) => {
      const v = data && data.fields ? data.fields[f.key] : null;
      fields[f.key] = typeof v === "string" && v.trim() ? v.trim() : null;
      if (f.required && !fields[f.key]) followups[f.key] = f.followUp;
    });
    const result = { fields, followups };
    aiCacheSet(key, result); // Gemini가 성공한 결과만 저장
    return logAiSource("구조화", { ...result, source: "gemini" });
  } catch (error) {
    return logAiSource("구조화", { ...(await mockStructurize(card, input)), source: "mock", ...mockReason(error) });
  }
}

// 실제 AI 결과를 앱 형식으로 마무리: 문체 하나로 맞추고(안전망), 근거 구절을 바뀐 본문에 맞춘다.
function finishAiResult(data, recipient, profile) {
  const form = toneFormFor(recipient, profile);
  const variants = ["mine", "concise", "soft"].map((type) => {
    const v = ((data && data.variants) || []).find((item) => item && item.type === type);
    if (!v || typeof v.text !== "string" || !v.text.trim()) throw new AiCallError("shape");
    const text = unifyTone(v.text.trim(), form);
    const evidence = {};
    Object.entries(v.evidence || {}).forEach(([k, e]) => {
      if (typeof e === "string" && e) evidence[k] = e;
    });
    const reasons = (Array.isArray(v.reasons) ? v.reasons : []).filter((r) => typeof r === "string" && r.trim()).slice(0, 3);
    return { type, text, evidence: fitEvidence(evidence, text, form), reasons };
  });
  return { variants, reasons: variants[0].reasons };
}

// 호출 2 · 메시지 생성 — 입력: { card, fields, recipient, profile, preferred } / 출력: { variants, reasons, source, reason? }
// options.fresh: true면 저장된 결과를 읽지 않고 새로 부른다 ([다시 만들기])
async function generateMessages(args, options = {}) {
  const { card, fields, recipient, profile, preferred } = args;
  if (forceMock()) return logAiSource("메시지", { ...(await mockGenerateMessages(args)), source: "mock", reason: "forced" });
  const filled = {};
  card.fields.forEach((f) => {
    const v = String(fields[f.key] || "").trim();
    if (v) filled[f.key] = v.slice(0, 500);
  });
  const base = {
    card: cardPayload(card),
    fields: filled,
    recipient: { id: recipient.id, label: recipient.label, honorific: recipient.honorific || "" },
    profile: {
      sentenceLength: profile.sentenceLength,
      requestStyle: profile.requestStyle,
      ending: profile.ending,
      avoidPhrases: String(profile.avoidPhrases || "").slice(0, 200),
    },
  };
  // 카드·칸·받는 사람·말투가 모두 같으면 저장해 둔 결과를 다시 쓴다 ([다시 만들기]는 제외)
  const key = aiCacheKey("g", base);
  const cached = options.fresh ? null : aiCacheGet(key);
  if (cached) return logAiSource("메시지", { ...cached, source: "cache" });
  try {
    const data = await callServer("/api/generate", { ...base, preferred: (preferred || []).slice(0, 5) }, AI_TIMEOUT_MS.generate);
    const result = finishAiResult(data, recipient, profile);
    aiCacheSet(key, result); // Gemini가 성공한 결과만 저장 (가짜 AI 결과는 저장하지 않음)
    return logAiSource("메시지", { ...result, source: "gemini" });
  } catch (error) {
    return logAiSource("메시지", { ...(await mockGenerateMessages(args)), source: "mock", ...mockReason(error) });
  }
}
