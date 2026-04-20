#!/usr/bin/env tsx
/**
 * Blender 进程检查脚本
 * 用于验证 Blender 守护进程是否真的在后台运行
 * 运行: npx tsx check_blender_process.ts
 */

import { execSync } from "child_process";
import os from "os";

console.log("🔍 检查 Blender 进程状态...\n");

const platform = os.platform();

if (platform === "win32") {
  // Windows 系统：使用 tasklist 命令
  try {
    const output = execSync("tasklist", { encoding: "utf-8" });
    const blenderRunning = output.includes("blender.exe");
    
    console.log("📋 Windows 进程列表检查:");
    console.log(blenderRunning ? "✅ Blender.exe 进程正在运行！" : "❌ Blender.exe 进程未运行");
    
    if (blenderRunning) {
      // 获取详细的 Blender 进程信息
      const tasklistDetail = execSync('tasklist /v | find /i "blender"', { encoding: "utf-8" });
      console.log("\n📊 详细信息:");
      console.log(tasklistDetail);
    }
  } catch (error) {
    console.error("❌ 检查失败:", error);
  }
} else if (platform === "darwin") {
  // macOS 系统
  try {
    const output = execSync("ps aux | grep blender", { encoding: "utf-8" });
    console.log("📋 macOS 进程检查:");
    console.log(output);
  } catch (error) {
    console.error("❌ 检查失败:", error);
  }
} else {
  // Linux 系统
  try {
    const output = execSync("ps aux | grep blender", { encoding: "utf-8" });
    console.log("📋 Linux 进程检查:");
    console.log(output);
  } catch (error) {
    console.error("❌ 检查失败:", error);
  }
}

console.log("\n📝 说明:");
console.log("1. 如果看到 blender.exe，说明守护进程确实在运行");
console.log("2. 守护进程应该在 npm run dev 启动时自动启动");
console.log("3. 如果没有 blender.exe，可能说明守护进程未正确启动");
console.log("\n💡 性能测试建议:");
console.log("1. 在浏览器中快速调整参数滑块");
console.log("2. 打开浏览器 DevTools (F12) → Network 标签");
console.log("3. 查看 /api/generate 请求的耗时");
console.log("4. 第一次请求应该较慢（~2-3秒），之后应该快速（~0.5-1秒）");
