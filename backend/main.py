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
from pydantic import BaseModel, Field

try:
    import redis
except ImportError:
    redis = None

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


def get_list_env(name: str, default: str):
    value = os.getenv(name, default).strip()
    if not value:
        return []
    if value == "*":
        return ["*"]
    return [item.strip() for item in value.split(",") if item.strip()]


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
CORS_ALLOWED_ORIGINS = get_list_env("CORS_ALLOWED_ORIGINS", "*")
REDIS_URL = os.getenv("REDIS_URL")

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

redis_client = redis.from_url(REDIS_URL, decode_responses=True) if redis and REDIS_URL else None

rate_state = defaultdict(lambda: {"minute": [], "day": [], "image_day": []})
global_rate_state = {"day": []}
response_cache = OrderedDict()

app = FastAPI(title="HashTag Generator Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=CORS_ALLOWED_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RequestBody(BaseModel):
    keyword: str = ""
    image: Optional[str] = None
    language: Optional[str] = "ko"
    styles: list[str] = Field(default_factory=list)
    variant: int = 0
    exclude_words: list[str] = Field(default_factory=list)


STYLE_INSTRUCTIONS = {
    "trendy": "Add current, natural trend tags and common global shorthand when it truly fits.",
    "seo": "Strengthen Blog with concrete long-tail search phrases and review/search intent.",
    "mood": "Strengthen Instagram with emotional, lifestyle, and vibe-focused tags.",
    "food": "Prioritize restaurant, menu, dining occasion, and food discovery tags.",
    "shop": "Prioritize shopping, product, brand, fit, detail, and purchase-intent tags.",
    "travel": "Prioritize place, itinerary, trip mood, and travel discovery tags.",
}

STYLE_LABELS_KO = {
    "trendy": "트렌디",
    "seo": "SEO",
    "mood": "감성",
    "food": "맛집",
    "shop": "쇼핑몰",
    "travel": "여행",
}

KNOWN_LOCATIONS = {
    "서울", "강남", "홍대", "연남", "성수", "잠실", "명동", "이태원", "용산", "건대", "신촌", "종로", "마포",
    "수원", "분당", "판교", "용인", "성남", "일산", "파주", "김포", "부천", "안양", "의정부", "하남", "광교",
    "인천", "송도", "부산", "해운대", "서면", "광안리", "대구", "동성로", "대전", "둔산", "광주", "울산",
    "제주", "서귀포", "강릉", "속초", "양양", "춘천", "전주", "여수", "순천", "경주", "포항", "청주", "천안",
}

LOCATION_ALIASES = {
    "seoul": "서울",
    "gangnam": "강남",
    "suwon": "수원",
    "jeju": "제주",
    "busan": "부산",
    "incheon": "인천",
    "daegu": "대구",
    "daejeon": "대전",
    "gwangju": "광주",
    "ulsan": "울산",
}


def valid_styles(styles):
    return [style for style in styles if style in STYLE_INSTRUCTIONS]


def build_prompts(keyword: str, language: str, has_image: bool, styles: list[str], exclude_words: list[str]):
    lang_instruction = "한국어" if language == "ko" else "English"
    analysis_example = "한 줄 분석 코멘트" if language == "ko" else "One-line analysis comment"
    active_styles = valid_styles(styles)
    style_prompt = " ".join(STYLE_INSTRUCTIONS[style] for style in active_styles)
    exclude_prompt = ""
    if exclude_words:
        exclude_prompt = f" Never include these words or hashtags containing them: {', '.join(exclude_words[:12])}."
    system_prompt = (
        f"You are a social media hashtag expert. Generate hashtags in {lang_instruction}. "
        "Return ONLY valid JSON with these exact fields:\n"
        f'{{"instagram": "#tag1 #tag2 #tag3 #tag4 #tag5", '
        f'"tiktok": "#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8", '
        f'"blog": "#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8", '
        f'"analysis": "{analysis_example}"}}'
        "\nInstagram must have exactly 5 highly relevant hashtags. TikTok and Blog should each have 8 to 15 useful hashtags. "
        "Keep them specific, varied, and not padded with weak generic tags. "
        "When keywords look like a restaurant, local shop, place, menu, product, or brand, infer likely intent and include: "
        "exact keyword tags, spaced/combined Korean variants, menu or product tags, local discovery tags, review/search intent tags, and a few broad reach tags. "
        "For restaurants, include cuisine, signature menu, dining occasion, neighborhood/city if inferable, reservation or review intent, and Korean food-content tags. "
        "Instagram should balance brand/menu/local/lifestyle tags. TikTok should include short-form trend, mukbang, sound/visual, and viral discovery tags. "
        "Blog should focus on SEO long-tail search phrases and local intent. "
        f"{style_prompt} "
        "When a Korean keyword belongs to a category with widely used global shorthand or English trend tags, include a small number of natural English tags. "
        "Examples: fashion/outfit -> #ootd #outfitideas #dailylook; beauty -> #makeup #skincare; food -> #koreanfood #foodie; travel -> #travelgram #travelvlog; cafe -> #cafestagram #coffee. "
        "Use only English tags that are genuinely common for that category, and keep most tags in the requested language. "
        "Do not invent delivery app names, reservation platforms, cities, neighborhoods, awards, prices, or business facts that are not present in the keyword or image. "
        "Never add a city or district hashtag unless that city or district appears explicitly in the input or image. "
        "Ambiguous words such as 양지 must not be treated as a location by default; if the surrounding words are food, brand, or menu terms, treat them in that context. "
        "The analysis must not say '지역으로 추정', '지역으로 판단', or make any firm location claim unless the location was explicit. "
        "If details are uncertain, use neutral discovery tags such as 맛집추천, 메뉴추천, 방문후기, 데이트맛집, 가족외식, or local-food tags. "
        "Avoid weak generic-only outputs such as just #맛스타그램 or #food. No duplicates within or across platforms unless the exact keyword is essential. "
        f"{exclude_prompt} Return JSON only, no markdown, no explanation."
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


def redis_key(*parts):
    joined = ":".join(str(part) for part in parts)
    return "hastaglab:" + hashlib.sha256(joined.encode("utf-8")).hexdigest()


def redis_window_count(key: str, now: float, window_seconds: int):
    assert redis_client is not None
    redis_client.zremrangebyscore(key, 0, now - window_seconds)
    return int(redis_client.zcard(key))


def redis_add_event(key: str, now: float, window_seconds: int):
    assert redis_client is not None
    member = f"{now}:{time.time_ns()}"
    redis_client.zadd(key, {member: now})
    redis_client.expire(key, window_seconds + 120)


def check_rate_limit_redis(ip: str, has_image: bool):
    now = time.time()
    minute_key = redis_key("minute", ip)
    day_key = redis_key("day", ip)
    image_key = redis_key("image_day", ip)
    global_key = "hastaglab:global:day"

    minute_count = redis_window_count(minute_key, now, 60)
    day_count = redis_window_count(day_key, now, 86400)
    image_count = redis_window_count(image_key, now, 86400)
    global_count = redis_window_count(global_key, now, 86400)

    if minute_count >= RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail="too many requests per minute",
            headers={"Retry-After": "60"},
        )
    if day_count >= RATE_LIMIT_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="daily request limit reached",
            headers={"Retry-After": "3600"},
        )
    if has_image and image_count >= IMAGE_LIMIT_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="daily image request limit reached",
            headers={"Retry-After": "3600"},
        )
    if global_count >= GLOBAL_LIMIT_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="service daily request limit reached",
            headers={"Retry-After": "3600"},
        )

    redis_add_event(minute_key, now, 60)
    redis_add_event(day_key, now, 86400)
    redis_add_event(global_key, now, 86400)
    if has_image:
        redis_add_event(image_key, now, 86400)
        image_count += 1

    return {
        "used": day_count + 1,
        "limit": RATE_LIMIT_PER_DAY,
        "image_used": image_count,
        "image_limit": IMAGE_LIMIT_PER_DAY,
    }


