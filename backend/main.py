#!/usr/bin/env python3
import base64
import hashlib
import io
import json
import os
import re
import time
from collections import OrderedDict, defaultdict
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from openai import OpenAI
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

load_dotenv()


def get_int_env(name: str, default: int):
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def get_bool_env(name: str, default: bool):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
AI_PROVIDER = os.getenv("AI_PROVIDER", "auto").strip().lower()
DEEPSEEK_FALLBACK_TO_GEMINI = get_bool_env("DEEPSEEK_FALLBACK_TO_GEMINI", True)
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_IMAGE_MODEL = os.getenv("DEEPSEEK_IMAGE_MODEL", "deepseek-v4-pro")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
MAX_IMAGE_BYTES = get_int_env("MAX_IMAGE_BYTES", 10000000)
RATE_LIMIT_PER_MINUTE = get_int_env("RATE_LIMIT_PER_MINUTE", 10)
RATE_LIMIT_PER_DAY = get_int_env("RATE_LIMIT_PER_DAY", 100)
IMAGE_LIMIT_PER_DAY = get_int_env("IMAGE_LIMIT_PER_DAY", 20)
GLOBAL_LIMIT_PER_DAY = get_int_env("GLOBAL_LIMIT_PER_DAY", 1000)
CACHE_TTL_SECONDS = get_int_env("CACHE_TTL_SECONDS", 3600)
CACHE_MAX_ITEMS = get_int_env("CACHE_MAX_ITEMS", 500)
AI_REQUEST_TIMEOUT_MS = get_int_env("AI_REQUEST_TIMEOUT_MS", 60000)

gemini_client = (
    genai.Client(
        api_key=GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=AI_REQUEST_TIMEOUT_MS),
    )
    if GEMINI_API_KEY
    else None
)

deepseek_client = (
    OpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url="https://api.deepseek.com",
        timeout=AI_REQUEST_TIMEOUT_MS / 1000,
    )
    if DEEPSEEK_API_KEY
    else None
)

rate_state = defaultdict(lambda: {"minute": [], "day": [], "image_day": []})
global_rate_state = {"day": []}
response_cache = OrderedDict()

