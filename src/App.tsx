import { useState, useEffect, useCallback, useRef } from "react";
import ThreeScene from "./components/ThreeScene.tsx";
import Sidebar from "./components/Sidebar";
import { ProfilePoint, SculptureParams } from "./types";
import { Box, Info } from "lucide-react";

const DEFAULT_PROFILE_POINTS: ProfilePoint[] = [
  { x: 0.0, y: 0.7 },
  { x: 1 / 3, y: 1.2 },
  { x: 2 / 3, y: 1.2 },
  { x: 1.0, y: 0.7 },
];

const DEFAULT_PARAMS: SculptureParams = {
  slice_count: 20,
  length: 8.0,
  wave: 1.0,
  thickness: 0.3,
  twist_angle: 180,
  incline: 0,
  mirror_x: true,
  profile_points: DEFAULT_PROFILE_POINTS,
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function backendUrl(path: string) {
  if (!API_BASE_URL) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function sampleProfileCurve(points: ProfilePoint[], t: number) {
  const sortedPoints = [...points].sort((a, b) => a.x - b.x);

  if (sortedPoints.length === 0) return 1;
  if (t <= sortedPoints[0].x) return sortedPoints[0].y;
  if (t >= sortedPoints[sortedPoints.length - 1].x) return sortedPoints[sortedPoints.length - 1].y;

  for (let i = 0; i < sortedPoints.length - 1; i += 1) {
    const left = sortedPoints[i];
    const right = sortedPoints[i + 1];

    if (t >= left.x && t <= right.x) {
      const span = Math.max(0.0001, right.x - left.x);
      const localT = (t - left.x) / span;
      return left.y + (right.y - left.y) * localT;
    }
  }

  return sortedPoints[sortedPoints.length - 1].y;
}

function sampleProfileScales(points: ProfilePoint[], sliceCount: number) {
  return Array.from({ length: Math.max(1, sliceCount) }, (_, i) => {
    const t = sliceCount === 1 ? 0 : i / (sliceCount - 1);
    return Number(sampleProfileCurve(points, t).toFixed(4));
  });
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
      const profile_scales = sampleProfileScales(currentParams.profile_points, currentParams.slice_count);
      const requestStart = performance.now();
      requestStartRef.current = requestStart;
      console.log("[DEBUG] 开始生成请求...");
      const response = await fetch(backendUrl("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentParams, profile_scales }),
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

  // 参数变化时自动生成（300ms 防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      handleGenerate();
    }, 300);
    
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
          <div className="absolute bottom-6 bg-[#ffd400]/10 border border-[#ffd400]/20 text-[#ffd400] px-4 py-2 rounded-lg text-xs backdrop-blur-md" style={{ right: "calc(var(--sidebar-width, 384px) + 24px)" }}>
            ⚡ 生成耗时: {duration !== null ? `${duration}ms` : '—'}
          </div>
        )}

        {frontendDuration !== null && (
          <div className="absolute bottom-16 bg-[#ffd400]/10 border border-[#ffd400]/20 text-[#ffd400] px-4 py-2 rounded-lg text-xs backdrop-blur-md" style={{ right: "calc(var(--sidebar-width, 384px) + 24px)" }}>
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
