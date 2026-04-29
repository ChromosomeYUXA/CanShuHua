import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import readline from "readline";

// 全局变量：Blender 守护进程引用
let blenderDaemon: ChildProcess | null = null;
let daemonReady = false;
let blenderStartPromise: Promise<boolean> | null = null;
const modelsDir = path.join(process.cwd(), "public", "models");
let generationQueue: Promise<unknown> = Promise.resolve();
let generatedModelCounter = 0;
const DEFAULT_AI_PARAMS = {
  slice_count: 10,
  length: 5.0,
  wave: 1.0,
  thickness: 0.5,
  twist_angle: 90,
  incline: 0.0,
  mirror_x: true,
  profile_points: [
    { x: 0.0, y: 0.7 },
    { x: 1 / 3, y: 1.2 },
    { x: 2 / 3, y: 1.2 },
    { x: 1.0, y: 0.7 },
  ],
};
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const PARAM_EXTRACTOR_PROMPT = `
You are a parametric 3D sculpture design interpreter. Convert the user's natural language design intent into all current sculpture controls.

Return ONLY a valid JSON object with these keys:
1. slice_count: integer, 1-100. More slices feel denser, smoother, more detailed, layered, or architectural.
2. length: float, 0.1-20.0. Longer feels grand, stretched, monumental, elegant, or flowing.
3. wave: float, 0.0-10.0. Higher feels wavy, fluid, ocean-like, dramatic, playful, or energetic.
4. thickness: float, 0.0-2.0. Lower feels thin, delicate, airy, sharp, or fragile. Higher feels heavy, strong, solid, or muscular.
5. twist_angle: integer, 0-360. Higher feels twisted, spiral, vortex-like, tense, complex, or futuristic.
6. incline: float, -20.0-20.0. Negative leans left, positive leans right.
7. mirror_x: boolean. true creates symmetry; false creates asymmetry, directional motion, or irregularity.
8. profile_points: exactly 4 objects. x must be 0.0, 0.3333, 0.6667, 1.0. y must be 0.2-2.0 and controls profile scale along the sculpture.

Defaults for a neutral sculpture:
{"slice_count":10,"length":5.0,"wave":1.0,"thickness":0.5,"twist_angle":90,"incline":0.0,"mirror_x":true,"profile_points":[{"x":0.0,"y":0.7},{"x":0.3333,"y":1.2},{"x":0.6667,"y":1.2},{"x":1.0,"y":0.7}]}

You will receive current_params from the app. Use current_params as the baseline.
For relative requests such as "more", "less", "slightly", "a bit", "stronger", or "softer", adjust from current_params instead of inventing an unrelated absolute value.
For vague design language, infer reasonable values from style words, mood, and metaphors.
If the user only asks to change one aspect, preserve the unrelated current controls.
Always return every key, including mirror_x and profile_points.

Profile guidance:
- low ends and high middle: pinched ribbon, lens, leaf, petal, or vessel
- high middle: swollen, full, belly-like, organic
- flatter y values: minimal, quiet, architectural
- uneven y values: asymmetrical, storm-like, unstable, directional

Examples:
User: "make it feel like a calm ribbon floating in the air"
Output: {"slice_count":24,"length":8.0,"wave":1.8,"thickness":0.18,"twist_angle":120,"incline":0.0,"mirror_x":true,"profile_points":[{"x":0.0,"y":0.45},{"x":0.3333,"y":1.15},{"x":0.6667,"y":1.1},{"x":1.0,"y":0.45}]}

User: "make it more aggressive and asymmetric"
Output: {"slice_count":56,"length":6.5,"wave":5.8,"thickness":0.75,"twist_angle":260,"incline":8.0,"mirror_x":false,"profile_points":[{"x":0.0,"y":0.55},{"x":0.3333,"y":1.55},{"x":0.6667,"y":0.95},{"x":1.0,"y":1.35}]}
`;

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizeProfilePoints(points: any, fallbackPoints = DEFAULT_AI_PARAMS.profile_points) {
  const fixedX = [0.0, 1 / 3, 2 / 3, 1.0];
  const sourcePoints = Array.isArray(points) && points.length > 0 ? points : fallbackPoints;

  return fixedX.map((x, index) => ({
    x,
    y: clampNumber(sourcePoints[index]?.y, fallbackPoints[index].y, 0.2, 2.0),
  }));
}

