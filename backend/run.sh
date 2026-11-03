#!/usr/bin/env bash
set -e

# Resolve script directory so script works regardless of where it is invoked
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if .env exists in backend/ or parent directory and source it if GEMINI_API_KEY is not already set
if [ -z "$GEMINI_API_KEY" ]; then
  if [ -f ".env" ]; then
    echo "Loading environment variables from backend/.env ..."
    export $(grep -v '^#' .env | xargs -d '\n') 2>/dev/null || true
  elif [ -f "../.env" ]; then
    echo "Loading environment variables from ../.env ..."
    export $(grep -v '^#' ../.env | xargs -d '\n') 2>/dev/null || true
  fi
fi

# Check if GEMINI_API_KEY is present
if [ -z "$GEMINI_API_KEY" ]; then
  echo "====================================================================="
  echo "ERROR: GEMINI_API_KEY environment variable is not set."
  echo "Please set it before starting the DermaCheck backend server:"
  echo ""
  echo "  export GEMINI_API_KEY=\"your_gemini_api_key_here\""
  echo ""
  echo "Or create a .env file inside 'backend/' with:"
  echo "  GEMINI_API_KEY=your_gemini_api_key_here"
  echo "====================================================================="
  exit 1
fi

# Set up Python virtual environment in backend/.venv
VENV_DIR="$SCRIPT_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
  echo "==> Creating Python virtual environment at $VENV_DIR ..."
  python3 -m venv "$VENV_DIR"
fi

# Activate virtual environment
echo "==> Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# Install/update dependencies
echo "==> Installing requirements from requirements.txt..."
pip install -r requirements.txt

# Start FastAPI server
echo "==> Starting DermaCheck backend on http://0.0.0.0:8000 ..."
exec uvicorn main:app --reload --port 8000 --host 0.0.0.0
