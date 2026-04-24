# 해시태그 연구소 (Hashtag Lab) – Backend

FastAPI server that generates Instagram-style hashtags from an uploaded image and optional keywords using OpenAI's Vision API.

## Requirements
- Python 3.10+
- An OpenAI API key with access to `gpt-4o`

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Environment variables

Create a `.env` file (or export the variable in your shell / PM2 config):

```
OPENAI_API_KEY=sk-...
```

## Running locally

```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

## Running with PM2 (production on Mac mini)

```bash
# Install dependencies once
source venv/bin/activate && pip install -r requirements.txt

# Start / restart
pm2 start "source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8001" \
  --name hashtag-backend \
  --env OPENAI_API_KEY=sk-...

pm2 save
pm2 startup   # follow the printed command to enable autostart
```

## Cloudflare Tunnel (exposing local server to the internet)

Temporary tunnels reset every time `cloudflared` restarts. Use a **named tunnel** to get a stable URL:

```bash
# One-time setup
cloudflared tunnel login
cloudflared tunnel create hashtag-lab
cloudflared tunnel route dns hashtag-lab <your-subdomain.your-domain.com>

# config.yml  (e.g. ~/.cloudflared/config.yml)
# tunnel: <tunnel-id>
# credentials-file: ~/.cloudflared/<tunnel-id>.json
# ingress:
#   - service: http://localhost:8001

cloudflared tunnel run hashtag-lab
```

Or with PM2:

```bash
pm2 start "cloudflared tunnel run hashtag-lab" --name cloudflared-tunnel
pm2 save
```

## API

### `GET /health`
Returns server status.

### `POST /generate-hashtags`
| Field | Type | Description |
|-------|------|-------------|
| `image` | file | JPEG / PNG image (max 10 MB) |
| `keywords` | string (optional) | Comma-separated or space-separated keywords **in any language** (Korean fully supported) |

Response:
```json
{
  "hashtags": ["#여행", "#감성", "#daily", ...],
  "count": 27,
  "raw": "..."
}
```

## Troubleshooting

### 한국어 키워드를 입력하면 해시태그가 생성되지 않는 문제

이전 버전에서는 프롬프트가 영어로만 작성되어 있어, AI 모델이 한국어 키워드를 무시하거나 잘못 처리했습니다.
현재 버전에서는 **프롬프트 자체를 한국어로 작성**하여 AI가 한국어·영어 키워드를 모두 올바르게 처리합니다.
영어 입력 시에만 동작하던 문제가 해결됩니다.
