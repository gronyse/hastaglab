import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel
from dotenv import load_dotenv

# .env 파일에서 환경 변수 불러오기
load_dotenv()

app = FastAPI(title="해시태그 연구소")

# 모든 도메인에서 API 접근 허용 (개발용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 한국어 감지 패턴 (가~힣 범위의 유니코드)
_KOREAN_PATTERN = re.compile(r"[가-힣]")
# 기존 해시태그 추출 패턴
_HASHTAG_PATTERN = re.compile(r"#\w+")

# OpenAI 클라이언트 초기화
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class TextInput(BaseModel):
    text: str


@app.get("/")
async def read_root():
    """웹 UI 제공"""
    index_path = Path(__file__).parent / "static" / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    raise HTTPException(status_code=404, detail="index.html을 찾을 수 없어요.")


@app.post("/api/generate-hashtags")
async def generate_hashtags(input: TextInput):
    """텍스트를 받아 AI로 해시태그를 생성합니다."""
    text = input.text.strip()
    if not text:
        return {"hashtags": [], "existing": [], "error": "텍스트를 입력해주세요."}

    # 한국어 포함 여부 확인
    has_korean = bool(_KOREAN_PATTERN.search(text))
    # 이미 있는 해시태그 추출
    existing_hashtags = _HASHTAG_PATTERN.findall(text)

    prompt = f"""다음 텍스트에 어울리는 인스타그램 해시태그를 15개 추천해줘.

텍스트: {text}
기존 해시태그: {", ".join(existing_hashtags) if existing_hashtags else "없음"}
한국어 포함 여부: {"예" if has_korean else "아니오"}

규칙:
- 해시태그만 출력 (설명 없이)
- 한 줄에 하나씩
- #으로 시작
- 관련성 높은 순서로
- 인기 있는 태그 포함"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    )

    content = response.choices[0].message.content.strip()
    hashtags = [h.strip() for h in content.split("\n") if h.strip().startswith("#")]

    return {
        "hashtags": hashtags,
        "existing": existing_hashtags,
        "has_korean": has_korean,
    }


@app.get("/health")
async def health():
    """서버 상태 확인"""
    return {"status": "ok", "message": "서버가 정상 작동 중입니다."}


# 정적 파일(CSS, JS 등) 서빙
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