app = FastAPI(title="HashTag Generator Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RequestBody(BaseModel):
    keyword: str = ""
    image: Optional[str] = None
    language: Optional[str] = "ko"


def build_prompts(keyword: str, language: str, has_image: bool):
    lang_instruction = "한국어" if language == "ko" else "English"
    analysis_example = "한 줄 분석 코멘트" if language == "ko" else "One-line analysis comment"
    system_prompt = (
        f"You are a social media hashtag expert. Generate hashtags in {lang_instruction}. "
        "Return ONLY valid JSON with these exact fields:\n"
        f'{{"instagram": "#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8 #tag9 #tag10", '
        f'"tiktok": "#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8 #tag9 #tag10", '
        f'"blog": "#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8 #tag9 #tag10", '
        f'"analysis": "{analysis_example}"}}'
        "\nCreate 10 to 14 hashtags for each platform. Keep them useful, specific, and varied. "
        "When keywords look like a restaurant, local shop, place, menu, product, or brand, infer likely intent and include: "
        "exact keyword tags, spaced/combined Korean variants, menu or product tags, local discovery tags, review/search intent tags, and a few broad reach tags. "
        "For restaurants, include cuisine, signature menu, dining occasion, neighborhood/city if inferable, reservation or review intent, and Korean food-content tags. "
        "Instagram should balance brand/menu/local/lifestyle tags. TikTok should include short-form trend, mukbang, sound/visual, and viral discovery tags. "
        "Blog should focus on SEO long-tail search phrases and local intent. "
        "When a Korean keyword belongs to a category with widely used global shorthand or English trend tags, include a small number of natural English tags. "
        "Examples: fashion/outfit -> #ootd #outfitideas #dailylook; beauty -> #makeup #skincare; food -> #koreanfood #foodie; travel -> #travelgram #travelvlog; cafe -> #cafestagram #coffee. "
        "Use only English tags that are genuinely common for that category, and keep most tags in the requested language. "
        "Do not invent delivery app names, reservation platforms, cities, neighborhoods, awards, prices, or business facts that are not present in the keyword or image. "
        "Never add a city or district hashtag unless that city or district appears explicitly in the input or image. "
        "If details are uncertain, use neutral discovery tags such as 맛집추천, 메뉴추천, 방문후기, 데이트맛집, 가족외식, or local-food tags. "
        "Avoid weak generic-only outputs such as just #맛스타그램 or #food. No duplicates within or across platforms unless the exact keyword is essential. "
        "Return JSON only, no markdown, no explanation."
    )
    user_prompt = (
        f"키워드: {keyword}\n"
        "입력 키워드를 브랜드명/지역명/메뉴명/업종명으로 나누어 추론하고, 너무 짧거나 빈약하지 않게 플랫폼별 해시태그를 생성해줘."
        if keyword
        else "첨부된 이미지를 분석해서 핵심 피사체, 분위기, 장소/상품/음식 가능성을 추론하고 해시태그를 생성해줘."
    )
    if has_image and keyword:
        user_prompt = (
            f"키워드: {keyword}\n"
            "첨부된 이미지와 키워드를 함께 참고해 브랜드명/지역명/메뉴명/업종명을 추론하고 플랫폼별 해시태그를 생성해줘."
        )
    return system_prompt, user_prompt


def prepare_image(image_base64: str):
    try:
        image_data = base64.b64decode(image_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid image data")

    if len(image_data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image is too large")

    try:
        image = Image.open(io.BytesIO(image_data))
        image.thumbnail((1024, 1024))
        if image.mode != "RGB":
            image = image.convert("RGB")

        output = io.BytesIO()
        image.save(output, format="JPEG", quality=80, optimize=True)
        return output.getvalue()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="unsupported image format")


def choose_provider(has_image: bool):
    if AI_PROVIDER in {"deepseek", "gemini"}:
        return AI_PROVIDER
    if has_image:
        return "gemini"
    if deepseek_client:
        return "deepseek"
    return "gemini"


def can_fallback_to_gemini(provider: str):
    return provider == "deepseek" and DEEPSEEK_FALLBACK_TO_GEMINI and gemini_client


def generate_with_deepseek(system_prompt: str, user_prompt: str, image_base64: Optional[str]):
    if not deepseek_client:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY not configured")

    if image_base64:
        image_data = prepare_image(image_base64)
        image_data_url = f"data:image/jpeg;base64,{base64.b64encode(image_data).decode('ascii')}"
        user_content = [
            {"type": "image_url", "image_url": {"url": image_data_url}},
            {"type": "text", "text": user_prompt},
        ]
        response = deepseek_client.chat.completions.create(
            model=DEEPSEEK_IMAGE_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            max_tokens=1200,
        )
    else:
        response = deepseek_client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=1200,
            extra_body={"thinking": {"type": "disabled"}},
        )

    return response.choices[0].message.content or ""


def generate_with_gemini(system_prompt: str, user_prompt: str, image_base64: Optional[str]):
    if not gemini_client:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        response_mime_type="application/json",
        temperature=0.7,
        max_output_tokens=1200,
    )

    if image_base64:
        image_data = prepare_image(image_base64)
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=image_data, mime_type="image/jpeg"),
                user_prompt,
            ],
            config=config,
        )
    else:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=user_prompt,
            config=config,
        )

    return response.text or ""


def client_ip(request: Request):
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def trim_old_events(events, now: float, window_seconds: int):
    cutoff = now - window_seconds
    while events and events[0] < cutoff:
        events.pop(0)


def check_rate_limit(ip: str, has_image: bool):
    now = time.time()
    state = rate_state[ip]
    trim_old_events(state["minute"], now, 60)
    trim_old_events(state["day"], now, 86400)
    trim_old_events(state["image_day"], now, 86400)
    trim_old_events(global_rate_state["day"], now, 86400)

    if len(state["minute"]) >= RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail="too many requests per minute",
            headers={"Retry-After": "60"},
        )
    if len(state["day"]) >= RATE_LIMIT_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="daily request limit reached",
            headers={"Retry-After": "3600"},
        )
    if has_image and len(state["image_day"]) >= IMAGE_LIMIT_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="daily image request limit reached",
            headers={"Retry-After": "3600"},
        )
    if len(global_rate_state["day"]) >= GLOBAL_LIMIT_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="service daily request limit reached",
            headers={"Retry-After": "3600"},
        )

    state["minute"].append(now)
    state["day"].append(now)
    global_rate_state["day"].append(now)
    if has_image:
        state["image_day"].append(now)


