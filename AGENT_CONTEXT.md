# HastagLab — 에이전트 인계 문서 (Agent Context Handoff)

> **새 에이전트 세션용.** 이 문서는 지금까지 진행된 모든 작업을 정리한 것입니다.
> 새 세션을 시작할 때 이 파일을 가장 먼저 읽으세요.

---

## 1. 프로젝트 개요

**해시태그 연구소 (Hashtag Lab)**
- AI(DeepSeek)를 이용해 SNS 해시태그(Instagram / TikTok / Naver Blog)를 자동 생성하는 모바일 앱
- 이미지 또는 텍스트 키워드를 입력받아 각 플랫폼에 최적화된 해시태그 5개씩 생성
- 한국어/영어 언어 전환 지원
- **백엔드**: Python FastAPI (Railway 클라우드 배포)
- **프론트엔드**: React Native (Expo) 모바일 앱

---

## 2. 레포 디렉토리 구조

```
hastaglab/
├── Dockerfile                  # 루트 레벨 (Railway가 이걸 사용)
├── railway.toml                # 루트 레벨 Railway 설정 (Railway 서비스가 읽음)
├── README.md                   # 간단한 레포 설명
├── AGENT_CONTEXT.md            # ← 이 파일 (에이전트 인계 문서)
│
├── backend/
│   ├── main.py                 # FastAPI 앱 진입점 (핵심 로직)
│   ├── requirements.txt        # Python 패키지 목록
│   ├── .env.example            # 로컬 개발용 환경변수 템플릿
│   ├── Dockerfile              # backend 전용 Dockerfile (현재 미사용, 루트 것 사용)
│   └── railway.toml            # backend 폴더 레벨 Railway 설정 (현재 루트 것이 우선)
│
└── frontend/
    ├── App.js                  # React Native 메인 컴포넌트
    ├── app.json                # Expo 앱 설정
    ├── package.json            # npm 패키지 목록
    ├── eas.json                # EAS Build 설정 (APK/AAB 빌드)
    └── babel.config.js         # Babel 설정
```

---

## 3. 백엔드 (backend/main.py)

### 3-1. 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | FastAPI |
| 언어 | Python 3.11 |
| AI 모델 | DeepSeek API (`deepseek-v4-flash` 텍스트, `deepseek-v4-pro` 이미지) |
| 포트 | Railway: `$PORT` 환경변수 / 로컬: 8000 |

### 3-2. 환경변수

```
DEEPSEEK_API_KEY=sk-...   # 필수. DeepSeek API 키
```

- `GEMINI_API_KEY`는 `.env.example`에 남아있지만 **현재 코드에서 사용하지 않음** (이전 버전 잔재)
- 로컬 개발 시 `backend/.env` 파일 생성 후 위 키 설정

### 3-3. API 엔드포인트

#### `POST /generate`
해시태그 생성 메인 엔드포인트

**Request Body:**
```json
{
  "keyword": "강아지, 귀여운",       // 선택. 최대 200자
  "image": "base64_string_here",    // 선택. JPEG base64
  "language": "ko"                  // "ko" 또는 "en", 기본값 "ko"
}
```
- `keyword`와 `image` 둘 다 없으면 400 에러
- 이미지가 있으면 `deepseek-v4-pro` (비전 모델) 사용
- 텍스트만 있으면 `deepseek-v4-flash` (빠른 모델) 사용

**Response:**
```json
{
  "instagram": "#강아지 #귀여운강아지 #댕댕이 #반려동물 #펫스타그램",
  "tiktok": "#강아지틱톡 #귀여운강아지 #댕댕이일상 #펫틱톡 #강아지vlog",
  "blog": "#강아지일상 #귀여운강아지 #반려견블로그 #댕댕이스타그램 #소형견",
  "analysis": "귀여운 강아지 일상을 담은 콘텐츠로 분석됩니다."
}
```

#### `GET /health`
헬스체크용. `{"status": "ok"}` 반환

### 3-4. AI 프롬프트 전략
- 시스템 프롬프트는 항상 언어(`ko`/`en`)에 맞게 동적 생성
- JSON만 반환하도록 강제 (markdown 없이)
- 응답에서 `{...}` 패턴으로 JSON 추출 (파싱 실패 시 텍스트 그대로 반환)

### 3-5. CORS 설정
모든 오리진(`*`) 허용 — 앱 개발 편의 위해 열어둠

---

## 4. 프론트엔드 (frontend/App.js)

### 4-1. 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | React Native + Expo SDK 54 |
| 버전 | 1.0.5 (versionCode: 5) |
| 언어 | JavaScript |
| 다국어 | i18next + react-i18next (ko/en) |

### 4-2. 주요 npm 패키지

```json
{
  "expo": "~54.0.0",
  "expo-image-picker": "~16.1.0",    // 갤러리 접근
  "expo-clipboard": "~7.1.0",        // 클립보드 복사
  "expo-haptics": "~14.1.0",         // 진동 피드백
  "react-native-confetti-cannon": "^1.5.2",  // 복사 시 컨페티 효과
  "i18next": "^23.11.5",
  "react-i18next": "^14.1.2"
}
```

### 4-3. API 연결

```js
const API_BASE_URL = 'https://hastaglab-production.up.railway.app';
```

- **Railway 백엔드 URL이 코드에 하드코딩**되어 있음
- 로컬 백엔드 테스트 시 이 값을 `http://localhost:8000`으로 임시 변경해야 함
- 요청 타임아웃: **60초** (이미지+Pro 모델 처리 시간 고려)

