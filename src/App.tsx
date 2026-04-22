import { useState, useEffect, useCallback, useRef } from "react";
import ThreeScene from "./components/ThreeScene.tsx";
import Sidebar from "./components/Sidebar";
import { SculptureParams } from "./types";
import { Box, Info } from "lucide-react";

const DEFAULT_PARAMS: SculptureParams = {
  slice_count: 20,
  length: 8.0,
  thickness: 0.3,
  twist_angle: 180
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function backendUrl(path: string) {
  if (!API_BASE_URL) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export default function App() {
  const [params, setParams] = useState<SculptureParams>(DEFAULT_PARAMS);

  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [frontendDuration, setFrontendDuration] = useState<number | null>(null);
  const paramsRef = useRef(params);
  const requestStartRef = useRef<number | null>(null);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  // Load default model on mount
  useEffect(() => {
    setModelUrl('./models/sculpture.glb');
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setFrontendDuration(null);
    try {
      const currentParams = paramsRef.current;
      const requestStart = performance.now();
      requestStartRef.current = requestStart;
      console.log("[DEBUG] 开始生成请求...");
      const response = await fetch(backendUrl("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentParams),
      });
      
      const data = await response.json();
      console.log("[DEBUG] API 响应数据:", data);
      if (data.success) {
        if (data.isFallback) {
          console.warn("Using frontend fallback visualization.");
          setModelUrl(null); // 这将触发 ThreeScene 中的 fallback 渲染
        } else {
          setModelUrl(backendUrl(data.modelUrl));
          const serverDuration = Number(data.duration);
          const localDuration = Math.round(performance.now() - requestStart);
          const finalDuration = Number.isFinite(serverDuration) && serverDuration > 0
            ? Math.round(serverDuration)
            : localDuration;

          console.log("[DEBUG] 后端 duration:", data.duration, "本地 duration:", localDuration, "最终显示:", finalDuration);
          setDuration(finalDuration);
          console.log(`✅ 生成完成，耗时: ${finalDuration}ms`);
        }
      } else {
        setError("生成失败，请检查后端连接。");
      }
    } catch (err) {
      console.error(err);
      setError("网络错误，无法连接到生成服务器。");
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handleResetSculpture = useCallback(() => {
    setError(null);
    setDuration(null);
    setFrontendDuration(null);
    setParams(DEFAULT_PARAMS);
  }, []);

  const handleModelRendered = useCallback(() => {
    const start = requestStartRef.current;
    if (start === null) {
      return;
    }

    const renderDuration = Math.round(performance.now() - start);
    setFrontendDuration(renderDuration);
    console.log(`[PERF] 前端模型渲染完成 - 总耗时: ${renderDuration}ms`);
  }, []);

  // 参数变化时自动生成（80ms 防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      handleGenerate();
    }, 80);
    
    return () => clearTimeout(timer);
  }, [params, handleGenerate]);

  // 持久显示 duration，直到用户重置或发起新的生成请求（不再自动清除）

  return (
    <div className="flex h-screen w-full overflow-hidden cipher-root">
      {/* 主展示区 */}
      <div className="flex-1 relative">
        <ThreeScene params={params} modelUrl={modelUrl} onModelRendered={handleModelRendered} />
        
        {/* 顶部标题栏 */}
        <div className="absolute top-6 left-6 flex items-center gap-3 pointer-events-none">
          <div className="bg-[#ffd400] p-2.5 rounded-xl shadow-lg shadow-[#ffd400]/30">
            <Box className="text-black" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">AI Sculpture Gen</h1>
            <p className="text-xs text-slate-400 font-medium">参数化 3D 雕塑生成系统</p>
          </div>
        </div>

        {/* 状态提示 */}
        {error && (
          <div className="absolute bottom-6 left-6 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2 backdrop-blur-md">
            <Info size={16} />
            {error}
          </div>
        )}

        {/* 性能显示 */}
        {frontendDuration !== null && (
          <div className="absolute bottom-6 right-6 bg-[#ffd400]/10 border border-[#ffd400]/20 text-[#ffd400] px-4 py-2 rounded-lg text-xs backdrop-blur-md">
            ⚡ 生成耗时: {duration !== null ? `${duration}ms` : '—'}
          </div>
        )}

        {frontendDuration !== null && (
          <div className="absolute bottom-16 right-6 bg-[#ffd400]/10 border border-[#ffd400]/20 text-[#ffd400] px-4 py-2 rounded-lg text-xs backdrop-blur-md">
            🎨 前端渲染耗时: {frontendDuration}ms
          </div>
        )}
      </div>

      {/* 侧边栏 */}
      <Sidebar 
        params={params} 
        setParams={setParams} 
        isGenerating={isGenerating} 
        onResetSculpture={handleResetSculpture}
      />
    </div>
  );
}