def cache_key(body: RequestBody, keyword: str, language: str):
    image_hash = hashlib.sha256(body.image.encode("utf-8")).hexdigest() if body.image else ""
    raw_key = json.dumps(
        {"keyword": keyword, "language": language, "image_hash": image_hash},
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def get_cached_response(key: str):
    cached = response_cache.get(key)
    if not cached:
        return None

    created_at, result = cached
    if time.time() - created_at > CACHE_TTL_SECONDS:
        response_cache.pop(key, None)
        return None

    response_cache.move_to_end(key)
    return dict(result)


def set_cached_response(key: str, result: dict):
    response_cache[key] = (time.time(), dict(result))
    response_cache.move_to_end(key)

    while len(response_cache) > CACHE_MAX_ITEMS:
        response_cache.popitem(last=False)


def relaxed_field_extract(output_text: str):
    fields = {}
    for key in ["instagram", "tiktok", "blog", "analysis"]:
        pattern = rf'"{key}"\s*:\s*(.*?)(?=,\s*"(?:instagram|tiktok|blog|analysis)"\s*:|\s*\}})'
        match = re.search(pattern, output_text or "", re.S)
        if match:
            value = match.group(1).strip().strip(",").strip().strip('"').strip()
            fields[key] = value

    if all(fields.get(key) for key in ["instagram", "tiktok", "blog"]):
        return {
            "instagram": fields.get("instagram", ""),
            "tiktok": fields.get("tiktok", ""),
            "blog": fields.get("blog", ""),
            "analysis": fields.get("analysis", "분석이 완료되었습니다."),
        }
    return None


def parse_llm_json(output_text: str):
    try:
        m = re.search(r"\{.*\}", output_text or "", re.S)
        if m:
            parsed = json.loads(m.group(0))
            result = {
                "instagram": str(parsed.get("instagram", "")),
                "tiktok": str(parsed.get("tiktok", "")),
                "blog": str(parsed.get("blog", "")),
                "analysis": str(parsed.get("analysis", "분석이 완료되었습니다.")),
            }
            parsed_ok = all(result.get(key) for key in ["instagram", "tiktok", "blog"])
            return result, parsed_ok
    except Exception:
        pass

    relaxed = relaxed_field_extract(output_text or "")
    if relaxed:
        return relaxed, True

    return {
        "instagram": (output_text or "")[:200],
        "tiktok": "",
        "blog": "",
        "analysis": "태그가 생성되었습니다.",
    }, False


@app.post("/generate")
async def generate(body: RequestBody, request: Request):
    keyword = body.keyword.strip()[:200]
    language = body.language or "ko"

    if not keyword and not body.image:
        raise HTTPException(status_code=400, detail="keyword or image is required")

    check_rate_limit(client_ip(request), bool(body.image))

    key = cache_key(body, keyword, language)
    cached = get_cached_response(key)
    if cached:
        return cached

    system_prompt, user_prompt = build_prompts(keyword, language, bool(body.image))
    provider = choose_provider(bool(body.image))

    try:
        if provider == "deepseek":
            try:
                output_text = generate_with_deepseek(system_prompt, user_prompt, body.image)
            except Exception:
                if can_fallback_to_gemini(provider):
                    output_text = generate_with_gemini(system_prompt, user_prompt, body.image)
                else:
                    raise
        else:
            output_text = generate_with_gemini(system_prompt, user_prompt, body.image)

        result, parsed_ok = parse_llm_json(output_text)
        if not parsed_ok and can_fallback_to_gemini(provider):
            output_text = generate_with_gemini(system_prompt, user_prompt, body.image)
            result, parsed_ok = parse_llm_json(output_text)

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")

    set_cached_response(key, result)
    return result


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ai_provider": AI_PROVIDER,
        "deepseek_configured": bool(DEEPSEEK_API_KEY),
        "gemini_configured": bool(gemini_client),
        "deepseek_fallback_to_gemini": DEEPSEEK_FALLBACK_TO_GEMINI,
        "deepseek_model": DEEPSEEK_MODEL,
        "deepseek_image_model": DEEPSEEK_IMAGE_MODEL,
        "gemini_model": GEMINI_MODEL,
        "rate_limit_per_minute": RATE_LIMIT_PER_MINUTE,
        "rate_limit_per_day": RATE_LIMIT_PER_DAY,
        "image_limit_per_day": IMAGE_LIMIT_PER_DAY,
        "global_limit_per_day": GLOBAL_LIMIT_PER_DAY,
    }