function normalizeAiParams(params: any) {
  return {
    slice_count: Math.round(clampNumber(params?.slice_count, DEFAULT_AI_PARAMS.slice_count, 1, 100)),
    length: clampNumber(params?.length, DEFAULT_AI_PARAMS.length, 0.1, 20),
    wave: clampNumber(params?.wave, DEFAULT_AI_PARAMS.wave, 0, 10),
    thickness: clampNumber(params?.thickness, DEFAULT_AI_PARAMS.thickness, 0, 2),
    twist_angle: Math.round(clampNumber(params?.twist_angle, DEFAULT_AI_PARAMS.twist_angle, 0, 360)),
    incline: clampNumber(params?.incline, DEFAULT_AI_PARAMS.incline, -20, 20),
    mirror_x: normalizeBoolean(params?.mirror_x, DEFAULT_AI_PARAMS.mirror_x),
    profile_points: normalizeProfilePoints(params?.profile_points),
  };
}

function parseJsonObject(text: string) {
  const cleanText = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch {
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("DeepSeek response did not contain JSON.");
    return JSON.parse(match[0]);
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.floor(numberValue);
}

function aiRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const windowMs = parsePositiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 60_000);
  const maxRequests = parsePositiveInt(process.env.AI_RATE_LIMIT_MAX, 10);
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (bucket.count >= maxRequests) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      error: "Too many AI requests. Please try again later.",
      retryAfter: retryAfterSeconds,
    });
  }

  bucket.count += 1;
  return next();
}

