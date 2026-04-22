#!/usr/bin/env bash
# Helper to run backend on Linux (ECS) for quick testing
# Place this file in the project root's scripts/ and make executable: chmod +x scripts/run-ecs.sh

# Load .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Ensure BLENDER_PATH and BLEND_FILE are set
export BLENDER_PATH=${BLENDER_PATH:-/usr/local/bin/blender}
export BLEND_FILE=${BLEND_FILE:-$(pwd)/param.blend}
export ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-*}
export PORT=${PORT:-3000}

echo "Using BLENDER_PATH=$BLENDER_PATH"
echo "Using BLEND_FILE=$BLEND_FILE"

# Run
npx tsx server.ts