### 4-4. 주요 기능

1. **이미지 업로드**: 갤러리에서 이미지 선택 → quality 0.2, maxWidth 800으로 리사이즈 → base64 변환 → 백엔드 전송
2. **해시태그 생성**: `/generate` 호출 → Instagram/TikTok/Naver Blog 결과 표시
3. **클립보드 복사**: 각 플랫폼 태그 복사 버튼 → 컨페티 애니메이션 + 햅틱 피드백
4. **언어 전환**: 한국어 ↔ 영어 (헤더 우측 버튼)
5. **로딩 애니메이션**: 🤖 아이콘 bounce 애니메이션

### 4-5. 앱 설정 (app.json)

```
앱 이름: 해시태그 연구소
슬러그: hastaglab
Android 패키지: com.gronyse.hastaglab
iOS 번들 ID: com.gronyse.hastaglab
테마: dark (#121212 배경)
```

### 4-6. EAS Build 설정 (eas.json)

| 프로파일 | 용도 | 빌드 타입 |
|---------|------|----------|
| `development` | 개발자 테스트 | internal 배포 |
| `preview` | QA 테스트 | Android APK (internal) |
| `production` | 스토어 출시 | Android AAB |

---

## 5. Railway 클라우드 배포 설정

### 5-1. 구조

Railway는 **루트 레벨**의 `Dockerfile`과 `railway.toml`을 읽음.

```
hastaglab/
├── Dockerfile       ← Railway가 이걸로 이미지 빌드
└── railway.toml     ← Railway 빌드/실행 설정
```

### 5-2. 루트 `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .                      # backend/ 폴더 내용을 /app에 복사

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> **중요**: Railway는 `$PORT` 환경변수를 자동 설정함. `railway.toml`의 `startCommand`가 이를 오버라이드.

### 5-3. 루트 `railway.toml`

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### 5-4. Railway 환경변수 설정 방법

Railway 대시보드 → 서비스 선택 → **Variables** 탭에서 추가:

```
DEEPSEEK_API_KEY = sk-xxxxx
```

### 5-5. 배포 URL

```
https://hastaglab-production.up.railway.app
```

- 헬스체크: `GET https://hastaglab-production.up.railway.app/health`
- 해시태그 생성: `POST https://hastaglab-production.up.railway.app/generate`

### 5-6. 로컬 → Railway 배포 플로우

1. 코드 변경
2. `git push origin main` (또는 PR 머지)
3. Railway가 자동으로 Dockerfile 빌드 → 배포 (GitHub 연동 시 자동 트리거)

---

## 6. 로컬 개발 환경 세팅

### 6-1. 백엔드

```bash
cd backend
cp .env.example .env        # .env 파일 생성
# .env 파일에 DEEPSEEK_API_KEY 값 입력

pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# → http://localhost:8000 에서 실행
```

### 6-2. 프론트엔드

```bash
cd frontend
npm install

# 로컬 백엔드 연결 시 App.js에서 API_BASE_URL 수정:
# const API_BASE_URL = 'http://localhost:8000';  // 로컬 테스트
# const API_BASE_URL = 'https://hastaglab-production.up.railway.app';  // 프로덕션

npx expo start               # QR 코드 → Expo Go 앱으로 실행
npx expo start --tunnel      # 방화벽 환경에서 ngrok 터널 사용
```

---

## 7. 현재 알려진 사항 및 주의점

1. **GEMINI_API_KEY**: `.env.example`에 있지만 `main.py`에서 **전혀 사용하지 않음**. 과거 버전 잔재. 혼동 방지를 위해 삭제 고려.

2. **backend/Dockerfile, backend/railway.toml**: `backend/` 폴더 안에도 Dockerfile과 railway.toml이 있지만, Railway는 **루트 레벨** 파일을 사용. 내용이 다를 경우 루트 파일이 우선.

3. **API_BASE_URL 하드코딩**: `frontend/App.js` 14번째 줄에 Railway URL이 하드코딩됨. 향후 `EXPO_PUBLIC_API_URL` 환경변수로 바꾸는 것이 좋음.

4. **DeepSeek 모델명**: 현재 코드에서 `deepseek-v4-flash`와 `deepseek-v4-pro`를 사용. DeepSeek API 정책 변경 시 모델명 확인 필요.

5. **Rate Limit**: 현재 코드에 rate limit 로직 없음. `backend/.rate_limit.json` 파일도 없음 (이전 버전 메모리에만 남은 내용, 현재 미구현).

6. **앱 버전**: `app.json`의 `version: "1.0.5"`, `versionCode: 5`. 업데이트 시 두 값 모두 올려야 함.

---

## 8. 다음 작업 제안 (우선순위 순)

- [ ] `frontend/App.js`의 API_BASE_URL을 `process.env.EXPO_PUBLIC_API_URL`로 환경변수화
- [ ] `.env.example`에서 `GEMINI_API_KEY` 제거 (혼동 방지)
- [ ] `backend/Dockerfile`과 `backend/railway.toml` 정리 또는 루트와 통일
- [ ] 에러 응답 형식 통일 (`{"detail": "..."}` 구조 유지)
- [ ] 이미지 크기 제한 추가 (현재 base64 크기 검증 없음)

---

## 9. Git 브랜치 현황

```
main                          ← 기본 브랜치
copilot/organize-existing-code ← 현재 작업 브랜치 (이 문서 포함)
```