def check_rate_limit(ip: str, has_image: bool):
    if redis_client:
        try:
            return check_rate_limit_redis(ip, has_image)
        except HTTPException:
            raise
        except Exception:
            pass

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
    return {
        "used": len(state["day"]),
        "limit": RATE_LIMIT_PER_DAY,
        "image_used": len(state["image_day"]),
        "image_limit": IMAGE_LIMIT_PER_DAY,
    }


def cache_key(body: RequestBody, keyword: str, language: str):
    image_hash = hashlib.sha256(body.image.encode("utf-8")).hexdigest() if body.image else ""
    raw_key = json.dumps(
        {
            "keyword": keyword,
            "language": language,
            "image_hash": image_hash,
            "styles": sorted(valid_styles(body.styles)),
            "variant": body.variant,
            "exclude_words": sorted([word.strip().lower() for word in body.exclude_words if word.strip()])[:12],
        },
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


def normalize_tag_token(token: str):
    value = token.strip().strip('"\'`.,')
    if not value:
        return ""
    value = value.lstrip("#")
    value = re.sub(r"\s+", "", value)
    value = re.sub(r"[^\w가-힣ぁ-んァ-ン一-龥]+", "", value)
    return f"#{value}" if value else ""


def extract_tags(text: str):
    if not text:
        return []
    raw_tokens = re.split(r"[\s,;|/]+", text)
    tags = []
    for token in raw_tokens:
        tag = normalize_tag_token(token)
        if tag:
            tags.append(tag)
    return tags


def explicit_locations(keyword: str):
    compact = re.sub(r"\s+", "", (keyword or "").lower())
    found = {location for location in KNOWN_LOCATIONS if location.lower() in compact}
    for alias, location in LOCATION_ALIASES.items():
        if alias in compact:
            found.add(location)
    return found


def tag_has_blocked_location(tag: str, allowed_locations: set[str]):
    body = tag.lstrip("#").lower()
    for location in KNOWN_LOCATIONS:
        if location in allowed_locations:
            continue
        if location.lower() in body:
            return True
    return False


def tag_has_excluded_word(tag: str, exclude_words: list[str]):
    body = tag.lstrip("#").lower()
    return any(word.strip().lower() and word.strip().lower() in body for word in exclude_words)


def required_tags(keyword: str, platform: str):
    lower = (keyword or "").lower()
    tags = []
    if any(word in keyword for word in ["오늘의착장", "데일리룩", "패션", "옷", "코디", "착장"]) or "ootd" in lower:
        tags.append("#OOTD")
        if platform in {"tiktok", "blog"}:
            tags.extend(["#dailylook", "#outfitideas"])
    return tags


def can_use_tag(tag: str, allowed_locations: set[str], exclude_words: list[str]):
    return not tag_has_blocked_location(tag, allowed_locations) and not tag_has_excluded_word(tag, exclude_words)


def base_supplement_tags(keyword: str, platform: str, styles: list[str]):
    parts = [part.strip() for part in re.split(r"[,;/|]+", keyword or "") if part.strip()]
    candidates = []
    compact_keyword = ""
    if keyword and not re.search(r"[,;/|]", keyword):
        compact_keyword = re.sub(r"\s+", "", keyword)
    for value in [compact_keyword, *parts]:
        tag = normalize_tag_token(value)
        if tag:
            candidates.append(tag)

    lower = (keyword or "").lower()
    if any(word in keyword for word in ["한우", "갈비", "소고기", "고기", "맛집", "식당", "국밥"]):
        candidates.extend([
            "#한우맛집", "#양지갈비", "#소고기맛집", "#고기맛집", "#갈비맛집", "#한식맛집",
            "#가족외식", "#외식추천", "#메뉴추천", "#방문후기", "#먹스타그램", "#맛집추천",
            "#KoreanBBQ", "#koreanfood", "#foodie",
        ])
    if any(word in keyword for word in ["오늘의착장", "데일리룩", "패션", "옷", "코디", "착장"]) or "ootd" in lower:
        candidates.extend([
            "#오늘의착장", "#오늘패션", "#오늘뭐입지", "#데일리룩", "#패션스타그램",
            "#코디추천", "#OOTD", "#dailylook", "#outfitideas", "#fashion",
        ])
    if any(word in keyword for word in ["카페", "커피", "디저트"]):
        candidates.extend(["#카페추천", "#감성카페", "#디저트카페", "#커피맛집", "#cafestagram", "#coffee"])
    if any(word in keyword for word in ["여행", "숙소", "호텔", "바다", "제주"]):
        candidates.extend(["#여행추천", "#국내여행", "#여행코스", "#여행스타그램", "#travelgram", "#travelvlog"])
    if "seo" in styles or platform == "blog":
        candidates.extend(["#검색추천", "#리뷰", "#후기", "#정보공유"])
    if "mood" in styles or platform == "instagram":
        candidates.extend(["#일상기록", "#감성기록", "#오늘의기록"])
    if "trendy" in styles or platform == "tiktok":
        candidates.extend(["#추천", "#트렌드", "#틱톡추천"])
    return candidates


def process_platform_tags(
    text: str,
    keyword: str,
    platform: str,
    limit: int,
    allowed_locations: set[str],
    exclude_words: list[str],
    styles: list[str],
):
    seen = set()
    output = []
    for tag in [*extract_tags(text), *base_supplement_tags(keyword, platform, styles)]:
        if tag.lower() == "#ootd" or tag == "#오오티디":
            tag = "#OOTD"
        key = tag.lower()
        if key in seen:
            continue
        if not can_use_tag(tag, allowed_locations, exclude_words):
            continue
        seen.add(key)
        output.append(tag)
        if len(output) >= limit:
            break

    replace_index = len(output) - 1
    for tag in required_tags(keyword, platform):
        normalized = normalize_tag_token(tag)
        if not normalized or normalized.lower() in seen or not can_use_tag(normalized, allowed_locations, exclude_words):
            continue
        if len(output) < limit:
            output.append(normalized)
        elif output and replace_index >= 0:
            output[replace_index] = normalized
            replace_index -= 1
        seen.add(normalized.lower())
    return " ".join(output)


def sanitize_analysis(analysis: str, keyword: str, language: str, styles: list[str]):
    text = (analysis or "").strip() or ("분석이 완료되었습니다." if language == "ko" else "Analysis complete.")
    allowed_locations = explicit_locations(keyword)
    blocked_location_claim = any(location not in allowed_locations and location in text for location in KNOWN_LOCATIONS)
    blocked_phrases = ["지역으로 추정", "지역으로 판단", "지역으로 보", "지역명으로 추정", "지역명으로 판단"]
    if blocked_location_claim or any(phrase in text for phrase in blocked_phrases):
        text = (
            "입력 키워드를 음식/브랜드/메뉴 맥락으로 해석하고, 입력에 없는 구체 지역명은 제외해 플랫폼별 태그를 구성했습니다."
            if language == "ko"
            else "Tags were built from the keyword context without adding unprovided specific locations."
        )

    active_styles = valid_styles(styles)
    if active_styles and language == "ko":
        labels = ", ".join(STYLE_LABELS_KO[style] for style in active_styles)
        if labels not in text:
            text = f"{text} 선택 스타일({labels})을 반영했습니다."
    elif active_styles and "Selected styles" not in text:
        labels = ", ".join(active_styles)
        text = f"{text} Selected styles reflected: {labels}."
    return text


def normalize_result(result: dict, keyword: str, language: str, styles: list[str], exclude_words: list[str]):
    allowed_locations = explicit_locations(keyword)
    return {
        "instagram": process_platform_tags(result.get("instagram", ""), keyword, "instagram", 5, allowed_locations, exclude_words, styles),
        "tiktok": process_platform_tags(result.get("tiktok", ""), keyword, "tiktok", 15, allowed_locations, exclude_words, styles),
        "blog": process_platform_tags(result.get("blog", ""), keyword, "blog", 15, allowed_locations, exclude_words, styles),
        "analysis": sanitize_analysis(result.get("analysis", ""), keyword, language, styles),
        "policy": {
            "instagram": "5",
            "tiktok": "8-15",
            "blog": "8-15",
        },
    }


def with_quota(result: dict, quota: dict):
    response = dict(result)
    response["quota"] = quota
    return response


@app.post("/generate")
async def generate(body: RequestBody, request: Request):
    keyword = body.keyword.strip()[:200]
    language = body.language or "ko"

    if not keyword and not body.image:
        raise HTTPException(status_code=400, detail="keyword or image is required")

    quota = check_rate_limit(client_ip(request), bool(body.image))

    key = cache_key(body, keyword, language)
    cached = get_cached_response(key)
    if cached:
        return with_quota(cached, quota)

    exclude_words = [word.strip()[:40] for word in body.exclude_words if word.strip()]
    system_prompt, user_prompt = build_prompts(keyword, language, bool(body.image), body.styles, exclude_words)
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

    processed = normalize_result(result, keyword, language, body.styles, exclude_words)

    set_cached_response(key, processed)
    return with_quota(processed, quota)


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
        "cors_allowed_origins": CORS_ALLOWED_ORIGINS,
        "redis_configured": bool(redis_client),
    }
