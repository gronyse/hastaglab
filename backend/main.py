# -*- coding: utf-8 -*-
"""
해시태그 연구소 (Hashtag Lab) - FastAPI Backend
Handles image analysis and hashtag generation using OpenAI Vision API.

Korean language support is fully implemented:
- All prompts handle Korean and English input/output
- UTF-8 encoding is used throughout
- Language auto-detection from user keywords
"""

import os
import re
import base64
import logging
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import openai
import httpx

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="해시태그 연구소 API",
    description="이미지와 키워드를 기반으로 인스타그램 해시태그를 생성합니다.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# OpenAI client – loaded lazily so missing key shows a clear error
# ---------------------------------------------------------------------------
def get_openai_client() -> openai.OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="서버 설정 오류: OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.",
        )
    return openai.OpenAI(api_key=api_key)


# ---------------------------------------------------------------------------
# Language helpers
# ---------------------------------------------------------------------------
def _contains_korean(text: str) -> bool:
    """Return True if *text* contains at least one Korean character."""
    return bool(re.search(r"[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]", text))


def _build_prompt(keywords: str) -> str:
    """
    Build a bilingual hashtag-generation prompt.

    The prompt is always written in Korean so that the model understands
    Korean keywords correctly.  Previously this was in English-only, which
    caused the model to misinterpret or ignore Korean keywords.
    """
    keyword_section = (
        f"\n\n사용자가 입력한 키워드: {keywords}" if keywords.strip() else ""
    )

    return f"""당신은 인스타그램 해시태그 전문가입니다.
아래 사진을 분석하고, 인스타그램에 올리기 좋은 해시태그를 25~30개 생성해주세요.{keyword_section}

[규칙]
1. 사진의 내용을 정확하게 반영하세요.
2. 사용자가 입력한 키워드가 있다면 반드시 반영하세요.
3. 한국어 해시태그와 영어 해시태그를 적절히 섞어 사용하세요.
4. 각 해시태그는 #으로 시작하고 공백 없이 작성하세요.
5. 결과는 해시태그만 한 줄로 공백으로 구분하여 출력하세요. 설명 문장은 절대 쓰지 마세요.
6. 인기 해시태그(팔로워 유입에 효과적)를 우선적으로 선정하세요.

출력 예시:
#감성사진 #일상 #여행 #맛집 #인스타그램 #photo #travel #daily #korea #photooftheday"""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "message": "해시태그 연구소 서버가 정상 작동 중입니다."}


@app.post("/generate-hashtags")
async def generate_hashtags(
    image: UploadFile = File(...),
    keywords: str = Form(""),
):
    """
    이미지와 선택적 키워드를 받아 해시태그 목록을 반환합니다.

    Fix: Korean keywords are now passed inside a Korean-language prompt so that
    the OpenAI model handles them correctly.  Previously an English prompt
    caused Korean keywords to be silently ignored or mis-processed, which made
    it appear as if no hashtags were generated when the user typed in Korean.
    """
    # ---- validate content type -----------------------------------------
    content_type = image.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드할 수 있습니다.")

    # ---- read and encode image ------------------------------------------
    try:
        image_bytes = await image.read()
    except Exception as exc:
        logger.error("이미지 읽기 실패: %s", exc)
        raise HTTPException(status_code=400, detail="이미지를 읽는 중 오류가 발생했습니다.")

    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="빈 이미지 파일입니다.")

    # Limit to 10 MB to avoid overly large payloads
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="이미지 파일 크기가 너무 큽니다 (최대 10MB).")

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    # ---- build prompt (always Korean so Korean keywords are understood) --
    prompt = _build_prompt(keywords)
    logger.info(
        "해시태그 생성 요청 – 키워드: %r, 한국어 포함: %s",
        keywords,
        _contains_korean(keywords),
    )

    # ---- call OpenAI Vision API -----------------------------------------
    client = get_openai_client()
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{b64_image}",
                                "detail": "low",   # saves tokens while keeping accuracy
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            max_tokens=512,
            temperature=0.7,
        )
    except openai.AuthenticationError:
        logger.error("OpenAI 인증 실패")
        raise HTTPException(status_code=500, detail="API 키 인증에 실패했습니다. 서버 설정을 확인하세요.")
    except openai.RateLimitError:
        logger.warning("OpenAI 요청 한도 초과")
        raise HTTPException(status_code=429, detail="API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.")
    except openai.APIConnectionError as exc:
        logger.error("OpenAI 연결 오류: %s", exc)
        raise HTTPException(status_code=503, detail="AI 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.")
    except Exception as exc:
        logger.error("OpenAI 호출 중 예외 발생: %s", exc)
        raise HTTPException(status_code=500, detail=f"해시태그 생성 중 오류가 발생했습니다: {exc}")

    raw_output = response.choices[0].message.content or ""
    logger.info("OpenAI 응답 원문: %s", raw_output[:200])

    # ---- extract hashtags from response ---------------------------------
    # Accept tags with Korean, Japanese, English, numbers, and underscores
    hashtags = re.findall(r"#[\w\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]+", raw_output)

    if not hashtags:
        # Fallback: split by whitespace and filter lines starting with #
        hashtags = [
            token
            for token in raw_output.split()
            if token.startswith("#") and len(token) > 1
        ]

    logger.info("추출된 해시태그 %d개", len(hashtags))

    return {
        "hashtags": hashtags,
        "count": len(hashtags),
        "raw": raw_output,
    }
