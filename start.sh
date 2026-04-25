#!/bin/bash
# =====================================================
#  해시태그 연구소 - 맥미니 실행 스크립트
#  터미널에 붙여넣거나 ./start.sh 로 실행하세요
# =====================================================

set -e  # 오류 발생 시 즉시 중단

echo ""
echo "🔬 해시태그 연구소를 시작합니다!"
echo "=================================="

# ── 1. Python3 설치 확인 ──────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo ""
  echo "❌ Python3가 설치되어 있지 않아요."
  echo "   아래 명령어로 Homebrew를 통해 설치할 수 있어요:"
  echo "   brew install python3"
  exit 1
fi
echo "✅ Python3 확인: $(python3 --version)"

# ── 2. backend 폴더로 이동 ────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

# ── 3. .env 파일 확인 및 생성 ─────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "──────────────────────────────────────────"
  echo "⚠️  OpenAI API 키 설정이 필요해요!"
  echo ""
  echo "   OpenAI API 키 발급 방법:"
  echo "   1. https://platform.openai.com/api-keys 접속"
  echo "   2. 로그인 후 'Create new secret key' 클릭"
  echo "   3. 생성된 키를 아래에 붙여넣기"
  echo "──────────────────────────────────────────"
  echo ""
  read -p "🔑 OpenAI API 키를 입력하세요 (sk-로 시작): " api_key
  if [ -n "$api_key" ]; then
    echo "OPENAI_API_KEY=$api_key" > .env
    echo "✅ API 키가 backend/.env 파일에 저장되었어요!"
  else
    echo "⚠️  키를 입력하지 않았어요. backend/.env 파일을 직접 수정해주세요."
  fi
fi

# ── 4. 파이썬 가상 환경 생성 ──────────────────────────
if [ ! -d "venv" ]; then
  echo ""
  echo "📦 파이썬 가상 환경을 만들고 있어요..."
  python3 -m venv venv
  echo "✅ 가상 환경 생성 완료!"
fi

# ── 5. 가상 환경 활성화 ───────────────────────────────
source venv/bin/activate
echo "✅ 가상 환경 활성화 완료!"

# ── 6. 패키지 설치 ────────────────────────────────────
echo ""
echo "📥 필요한 패키지를 설치하고 있어요..."
pip install -r requirements.txt -q
echo "✅ 패키지 설치 완료!"

# ── 7. 브라우저 자동 열기 (2초 후) ───────────────────
echo ""
echo "──────────────────────────────────────────"
echo "🚀 서버 시작!"
echo "   👉 브라우저 주소: http://localhost:8001"
echo "   ⛔ 종료하려면:    Ctrl + C"
echo "──────────────────────────────────────────"
echo ""

(sleep 2 && open "http://localhost:8001") &

# ── 8. 서버 실행 ──────────────────────────────────────
uvicorn main:app --reload --port 8001 --host 0.0.0.0
