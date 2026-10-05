# 말결 프로젝트
### **By AI, As a Team, Solve Important problems.**

#### **팀 미션 : 바이브코딩으로 우리 조 앱 만들기**

- 코딩을 몰라도 괜찮아요 !
AI와 대화하며 동기들과 함께 실제로 작동하는 가벼운 웹앱 하나를 만드는 미션입니다.

모든 앱은 **Claude** 로 만드는 **3~5화면짜리 웹앱**입니다.
설치 없이 링크로 바로 열리고, **1~2분 안에 시연할 수 있을 만큼 가벼워야 합니다.**
(발표 당일 300~400명이 동시에 접속이 필요합니다.)

---

## 말결 개발 현황

### 배포
Vercel: https://malgyeol-neon.vercel.app/

### 기준 문서 (충돌하면 위에 있는 것을 따른다 · `CLAUDE.md` 우선순위와 같음)
1. 코딩 레퍼런스 2장 design: `docs/content/말결_코딩레퍼런스.md` — 화면·컴포넌트·색·문구·메시지 생성 규칙
2. 코딩 레퍼런스 4장 카드 데이터: `data/cards.json` — 카드 3개의 입력 항목, placeholder, 되묻기 문구, 받는 사람, 말투 옵션, UI 문구 (레퍼런스 4장 JSON을 그대로 옮긴 파일)
3. 샘플 데이터: `data/malgyeol_sample_data.json` — 카드별 10건, 총 30건 (테스트·시연용 가짜 데이터)
4. UI 레퍼런스 수집자료(이은서) — PDF 원본은 저장소에 올리지 않음
- 작업 규칙: `CLAUDE.md` (코딩 레퍼런스 1장 '프로젝트 지침'과 같은 내용)
- 참고(이전 기준): `docs/말결_기획안_v1.1.md`, `docs/design/wireframe.png`, `docs/말결_STEP1_기획서.md` — 위 1~4와 다르면 위를 따른다
- 결정 기록: `docs/decision-log.md` / 작업 프롬프트 기록: `docs/prompts/`

### 현재 구현 (2026-10-05 · 콘텐츠팀 코딩 레퍼런스 기준)
- 화면 4개: 홈 → 구조화 확인 → 결과 → 내 말투 (10/04 앱 화면 · 상단 헤더 · 파란색)
- **화면 문구·카드·칸·받는 사람·버전 탭·온보딩·말투 옵션은 `data/cards.json`에서 읽어 그린다.** 문구는 코드가 아니라 cards.json에서 고친다
  - 카드 3개(질문 준비실 · 부탁 한 장 · 한 줄 상황보고), 홈은 질문 준비실이 선택된 상태로 시작하고 카드를 바꾸면 입력창 예시도 바뀐다
  - 받는 사람 4종: 선배 · 인차지 · 동기 · 클라이언트(호칭 "담당자님", 말투 설정과 관계없이 가장 격식 있는 합니다체 · B4)
  - 빈 **필수** 칸만 노란 칸 + 되묻기 질문(cards.json `followUp`)
- 가짜 AI 구조화: 샘플 데이터의 한 줄(`oneLine`)을 입력하면 그 샘플에서 한 줄로 알 수 있는 칸만 채우고 나머지는 비워 둔다. 시연 한 줄("재고평가충당금…")은 '해본 것'이 비어 나온다
- 말투 저장: `malgyeol.profile` = { sentenceLength, requestStyle, ending, avoidPhrases, preferredExamples, onboarded } (코딩 레퍼런스 2장 8절). 예전 형식 값은 처음 열 때 자동으로 옮긴다
- 다시 적용한 개선: 본문·입력 16px, 모바일 안전 영역·확대 방지, 피하고 싶은 표현을 앱이 붙이는 문장에서 빼기, `?review` 바 겹침 방지, 내 말투 → [← 결과로 돌아가기], 결과 본문 높이 자동 맞춤
- 반응형 레이아웃 (10/04 iPhone Safari, 카카오톡 인앱 브라우저에서 확인 완료 · 10/05 변경 후 모바일 재확인 필요)

