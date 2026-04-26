import asyncio
import json
import os
import re
import time
from datetime import date
from pathlib import Path

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="해시태그 연구소")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8001"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_KOREAN_PATTERN = re.compile(r"[가-힣]")
_HASHTAG_PATTERN = re.compile(r"#\w+")

MAX_DAILY = 15
MAX_INPUT_LEN = 1000
MIN_INTERVAL = 3.0
GEMINI_MODELS = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"]
RATE_FILE = Path(__file__).parent / ".rate_limit.json"

GEMINI_KEY = os.getenv("GEMINI_API_KEY")
DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY")

if not GEMINI_KEY and not DEEPSEEK_KEY:
    raise RuntimeError("GEMINI_API_KEY 또는 DEEPSEEK_API_KEY 중 하나 이상 설정해야 합니다.")

if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)

deepseek = OpenAI(api_key=DEEPSEEK_KEY, base_url="https://api.deepseek.com") if DEEPSEEK_KEY else None

_last_req_time: float = 0.0


def _load_rate() -> dict:
    if RATE_FILE.exists():
        try:
            return json.loads(RATE_FILE.read_text())
        except Exception:
            pass
    return {}


def _check_and_increment() -> None:
    global _last_req_time
    now = time.time()
    wait = MIN_INTERVAL - (now - _last_req_time)
    if wait > 0:
        raise HTTPException(status_code=429, detail=f"요청이 너무 빨라요. {wait:.1f}초 후 다시 시도해주세요.")

    today = date.today().isoformat()
    data = _load_rate()
    count = data.get("count", 0) if data.get("date") == today else 0
    if count >= MAX_DAILY:
        raise HTTPException(status_code=429, detail=f"오늘 생성 한도({MAX_DAILY}회)를 초과했어요. 내일 다시 시도해주세요.")

    _last_req_time = now
    RATE_FILE.write_text(json.dumps({"date": today, "count": count + 1}))


class HashtagRequest(BaseModel):
    text: str = ""
    image_base64: str = ""
    image_type: str = "image/jpeg"


def _build_prompt(text: str, existing: list, has_korean: bool) -> str:
    lines = ["인스타그램 해시태그 15개를 추천해줘. #태그 형식으로 한 줄에 하나씩만 출력해."]
    if text:
        lines.append(f"텍스트: {text}")
    if existing:
        lines.append(f"기존 태그: {', '.join(existing)}")
    if has_korean:
        lines.append("한국어 태그 포함.")
    return "\n".join(lines)


def _parse(content: str) -> list:
    return [h.strip() for h in content.split("\n") if h.strip().startswith("#")][:20]


async def _call_gemini(prompt: str, image_base64: str, image_type: str) -> str:
    import base64
    for model_name in GEMINI_MODELS:
        try:
            model = genai.GenerativeModel(model_name)
            parts = []
            if image_base64:
                parts.append({"mime_type": image_type, "data": base64.b64decode(image_base64)})
            parts.append(prompt)
            resp = await asyncio.to_thread(model.generate_content, parts, generation_config={"max_output_tokens": 400})
            return resp.text
        except Exception as e:
            msg = str(e)
            if "429" in msg or "quota" in msg.lower() or "503" in msg:
                continue
            raise
    raise RuntimeError("모든 Gemini 모델 호출 실패 (할당량 초과)")


async def _call_deepseek(prompt: str) -> str:
    if not deepseek:
        raise RuntimeError("DeepSeek API 키가 설정되지 않았어요.")
    resp = await asyncio.to_thread(
        deepseek.chat.completions.create,
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=400,
        temperature=0.7,
    )
    return resp.choices[0].message.content


@app.get("/")
async def read_root():
    p = Path(__file__).parent / "static" / "index.html"
    if p.exists():
        return FileResponse(str(p))
    raise HTTPException(status_code=404, detail="index.html을 찾을 수 없어요.")


@app.post("/api/generate-hashtags")
async def generate_hashtags(req: HashtagRequest, request: Request):
    _check_and_increment()

    text = req.text.strip()[:MAX_INPUT_LEN]
    if not text and not req.image_base64:
        raise HTTPException(status_code=400, detail="텍스트 또는 이미지를 입력해주세요.")

    has_korean = bool(_KOREAN_PATTERN.search(text))
    existing = _HASHTAG_PATTERN.findall(text)
    prompt = _build_prompt(text, existing, has_korean)

    content = None
    last_err = ""

    if GEMINI_KEY:
        try:
            content = await _call_gemini(prompt, req.image_base64, req.image_type)
        except Exception as e:
            last_err = str(e)

    if content is None:
        try:
            content = await _call_deepseek(prompt)
        except Exception as e:
            last_err = str(e)

    if content is None:
        raise HTTPException(status_code=502, detail=f"AI 서비스 오류: {last_err}")

    data = _load_rate()
    remaining = MAX_DAILY - data.get("count", 0)

    return {
        "hashtags": _parse(content),
        "existing": existing,
        "has_korean": has_korean,
        "remaining_today": remaining,
    }


@app.get("/health")
async def health():
    data = _load_rate()
    today = date.today().isoformat()
    used = data.get("count", 0) if data.get("date") == today else 0
    return {"status": "ok", "used_today": used, "remaining_today": MAX_DAILY - used}


static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

