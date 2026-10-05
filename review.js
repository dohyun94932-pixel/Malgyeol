// 내부 리뷰용 화면 바로가기. 배포 전에 빼려면:
//   1) 이 파일(review.js)과 review.css를 지우고
//   2) index.html에서 review-bar <nav>, review.css <link>, review.js <script> 3곳을 지운다.
// main.js는 이 파일이 없어도 그대로 동작한다.

// ---------- 검토용 화면 바로가기 ----------
// 새 화면을 만들면 SCREENS에 한 줄만 추가하면 바로가기에 나타난다.
const SCREENS = [
  { id: "home", label: "1 홈" },
  { id: "structure", label: "2 구조화 확인" },
  { id: "result", label: "3 결과" },
  { id: "profile", label: "4 내 말투" },
];

// 주소 뒤에 ?review를 붙였을 때만 보인다. (심사용 링크에는 안 보임)
// 예전에는 파일을 더블클릭해 열 때(file://)도 켰지만, 지금은 cards.json을 읽어야 해서 file://로는 앱이 뜨지 않는다.
const REVIEW_MODE = new URLSearchParams(location.search).has("review");

// 앞 화면을 거치지 않고 열면 예시 데이터를 채워서 보여 준다.
async function openForReview(id) {
  const needsData = id === "structure" || id === "result";
  if (needsData && Object.keys(state.fields).length === 0) {
    const card = currentCard() || sortedCards()[0];
    state.cardId = card.id;
    // 시연 카드면 cards.json demo의 한 줄, 아니면 홈 예시 문장("예: " 뺀 것)을 쓴다.
    state.input = state.input || (card.id === DATA.demo.cardId ? DATA.demo.oneLine : card.homePlaceholder.replace(/^예:\s*/, ""));
    const result = await structurize(card, state.input);
    state.fields = result.fields;
    state.followups = result.followups;
  }

  if (id === "structure") renderStructure();
  if (id === "result") {
    state.recipient = state.recipient || DATA.partners[0].id;
    await buildResult();
    showScreen("result");
    return;
  }
  showScreen(id);
}

function initReviewBar() {
  if (!REVIEW_MODE) return;

  const bar = $("review-bar");
  SCREENS.forEach((screen) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = screen.label;
    button.addEventListener("click", () => openForReview(screen.id));
    bar.appendChild(button);
  });
  bar.hidden = false;
  // 바가 화면 아래 버튼을 가리지 않게, 바 높이만큼 아래 여백을 준다. (좁은 화면에선 바가 두 줄이 된다)
  document.body.classList.add("review-mode");
  const fit = () => document.body.style.setProperty("--review-bar-height", `${bar.offsetHeight}px`);
  fit();
  window.addEventListener("resize", fit);
}
