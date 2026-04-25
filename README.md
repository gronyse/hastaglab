# 해시태그 연구소 🔬

> 텍스트를 입력하면 AI(GPT-4o)가 인스타그램에 최적화된 해시태그를 자동으로 추천해주는 웹 앱이에요.

---

## 🗂️ 폴더 구조

```
hastaglab/
├── backend/
│   ├── main.py          ← 서버 코드 (FastAPI)
│   ├── requirements.txt ← 필요한 파이썬 패키지 목록
│   ├── .env.example     ← API 키 설정 예시 파일
│   └── static/
│       └── index.html   ← 웹 화면 (브라우저로 보는 UI)
├── start.sh             ← 한 번에 실행하는 스크립트
└── README.md            ← 지금 읽고 있는 파일
```

---

## 🛠️ 처음 설치하기 (맥미니 기준)

### 1단계 — 이 저장소 다운로드

터미널을 열고 아래를 붙여넣으세요:

```bash
git clone https://github.com/gronyse/hastaglab.git
cd hastaglab
```

> 💡 **터미널 여는 방법**: `Cmd + Space` → "터미널" 검색 → 엔터

---

### 2단계 — 실행 권한 부여 (최초 1회만)

```bash
chmod +x start.sh
```

---

### 3단계 — 앱 실행

```bash
./start.sh
```

실행하면 자동으로:
1. 파이썬 설치 여부를 확인해요
2. OpenAI API 키를 물어봐요 (처음 한 번만)
3. 필요한 패키지를 설치해요
4. 서버를 시작하고 브라우저를 자동으로 열어줘요

---

## 🔑 OpenAI API 키 발급 방법

1. [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) 접속
2. 회원가입 또는 로그인
3. **"Create new secret key"** 버튼 클릭
4. 생성된 키(`sk-...`로 시작)를 복사
5. `start.sh` 실행 시 붙여넣기

> ⚠️ API 키는 절대 다른 사람과 공유하지 마세요!

---

## 🖥️ 앱 사용 방법

1. 브라우저에서 [http://localhost:8001](http://localhost:8001) 접속
2. 텍스트 박스에 내용 입력 (예: "카페에서 라떼 마심")
3. **"✨ 해시태그 생성하기"** 버튼 클릭
4. 추천된 해시태그를 클릭하면 복사돼요
5. **"📋 전체 복사"** 버튼으로 한 번에 복사도 가능해요

---

## ❓ 자주 묻는 문제

### Python3가 없다고 나와요
```bash
# Homebrew가 없는 경우 먼저 설치
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Python 설치
brew install python3
```

### 이미 포트 8001이 사용 중이에요
```bash
# 8001 포트를 사용하는 프로세스 찾기
lsof -i :8001

# 해당 PID 종료 (숫자는 위에서 확인한 PID로 변경)
kill -9 <PID>
```

### 앱을 종료하고 싶어요
터미널에서 `Ctrl + C` 를 누르면 서버가 종료돼요.

---

## 🔄 다음에 다시 실행할 때

```bash
cd hastaglab
./start.sh
```

이것만 하면 돼요! 패키지는 이미 설치되어 있어서 빠르게 시작돼요.

---

## 🧑‍💻 기술 스택

| 구분 | 기술 |
|------|------|
| 백엔드 | Python + FastAPI |
| AI | OpenAI GPT-4o |
| 프론트엔드 | HTML + CSS + JavaScript |
| 서버 포트 | 8001 |