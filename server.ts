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
const modelsDir = path.join(process.cwd(), "public", "models");

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

async function startServer() {
  dotenv.config();
  const app = express();
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

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

    const outputPath = path.join(modelsDir, "output.glb");

    try {
      // 如果守护进程不可用，尝试启动
      if (!blenderDaemon || !daemonReady) {
        console.log("[DAEMON] 守护进程不可用，尝试启动...");
        const started = await startBlenderDaemon(blenderPath, blendFilePath);
        if (!started) {
          return res.json({ 
            success: false, 
            error: "无法启动 Blender 守护进程，请检查配置" 
          });
        }
      }

      // 向守护进程发送请求
      const sendTime = Date.now();
      const success = await sendToBlenderDaemon({ slice_count, length, wave, thickness, twist_angle, incline, mirror_x, profile_scales }, outputPath);
      const totalTime = Date.now() - startTime;
      const blenderTime = Date.now() - sendTime;
      
      if (success && fs.existsSync(outputPath)) {
        console.log(`[PERF] 生成完成 - 总耗时: ${totalTime}ms, Blender处理: ${blenderTime}ms`);
        res.json({ success: true, modelUrl: `./models/output.glb?t=${Date.now()}`, duration: totalTime });
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
    const started = await startBlenderDaemon(blenderPath, blendFilePath);
    if (!started) {
      console.error("[WARN] 初始化失败，但服务器仍在运行。首次请求时会自动重试。");
    }
  });
}

startServer();