### 임시 구현
- AI 호출은 가짜 AI(`ai.js`)로 대체. API 키가 제공되지 않아 실제 AI 연결은 보류하고, 샘플·키워드 응답과 문장 틀로 메시지를 조립
- 남은 수정 요청: 코딩 레퍼런스 5장 B5~B8 (B1~B3은 10/05 가짜 AI에 반영)
- 디자인: 코딩 레퍼런스 2장 기준(10/04 앱 · 파란색). v1.1 시안(주황) 반영분은 10/05 되돌림 — docs/decision-log.md 참고

### 데이터 반영 위치
- `data/cards.json`: 카드·입력 칸·placeholder·되묻기 문구·받는 사람·버전 탭·온보딩·말투 옵션·화면 문구(uiCopy). **문구는 여기서 고친다.**
- `data/malgyeol_sample_data.json`: 샘플 30건 (가짜 AI 구조화가 참고)
- `content.js`: 가짜 AI용 임시 데이터(문장 틀, 받는 사람별 인사 방식, 끝인사)와 cards.json에 없는 토스트·오류 문구. 수정 이유 문구는 cards.json `reasons`
- `index.html`: cards.json에 없는 문구 몇 개('말투 설정' 제목·안내, '피하고 싶은 표현' 라벨, '마음에 든 문장' 제목, '← 결과로 돌아가기')
- 이름이 서로 어긋나면 브라우저 콘솔(`Cmd+Option+I` / Windows `F12`)에 `[cards.json]` 또는 `[content.js]` 오류가 뜹니다.

### 내 PC에서 확인하기 (설치 없이)
앱이 `data/cards.json`을 읽어 화면을 그리기 때문에 **index.html을 더블클릭해서 열면 화면이 뜨지 않습니다**(브라우저가 파일 읽기를 막음 · 안내 문구가 대신 보임). 아래 중 하나로 여세요. 새 npm 패키지는 필요 없습니다.
- **Python (Windows · Mac 기본)**: 프로젝트 폴더에서 아래 명령을 실행한 뒤 브라우저로 `http://localhost:8000` 을 엽니다. 끝낼 때는 터미널에서 `Ctrl+C`.
  - Windows: `py -m http.server 8000`
  - Mac: `python3 -m http.server 8000`
- **VS Code Live Server 확장**: VS Code에서 index.html을 열고 오른쪽 아래 **Go Live**를 누릅니다.
- 화면 바로가기를 보려면 주소 뒤에 `?review`를 붙입니다. 예: `http://localhost:8000/?review`

### 메시지 자동 점검 (가짜 AI 문장 품질)
- 위 '내 PC에서 확인하기'처럼 로컬 서버를 켠 뒤 브라우저로 `http://localhost:8000/scripts/qa.html` 을 엽니다. (Node 없이 브라우저에서 `ai.js`를 그대로 돌림)
- 샘플 30건 + 추가 사례(T5 · X1)를 탭 3종 × 끝맺음 2종 × 요청 방식 3종(+피하고 싶은 표현)으로 만들어 B1·B2·B3, 받는 사람 규칙, 문법 깨짐, 말투 혼합, 마스킹, 의도 체크 근거, 피하고 싶은 표현을 셉니다.
- 결과는 화면의 [결과 .md 내려받기]로 받아 `docs/qa/check-YYYYMMDD-before.md` / `-after.md` 로 저장합니다. 점검 기준(패턴 목록)은 `scripts/check-messages.js` 맨 위에 있습니다.
- 결과 기록: `docs/qa/check-20261005-before.md`(고치기 전) · `docs/qa/check-20261005-after.md`(고친 뒤, 비교표 포함)

### 내부 리뷰용 화면 바로가기
- 주소 뒤에 `?review`를 붙일 때만 화면 아래에 화면 바로가기가 나타납니다. 예: `https://malgyeol-neon.vercel.app/?review` (심사용 링크에는 안 보임)
- 최종 배포 전에 제거: `review.js`, `review.css`를 지우고 `index.html`의 관련 3줄(`<link>`, `<nav>`, `<script>`)을 지웁니다.

### 남은 작업
1. 콘텐츠팀 데이터 반영
2. design.md 반영
3. 실제 AI 연결 (API 키가 제공되면 진행. 키는 서버리스 함수 등으로 보호)
4. 전체 기능 검증
5. 모바일 추가 점검 (Android Chrome 등 다른 기기)
6. 발표용 테스트

### 개발 방식
VS Code + Claude Code
GitHub main push → Vercel 자동 배포
