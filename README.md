# 해시태그 연구소 (HastagLab)

키워드나 사진을 넣으면 AI가 Instagram, TikTok, Naver Blog용 해시태그를 만들어주는 앱입니다.

## 구조

- `frontend/`: Expo React Native 앱
- `backend/`: FastAPI 서버
- `backend/main.py`: AI 호출과 `/generate`, `/health` API

## 지금 동작 방식

1. 앱에서 키워드나 사진을 입력합니다.
2. 앱이 백엔드 서버의 `/generate`로 데이터를 보냅니다.
3. 백엔드가 AI API를 호출합니다.
4. AI 결과를 앱에 보여줍니다.

## AI 설정

백엔드는 기본값으로 `AI_PROVIDER=auto`를 씁니다.

- 키워드만 있을 때: DeepSeek 우선 사용
- 사진이 있을 때: Gemini 사용
- DeepSeek 잔액 부족/장애/응답 오류가 생기면 Gemini로 자동 전환

이렇게 나눈 이유는 DeepSeek가 텍스트 생성 비용이 싸고, Gemini는 사진 해석을 안정적으로 처리하기 때문입니다.

`backend/.env` 예시:

```env
AI_PROVIDER=auto
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_FALLBACK_TO_GEMINI=true
DEEPSEEK_MODEL=deepseek-v4-flash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
MAX_IMAGE_BYTES=10000000
RATE_LIMIT_PER_MINUTE=10
RATE_LIMIT_PER_DAY=100
IMAGE_LIMIT_PER_DAY=20
GLOBAL_LIMIT_PER_DAY=1000
CACHE_TTL_SECONDS=3600
CACHE_MAX_ITEMS=500
AI_REQUEST_TIMEOUT_MS=30000
```

## 비용 폭탄 방지

API 키는 앱 안에 넣지 않습니다. 앱은 백엔드 주소만 알고, 실제 DeepSeek/Gemini 키는 서버의 `.env`나 Railway 환경변수에만 둡니다.

백엔드에는 기본 보호 장치가 들어 있습니다.

- 같은 IP는 1분에 10번까지만 생성 가능
- 같은 IP는 하루 100번까지만 생성 가능
- 사진 분석은 하루 20번까지만 가능
- 서비스 전체는 하루 1000번까지만 생성 가능
- 같은 입력은 1시간 동안 캐시해서 AI를 다시 부르지 않음
- 이미지 크기 제한과 AI 요청 시간 제한 적용

운영 규모가 커지면 이 제한 기록은 Redis 같은 외부 저장소로 옮기는 것이 좋습니다. 지금 코드는 서버 메모리에 저장하므로 서버가 재시작되면 제한 기록이 초기화됩니다.

## 서버 주소 설정

앱 기본 서버 주소는 Railway 주소입니다.

```js
https://hastaglab-production-eab7.up.railway.app
```

다른 주소를 쓰고 싶으면 Expo 실행 전에 아래처럼 설정할 수 있습니다.

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-api.example.com npm start
```

## 로컬 실행

백엔드:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

프론트엔드:

```bash
cd frontend
npm install
npm start
```

로컬 백엔드에 붙여 테스트하려면:

```bash
cd frontend
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000 npm start
```

휴대폰 Expo Go에서 테스트할 때는 `localhost`가 휴대폰 자신을 뜻할 수 있습니다. 그때는 맥미니의 같은 와이파이 IP를 사용하세요.
