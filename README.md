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
Vercel: https://malgyeoll.vercel.app/ (개인 저장소 `mine`의 main 기준 · 누구나 접속 가능)
- 팀 저장소 배포(이전 주소): https://malgyeol-neon.vercel.app/

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

### AI 연결 (Google Gemini · 무료 등급)
- 흐름: 브라우저(`ai.js`) → Vercel 서버 함수(`api/structurize.js`, `api/generate.js`) → Gemini API. AI 호출 코드는 `api/_lib/llm.js` 한 파일, 시스템 지시문은 `api/_lib/prompts.js`
- **API 키는 서버 환경변수에만** 둔다. 브라우저 코드·저장소·로그에는 없다.
- 실패하면 자동으로 가짜 AI(`ai.js`의 mock…)로 대체되고, 결과 화면에 "지금은 AI 대신 연습용 예시 문장으로 보여 드려요…"가 보인다.
  대체되는 경우: 서버 오류 · 시간 초과(구조화 8초 · 생성 15초) · 호출 한도 초과(429, 다시 부르지 않음) · JSON 형식 오류(서버에서 1회 재시도 후) · 안전 필터 차단·빈 응답 · 네트워크 끊김 · 키 없음
- 같은 입력(카드·칸·받는 사람·말투가 모두 같음)은 브라우저에 10분 저장해 두고 다시 부르지 않는다. **Gemini가 성공한 결과만 저장**하고, 가짜 AI 결과는 저장하지 않는다.
- [다시 만들기]는 저장된 결과를 쓰지 않고 항상 새로 부른다.
- 한 브라우저에서 1분에 10번이 넘으면 서버를 부르지 않고 가짜 AI를 쓴다.

#### Vercel 환경변수 등록 (내 Vercel 프로젝트 `malgyeoll`)
1. vercel.com → 프로젝트 → **Settings → Environment Variables**
2. `GEMINI_API_KEY` = Google AI Studio에서 만든 키 (Production · Preview 둘 다 체크)
3. (선택) `GEMINI_MODEL` = 쓸 모델. 비우면 `gemini-3.5-flash-lite`. 더 저렴하게: `gemini-3.1-flash-lite`
4. (선택) `GEMINI_THINKING` = `off`로 두면 '생각' 설정을 빼고 부른다 (기본은 가장 낮은 `minimal`)
5. 저장한 뒤 **Deployments → 최근 배포 → Redeploy** 해야 반영된다.

#### 시연 비상용 `?mock`
- 주소 뒤에 `?mock`을 붙이면 항상 가짜 AI를 쓴다 (예: `https://배포주소/?mock`, 화면 바로가기와 함께면 `?mock&review`). AI 호출을 쓰지 않는다.

#### 무료 등급의 한계 (발표 전 꼭 확인)
- 무료 등급은 **입력이 Google 제품 개선에 쓰이고 사람이 검토할 수 있다.** 그래서 홈·구조화 확인 화면에 "입력 내용은 AI 서비스로 전송돼요. 실제 회사명·금액·이름은 넣지 마세요."를 보여 준다.
- 무료 등급은 분당·일일 호출 한도가 낮다. 한도는 공식 문서에 숫자로 나와 있지 않고 **Google AI Studio → Rate limits**에서 프로젝트별로 확인해야 한다.
- **발표 당일 수백 명이 동시에 쓰면 대부분은 한도를 넘어 가짜 AI로 대체될 수 있다.** (화면은 깨지지 않고 대체 안내가 보인다)

#### 미리보기에서 시험하기
- **어디서 만들었는지 보기**: 주소 뒤에 `?review`를 붙이면 결과 화면 위에 작은 글씨로 `생성: Gemini` · `생성: Gemini (저장된 결과)` · `생성: 가짜 AI · 이유`가 보인다. 브라우저 콘솔(F12)에도 `[말결 AI] 메시지: …`로 남는다.
  이유: `no_key`(키 없음) · `rate_limit`(한도 초과) · `timeout` · `network` · `http (숫자)`(Gemini 오류 · 404면 모델 이름 확인) · `blocked`(안전 필터) · `empty` · `bad_json` · `client_limit`(브라우저 1분 10회) · `not_found`(서버 함수 없음) · `forced`(`?mock`)
- **상태 확인 `/api/health`** (미리보기에서만 · 실제 배포에서는 404): 키 설정 여부(예/아니오 · 값은 보이지 않음), 모델 이름, 짧은 시험 호출 결과(`test.ok`). 열 때마다 Gemini를 1번 부른다.
- **Gemini 모드** (`/scripts/qa.html` 아래쪽 버튼): 대표 6건(실제 사례 · q01 · r02 · s01 · q03 · r05)을 실제 Gemini로 만들어 점검 기준으로 확인한다. 누를 때마다 6번 호출 · 호출 수가 화면에 보인다 · [결과 복사]로 붙여 넣기.
- 작업 브랜치를 `mine`에 push하면 Vercel 미리보기 주소가 생긴다. 미리보기는 **Vercel 로그인(Deployment Protection)**이 걸려 있어 Vercel에 로그인한 브라우저에서만 열린다.
- 이 PC에는 Node가 없어 서버 함수를 내 PC에서 직접 돌릴 수 없다. 내 PC에서 `py -m http.server`로 열면 서버 함수가 없어서 **항상 가짜 AI로 대체되는 것**을 확인할 수 있다.

### 임시 구현
- AI 호출이 실패할 때 쓰는 가짜 AI(`ai.js`의 mockStructurize · mockGenerateMessages)는 샘플·키워드 응답과 문장 틀로 메시지를 조립
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
- 같은 페이지 아래쪽에 '문체 점검'(메시지 한 통 = 문체 하나 · 변환 못 한 끝맺음 목록)도 나옵니다. 결과 기록: `docs/qa/tone-20261005-before.md` · `-after.md`. 끝맺음 변환 표는 `content.js`의 `TONE_TABLE`

### 내부 리뷰용 화면 바로가기
- 주소 뒤에 `?review`를 붙일 때만 화면 아래에 화면 바로가기가 나타납니다. 예: `https://malgyeoll.vercel.app/?review` (심사용 링크에는 안 보임)
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

### 저장소 2개와 작업 순서
| 이름 | 주소 | 용도 |
|---|---|---|
| `mine` | https://github.com/dohyun94932-pixel/Malgyeol | 개인 저장소 · 평소 작업과 확인용 |
| `origin` | https://github.com/kkihalee/-A-2- | 팀 저장소 · **요청할 때만** 올린다 |

1. 작업은 항상 브랜치에서 한다. (예: `git switch -c feature/작업이름`)
2. 확인하고 싶으면 그 브랜치를 `mine`에 push한다 → Vercel **미리보기 주소**가 생긴다. (실제 배포 주소는 그대로)
   - 미리보기가 생기려면 Vercel에 `mine` 저장소를 프로젝트로 한 번 연결해 둬야 한다 (vercel.com → Add New → Project → Malgyeol 가져오기).
3. 확인이 끝나 `mine`의 main에 합치면 `mine`과 연결된 Vercel의 **실제 배포 주소**(https://malgyeoll.vercel.app/)가 바뀐다.
4. 팀 저장소(`origin`)에는 내가 요청할 때만 push한다. 팀 저장소 main에 합치면 팀 배포 주소(https://malgyeol-neon.vercel.app/)가 바뀐다.

```bash
git push mine feature/작업이름
```
