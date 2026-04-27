#!/usr/bin/env python3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os, re, json, base64
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not found in environment")

genai.configure(api_key=GEMINI_API_KEY)

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

@app.post("/generate")
async def generate(body: RequestBody):
    keyword = body.keyword.strip()[:200]
    language = body.language or "ko"

    if not keyword and not body.image:
        raise HTTPException(status_code=400, detail="keyword or image is required")

    lang_instruction = "한국어" if language == "ko" else "English"

    system_prompt = (
        f"You are a social media hashtag expert. Generate hashtags in {lang_instruction}. "
        "Return ONLY valid JSON with these exact fields:\n"
        '{"instagram": "#tag1 #tag2 #tag3 #tag4 #tag5", '
        '"tiktok": "#tag1 #tag2 #tag3 #tag4 #tag5", '
        '"blog": "#tag1 #tag2 #tag3 #tag4 #tag5", '
        '"analysis": "한 줄 분석 코멘트"}'
        "\nInstagram: 5 popular tags, TikTok: 5 trending tags, Blog: 5 SEO-friendly tags. No duplicates. Return JSON only, no markdown, no explanation."
    )

    user_prompt = f"키워드: {keyword}" if keyword else "첨부된 이미지를 분석해서 해시태그를 생성해줘."

    try:
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=system_prompt
        )

        if body.image:
            image_data = base64.b64decode(body.image)
            contents = [
                {"mime_type": "image/jpeg", "data": image_data},
                user_prompt
            ]
            response = model.generate_content(contents)
        else:
            response = model.generate_content(user_prompt)

        output_text = response.text

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")

    try:
        m = re.search(r"\{.*\}", output_text, re.S)
        if m:
            parsed = json.loads(m.group(0))
            return {
                "instagram": parsed.get("instagram", ""),
                "tiktok": parsed.get("tiktok", ""),
                "blog": parsed.get("blog", ""),
                "analysis": parsed.get("analysis", "분석이 완료되었습니다.")
            }
    except Exception:
        pass

    return {
        "instagram": output_text[:200],
        "tiktok": "",
        "blog": "",
        "analysis": "태그가 생성되었습니다."
    }

@app.get("/health")
async def health():
    return {"status": "ok"}
