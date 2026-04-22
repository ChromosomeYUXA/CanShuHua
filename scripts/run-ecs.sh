#!/usr/bin/env bash
# Helper to run backend on Linux (ECS) for quick testing.
# Place this file in the project root's scripts/ and make executable: chmod +x scripts/run-ecs.sh

set -e

# Load .env if present. Values from the shell still win when already exported.
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

is_windows_path() {
  case "$1" in
    [A-Za-z]:*|*.exe|*\\*) return 0 ;;
    *) return 1 ;;
  esac
}

find_blender() {
  for candidate in \
    /root/blender-*/blender \
    /opt/blender-*/blender \
    /usr/local/bin/blender \
    /usr/bin/blender \
    "$(command -v blender 2>/dev/null || true)"
  do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if [ -n "${BLENDER_PATH:-}" ] && is_windows_path "$BLENDER_PATH"; then
  echo "Ignoring Windows BLENDER_PATH on Linux: $BLENDER_PATH"
  unset BLENDER_PATH
fi

if [ -z "${BLENDER_PATH:-}" ]; then
  BLENDER_PATH="$(find_blender || true)"
fi

if [ -z "${BLENDER_PATH:-}" ]; then
  echo "Blender executable not found. Extract Blender under /root or set BLENDER_PATH=/absolute/path/to/blender."
  exit 1
fi

if [ -n "${BLEND_FILE:-}" ] && is_windows_path "$BLEND_FILE"; then
  echo "Ignoring Windows BLEND_FILE on Linux: $BLEND_FILE"
  unset BLEND_FILE
fi

export BLENDER_PATH
export BLEND_FILE="${BLEND_FILE:-$(pwd)/param.blend}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-*}"
export PORT="${PORT:-3000}"

echo "Using BLENDER_PATH=$BLENDER_PATH"
echo "Using BLEND_FILE=$BLEND_FILE"

npx tsx server.ts
