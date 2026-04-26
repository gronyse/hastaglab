# 해시태그 연구소 🔬

> 텍스트 또는 이미지를 입력하면 AI(Gemini)가 인스타그램 해시태그를 자동으로 추천해주는 웹 앱이에요.
> Gemini 무료 할당량 초과 시 DeepSeek으로 자동 전환됩니다.

---

## 🗂️ 폴더 구조

```
hastaglab/
├── backend/
│   ├── main.py          ← 서버 코드 (FastAPI)
│   ├── requirements.txt ← 필요한 패키지 목록
│   ├── .env.example     ← API 키 설정 예시
│   └── static/
│       └── index.html   ← 웹 UI
├── .gitignore
├── start.sh             ← 한 번에 실행하는 스크립트
└── README.md
```

---

## 🛠️ 처음 설치하기 (맥 기준)

```bash
git clone https://github.com/gronyse/hastaglab.git
cd hastaglab
chmod +x start.sh
./start.sh
```

실행하면:
1. Python3 설치 여부 확인
2. Gemini / DeepSeek API 키 입력 요청 (최초 1회)
3. 패키지 설치
4. 서버 시작 + 브라우저 자동 열기

---

## 🔑 API 키 발급

| 서비스 | URL | 용도 |
|--------|-----|------|
| Gemini | https://aistudio.google.com/app/apikey | 주 AI (이미지+텍스트) |
| DeepSeek | https://platform.deepseek.com/api-keys | 보조 AI (텍스트) |

> ⚠️ API 키는 절대 다른 사람과 공유하지 마세요. `.env` 파일은 `.gitignore`로 보호됩니다.

---

## 🖥️ 사용 방법

1. [http://localhost:8001](http://localhost:8001) 접속
2. 텍스트 입력 또는 이미지 업로드
3. **✨ 해시태그 생성하기** 클릭
4. 태그 클릭 → 개별 복사 / **📋 전체 복사** 버튼 활용

---

## 🛡️ API 호출 제한 (Rate Limit)

- **하루 15회** 생성 제한 (자정에 자동 초기화)
- **요청 간격** 최소 3초
- **입력 길이** 최대 1,000자
- **응답 토큰** 최대 400 tokens
- Gemini 할당량 초과 → 자동으로 DeepSeek 전환

---

## ❓ 자주 묻는 문제

### 포트 8001이 이미 사용 중이에요

```bash
lsof -i :8001
```

위 명령으로 PID를 확인한 뒤 해당 프로세스를 종료하세요.

### API 키를 바꾸고 싶어요

`backend/.env` 파일을 텍스트 편집기로 열어서 수정하세요.

---

## 🧑‍💻 기술 스택

| 구분 | 기술 |
|------|------|
| 백엔드 | Python + FastAPI |
| 주 AI | Google Gemini 2.0 Flash Lite (비전 지원) |
| 보조 AI | DeepSeek V3 (텍스트 fallback) |
| 프론트엔드 | HTML + CSS + JavaScript |
| 포트 | 8001 |
