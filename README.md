<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1c14076d-300f-4e90-b85a-95245dcde920

## Run Locally

**Prerequisites:** Node.js, Blender (local) if running the backend with Blender on your machine.

1. Install dependencies:
   `npm install`

2. Create a `.env` file from `.env.example` and set your values (especially `BLENDER_PATH` and `BLEND_FILE`).

Run on Windows (PowerShell helper):

```powershell
# edit scripts/run-local.ps1 to point BLENDER_PATH at your local Blender
powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1
```

Run on Linux (quick test / ECS):

```bash
cp .env.example .env
# edit .env to set BLENDER_PATH and BLEND_FILE
./scripts/run-ecs.sh
```
