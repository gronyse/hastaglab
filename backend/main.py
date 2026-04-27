#!/usr/bin/env python3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os, re, json
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not DEEPSEEK_API_KEY:
    raise RuntimeError("DEEPSEEK_API_KEY not found in environment")

client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)

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

def build_system_prompt(language: str) -> str:
    lang_instruction = "한국어" if language == "ko" else "English"
    analysis_example = "한 줄 분석 코멘트" if language == "ko" else "One-line analysis comment"
    return (
        f"You are a social media hashtag expert. Generate hashtags in {lang_instruction}. "
        "Return ONLY valid JSON with these exact fields:\n"
        f'{{"instagram": "#tag1 #tag2 #tag3 #tag4 #tag5", '
        f'"tiktok": "#tag1 #tag2 #tag3 #tag4 #tag5", '
        f'"blog": "#tag1 #tag2 #tag3 #tag4 #tag5", '
        f'"analysis": "{analysis_example}"}}'
        "\nInstagram: 5 popular tags, TikTok: 5 trending tags, Blog: 5 SEO-friendly tags. No duplicates. Return JSON only, no markdown, no explanation."
    )

@app.post("/generate")
async def generate(body: RequestBody):
    keyword = body.keyword.strip()[:200]
    language = body.language or "ko"

    if not keyword and not body.image:
        raise HTTPException(status_code=400, detail="keyword or image is required")

    system_prompt = build_system_prompt(language)

    try:
        if body.image:
            # 이미지 분석: deepseek-v4-pro (비전 모델)
            image_data_url = f"data:image/jpeg;base64,{body.image}"
            user_content = [
                {"type": "image_url", "image_url": {"url": image_data_url}},
                {"type": "text", "text": "첨부된 이미지를 분석해서 해시태그를 생성해줘."}
            ]
            if keyword:
                user_content.append({"type": "text", "text": f"추가 키워드: {keyword}"})

            response = client.chat.completions.create(
                model="deepseek-v4-pro",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                max_tokens=512,
            )
        else:
            # 텍스트만: deepseek-v4-flash (빠르고 저렴)
            response = client.chat.completions.create(
                model="deepseek-v4-flash",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"키워드: {keyword}"}
                ],
                max_tokens=512,
            )

        output_text = response.choices[0].message.content

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