async function parseParamsWithDeepSeek(text: string, currentParams?: any) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === "MY_DEEPSEEK_API_KEY") {
    console.warn("DEEPSEEK_API_KEY is missing or invalid, using default params.");
    return normalizeAiParams(currentParams ?? DEFAULT_AI_PARAMS);
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const baselineParams = normalizeAiParams(currentParams ?? DEFAULT_AI_PARAMS);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: PARAM_EXTRACTOR_PROMPT },
        { role: "user", content: JSON.stringify({ current_params: baselineParams, request: text }) },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek request failed: ${response.status} ${errorText}`);
  }

  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("DeepSeek response was missing message content.");
  }

  return normalizeAiParams(parseJsonObject(content));
}

// ==========================================
// 启动 Blender 守护进程
// ==========================================
async function startBlenderDaemon(blenderPath: string, blendFilePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log("[DAEMON] 正在启动 Blender 守护进程...");
    
    const daemonScriptPath = path.join(process.cwd(), "blender_daemon.py");
    
    blenderDaemon = spawn(blenderPath, [
      "--factory-startup",
      blendFilePath,
      "--background",
      "--python", daemonScriptPath
    ], {
      stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr 都使用管道
    });

    if (!blenderDaemon) {
      console.error("[ERROR] 无法创建 Blender 进程");
      resolve(false);
      return;
    }

    // 监听进程退出事件
    blenderDaemon.on("exit", (code, signal) => {
      console.log(`[ERROR] Blender 守护进程已退出 (code: ${code}, signal: ${signal})`);
      daemonReady = false;
      blenderDaemon = null;
    });

    blenderDaemon.on("close", (code) => {
      console.log(`[ERROR] Blender 守护进程已关闭 (code: ${code})`);
      daemonReady = false;
      blenderDaemon = null;
    });

    // 监听标准错误
    if (blenderDaemon.stderr) {
      blenderDaemon.stderr.on("data", (data) => {
        console.error(`[Blender Stderr] ${data}`);
      });
    }

    // 监听标准输出，检测 [READY] 信号
    const rl = readline.createInterface({
      input: blenderDaemon.stdout!,
      crlfDelay: Infinity
    });

    rl.on("line", (line) => {
      console.log(`[Blender] ${line}`);
      
      if (line.includes("[READY]")) {
        console.log("[DAEMON] Blender 守护进程已就绪！");
        daemonReady = true;
        rl.close();
        resolve(true);
      }
    });

    // 超时保护：30秒未收到 READY 信号则视为失败
    setTimeout(() => {
      if (!daemonReady) {
        console.error("[ERROR] Blender 守护进程启动超时");
        rl.close();
        resolve(false);
      }
    }, 30000);
  });
}

async function ensureBlenderReady(blenderPath: string, blendFilePath: string) {
  if (blenderDaemon && daemonReady) return true;
  if (blenderStartPromise) return blenderStartPromise;

  blenderStartPromise = startBlenderDaemon(blenderPath, blendFilePath).finally(() => {
    blenderStartPromise = null;
  });

  return blenderStartPromise;
}

// ==========================================
// 向守护进程发送参数请求
// ==========================================
async function sendToBlenderDaemon(params: any, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!blenderDaemon || !daemonReady || !blenderDaemon.stdin) {
      console.error("[ERROR] Blender 守护进程不可用");
      resolve(false);
      return;
    }

    const request = JSON.stringify({
      count: params.slice_count,
      length: params.length,
      wave: params.wave,
      thickness: params.thickness,
      twist: params.twist_angle,
      incline: params.incline,
      mirror_x: params.mirror_x,
      profile_scales: params.profile_scales,
      output: outputPath
    });

    console.log(`[REQUEST] 发送参数到守护进程: ${request}`);

    // 监听一次stdout，获取响应
    const rl = readline.createInterface({
      input: blenderDaemon.stdout!,
      crlfDelay: Infinity
    });

    let responseReceived = false;
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        console.error("[ERROR] 等待响应超时");
        rl.close();
        resolve(false);
      }
    }, 60000);

    rl.on("line", (line) => {
      console.log(`[Blender] ${line}`);
      
      if (line.includes("[SUCCESS]")) {
        responseReceived = true;
        clearTimeout(timeout);
        rl.close();

        // 避免固定等待：优先立即返回，仅在文件尚未落盘时做短轮询
        if (fs.existsSync(outputPath)) {
          resolve(true);
          return;
        }

        let attempts = 0;
        const maxAttempts = 10;
        const poll = setInterval(() => {
          attempts += 1;
          if (fs.existsSync(outputPath)) {
            clearInterval(poll);
            resolve(true);
          } else if (attempts >= maxAttempts) {
            clearInterval(poll);
            resolve(false);
          }
        }, 20);
      } else if (line.includes("[ERROR]")) {
        responseReceived = true;
        clearTimeout(timeout);
        rl.close();
        resolve(false);
      }
    });

    // 发送请求
    blenderDaemon.stdin!.write(request + "\n");
  });
}

function enqueueGeneration<T>(task: () => Promise<T>) {
  const run = generationQueue.then(task, task);
  generationQueue = run.catch(() => undefined);
  return run;
}

function getNextModelOutputPath() {
  generatedModelCounter += 1;
  const filename = `output-${Date.now()}-${generatedModelCounter}.glb`;
  return {
    filename,
    outputPath: path.join(modelsDir, filename),
    modelUrl: `./models/${filename}`,
  };
}

async function startServer() {
  dotenv.config();
  const app = express();
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.set("trust proxy", parsePositiveInt(process.env.TRUST_PROXY_HOPS, 1));

  app.use(express.json());

  // CORS 设置：允许来自前端静态站点的请求
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || ""; // 逗号分隔
  const allowedOrigins = allowedOriginsEnv.split(",").map(s => s.trim()).filter(Boolean);

  app.use(cors({
    origin: function(origin, callback) {
      // allow requests with no origin (like curl or same-origin)
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    }
  }));

  // 确保模型目录存在
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  // 静态文件服务：确保 public 目录下的文件可以被访问
  app.use(express.static(path.join(process.cwd(), "public")));

  // 配置信息（优先使用环境变量）
  const blenderPath = process.env.BLENDER_PATH || "blender";
  const blendFilePath = process.env.BLEND_FILE || path.join(process.cwd(), "param.blend");

  app.post("/api/parse-params", aiRateLimit, async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      return res.status(400).json({ success: false, error: "Missing text." });
    }

    try {
      const params = await parseParamsWithDeepSeek(text, req.body?.currentParams);
      res.json({ success: true, params });
    } catch (error) {
      console.error("DeepSeek Parsing Error:", error);
      res.json({ success: false, error: "AI parameter parsing failed.", params: normalizeAiParams(req.body?.currentParams ?? DEFAULT_AI_PARAMS) });
    }
  });

  // API 路由：生成模型
  app.post("/api/generate", async (req, res) => {
    // [SERVER: API_RECEIVE] 如果增加了新参数，请在这里解构它
    const { slice_count, length, wave, thickness, twist_angle, incline, mirror_x } = req.body;
    const count = Number(slice_count) || 1;
    const profile_scales = Array.isArray(req.body.profile_scales)
      ? req.body.profile_scales.slice(0, count).map((value: unknown) => {
          const scale = Number(value);
          return Number.isFinite(scale) ? scale : 1;
        })
      : [];

    while (profile_scales.length < count) {
      profile_scales.push(1);
    }
    
    const startTime = Date.now();
    console.log("[API] 收到生成请求，参数:", req.body);

    const { outputPath, modelUrl } = getNextModelOutputPath();

    try {
      // 如果守护进程不可用，尝试启动
      if (!blenderDaemon || !daemonReady) {
        console.log("[DAEMON] 守护进程不可用，尝试启动...");
        const started = await ensureBlenderReady(blenderPath, blendFilePath);
        if (!started) {
          return res.json({ 
            success: false, 
            error: "无法启动 Blender 守护进程，请检查配置" 
          });
        }
      }

      // 向守护进程发送请求
      const sendTime = Date.now();
      const success = await enqueueGeneration(() =>
        sendToBlenderDaemon({ slice_count, length, wave, thickness, twist_angle, incline, mirror_x, profile_scales }, outputPath),
      );
      const totalTime = Date.now() - startTime;
      const blenderTime = Date.now() - sendTime;
      
      if (success && fs.existsSync(outputPath)) {
        console.log(`[PERF] 生成完成 - 总耗时: ${totalTime}ms, Blender处理: ${blenderTime}ms`);
        res.json({ success: true, modelUrl, duration: totalTime });
      } else {
        console.log(`[PERF] 生成失败 - 耗时: ${totalTime}ms`);
        res.json({ success: false, error: "模型生成失败" });
      }
    } catch (error) {
      console.error("API 错误:", error);
      const totalTime = Date.now() - startTime;
      console.log(`[PERF] API异常 - 耗时: ${totalTime}ms`);
      res.json({ success: false, error: "服务器内部错误" });
    }
  });

  // 调试路由：查看守护进程状态
  app.get("/api/daemon-status", (req, res) => {
    res.json({
      daemonReady: daemonReady,
      daemonExists: blenderDaemon !== null,
      daemonPid: blenderDaemon?.pid || null,
      message: daemonReady ? "Blender 守护进程正在运行" : "Blender 守护进程未就绪"
    });
  });

  // Vite 适配
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // 服务器启动时初始化 Blender 守护进程
    console.log("\n[INIT] 初始化 Blender 守护进程...");
    const started = await ensureBlenderReady(blenderPath, blendFilePath);
    if (!started) {
      console.error("[WARN] 初始化失败，但服务器仍在运行。首次请求时会自动重试。");
    }
  });
}

startServer();
