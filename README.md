# 해시태그 연구소 (Hashtag Lab)

Instagram hashtag generator: upload a photo, add optional keywords (Korean or English), and get 25–30 relevant hashtags instantly.

## Architecture

```
┌─────────────────────────────────┐         ┌──────────────────────────┐
│  Expo (React Native) Frontend   │ ──POST──▶│  FastAPI Backend         │
│  Android / iOS                  │◀──JSON── │  Port 8001               │
└─────────────────────────────────┘         │  OpenAI gpt-4o Vision    │
                                             └──────────────────────────┘
                                                       ▲
                                               Cloudflare Tunnel
                                               (stable named tunnel)
```

## Quick start

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
cp .env.example .env
# Edit .env and set EXPO_PUBLIC_API_URL to your backend URL
npm install
npx expo start
```

## Bug fixes in this version

### 🐛 Korean keywords did not generate hashtags (but English did)

**Root cause:** The AI prompt was written entirely in English. When the user typed Korean keywords, the model did not understand them in the English-language context and effectively ignored them, returning an empty or unrelated response.

**Fix:** The prompt is now written in **Korean**. This ensures the model correctly interprets both Korean and English keywords. The hashtag regex was also updated to match Unicode Korean characters (`\uAC00-\uD7A3`) so Korean tags are not stripped from the result.

### 🐛 Error messages appeared frequently

**Root cause:** The hardcoded Cloudflare temporary tunnel URL changed each time the `cloudflared` process restarted, causing all API calls to fail with network errors.

**Fix:** The API URL is now read from the `EXPO_PUBLIC_API_URL` environment variable (set in `frontend/.env`). See `backend/README.md` for instructions on setting up a **permanent named Cloudflare tunnel** so the URL never changes.

## See also
- [`backend/README.md`](backend/README.md) – detailed backend & tunnel setup
