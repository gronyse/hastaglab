#!/bin/bash
set -e

echo ""
echo "🔬 해시태그 연구소를 시작합니다!"
echo "=================================="

if ! command -v python3 &>/dev/null; then
  echo "❌ Python3가 설치되어 있지 않아요. brew install python3 로 설치해주세요."
  exit 1
fi
echo "✅ Python3 확인: $(python3 --version)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "────────────────────────────────────────"
  echo "⚠️  API 키 설정이 필요해요!"
  echo ""
  echo "   Gemini API 키 발급: https://aistudio.google.com/app/apikey"
  echo "   DeepSeek API 키 발급: https://platform.deepseek.com/api-keys"
  echo "────────────────────────────────────────"
  echo ""
  read -p "🔑 Gemini API 키를 입력하세요 (없으면 Enter): " gemini_key
  read -p "🔑 DeepSeek API 키를 입력하세요 (없으면 Enter): " deepseek_key
  {
    [ -n "$gemini_key" ]   && echo "GEMINI_API_KEY=$gemini_key"
    [ -n "$deepseek_key" ] && echo "DEEPSEEK_API_KEY=$deepseek_key"
  } > .env
  echo "✅ API 키가 backend/.env 파일에 저장되었어요!"
fi

if [ ! -d "venv" ]; then
  echo ""
  echo "📦 파이썬 가상 환경을 만들고 있어요..."
  python3 -m venv venv
fi

source venv/bin/activate

echo "📥 패키지 설치 중..."
pip install -r requirements.txt -q
echo "✅ 패키지 설치 완료!"

echo ""
echo "────────────────────────────────────────"
echo "🚀 서버 시작!"
echo "   👉 http://localhost:8001"
echo "   ⛔ 종료: Ctrl + C"
echo "────────────────────────────────────────"
echo ""

(sleep 2 && open "http://localhost:8001") &

uvicorn main:app --reload --port 8001 --host 0.0.0.0
