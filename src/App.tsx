import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Cpu, Info, Layers3, MonitorUp, X } from "lucide-react";
import ThreeScene from "./components/ThreeScene.tsx";
import Sidebar from "./components/Sidebar";
import { ProfilePoint, SculptureParams } from "./types";

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
  if (!API_BASE_URL) return path;
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
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState("以参数化切片构成的白色动态雕塑，强调连续曲线、结构节奏和空间张力。");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const paramsRef = useRef(params);
  const requestStartRef = useRef<number | null>(null);
  const generationIdRef = useRef(0);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    setModelUrl("./models/sculpture.glb");
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setIsPresentationMode(false);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTextInput) return;

      if (event.key.toLowerCase() === "p" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        void togglePresentationMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const enterPresentationMode = useCallback(async () => {
    setIsPresentationMode(true);
    const element = rootRef.current;
    if (element && !document.fullscreenElement && element.requestFullscreen) {
      try {
        await element.requestFullscreen();
      } catch {
        // Browser fullscreen may be blocked, but the in-app presentation layout still works.
      }
    }
  }, []);

  const exitPresentationMode = useCallback(async () => {
    setIsPresentationMode(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore fullscreen API failures; the React state has already restored the UI.
      }
    }
  }, []);

  const togglePresentationMode = useCallback(() => {
    return isPresentationMode ? exitPresentationMode() : enterPresentationMode();
  }, [enterPresentationMode, exitPresentationMode, isPresentationMode]);

  const handleGenerate = useCallback(async () => {
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    setIsGenerating(true);
    setError(null);
    setFrontendDuration(null);

    try {
      const currentParams = paramsRef.current;
      const profile_scales = sampleProfileScales(currentParams.profile_points, currentParams.slice_count);
      const requestStart = performance.now();
      requestStartRef.current = requestStart;

      const response = await fetch(backendUrl("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentParams, profile_scales }),
      });

      const data = await response.json();
      if (generationId !== generationIdRef.current) return;
      if (data.success) {
        if (data.isFallback) {
          setModelUrl(null);
        } else {
          setModelUrl(backendUrl(data.modelUrl));
          const serverDuration = Number(data.duration);
          const localDuration = Math.round(performance.now() - requestStart);
          setDuration(Number.isFinite(serverDuration) && serverDuration > 0 ? Math.round(serverDuration) : localDuration);
        }
      } else {
        setError("生成失败，请检查后端连接。");
      }
    } catch (err) {
      if (generationId !== generationIdRef.current) return;
      console.error(err);
      setError("网络错误，无法连接到生成服务。");
    } finally {
      if (generationId === generationIdRef.current) {
        setIsGenerating(false);
      }
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
    if (start === null) return;
    setFrontendDuration(Math.round(performance.now() - start));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleGenerate();
    }, 300);

    return () => clearTimeout(timer);
  }, [params, handleGenerate]);

  return (
    <div ref={rootRef} className="lab-root relative h-screen w-full overflow-hidden bg-slate-950 text-white">
      <ThreeScene
        params={params}
        modelUrl={modelUrl}
        onModelRendered={handleModelRendered}
        presentationMode={isPresentationMode}
      />

      {!isPresentationMode && (
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="glass-panel fixed left-6 top-6 z-20 flex items-center gap-4 rounded-3xl px-4 py-3"
        >
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/30">
            <Layers3 size={27} strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-lg font-black uppercase leading-none text-white">VITALIS GEN</h1>
              <span className="font-mono text-[10px] font-bold text-blue-400">v.1.2</span>
            </div>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.34em] text-slate-400">Parametric sculpture engine</p>
          </div>
        </motion.header>
      )}

      {!isPresentationMode && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
          onClick={() => void enterPresentationMode()}
          className="glass-panel fixed right-6 top-6 z-30 grid h-12 w-12 place-items-center rounded-2xl text-blue-100 transition hover:border-blue-300/50 hover:bg-blue-500/20 active:scale-95"
          aria-label="进入展览模式"
          title="进入展览模式"
        >
          <MonitorUp size={19} />
        </motion.button>
      )}

      {error && !isPresentationMode && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel fixed bottom-6 left-6 z-30 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-red-200"
        >
          <Info size={16} className="text-red-300" />
          {error}
        </motion.div>
      )}

      {!isPresentationMode && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16, ease: "easeOut" }}
          className="fixed bottom-6 right-6 z-20 hidden items-end gap-6 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-300 md:flex"
        >
          <div className="text-right">
            <div className="mb-1 text-slate-500">Viewport Status</div>
            <div className="flex items-center gap-2 text-white">
              <Cpu size={14} className="text-blue-400" />
              GPU Accelerated: Stable
            </div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="text-right">
            <div className="mb-1 text-slate-500">Target Render</div>
            <div className="text-white">{params.slice_count} Slices @ 60FPS</div>
          </div>
          {(duration !== null || frontendDuration !== null) && (
            <>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-right">
                <div className="mb-1 text-slate-500">Pipeline</div>
                <div className="text-blue-200">{duration ?? "-"}ms / {frontendDuration ?? "-"}ms</div>
              </div>
            </>
          )}
        </motion.div>
      )}

      {isPresentationMode && (
        <PresentationOverlay
          params={params}
          generationPrompt={generationPrompt}
          onExit={() => void exitPresentationMode()}
        />
      )}

      <div className={`pointer-events-none fixed inset-0 z-10 ${isPresentationMode ? "presentation-vignette" : "bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.16)_42%,rgba(2,6,23,0.86)_100%)]"}`} />
      {!isPresentationMode && <div className="pointer-events-none fixed inset-0 z-10 border border-white/[0.03]" />}

      {!isPresentationMode && (
        <Sidebar
          params={params}
          setParams={setParams}
          isGenerating={isGenerating}
          onResetSculpture={handleResetSculpture}
          onPromptSubmitted={setGenerationPrompt}
        />
      )}
    </div>
  );
}

function PresentationOverlay({
  params,
  generationPrompt,
  onExit,
}: {
  params: SculptureParams;
  generationPrompt: string;
  onExit: () => void;
}) {
  const profileSummary = params.profile_points.map((point) => point.y.toFixed(2)).join(" / ");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between px-7 py-7 sm:px-12 sm:py-10 lg:px-16 lg:py-12"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-[760px] border-l border-blue-200/30 pl-5 sm:pl-7">
          <div className="flex items-center gap-4 font-mono text-[10px] font-black uppercase tracking-[0.38em] text-blue-200/80">
            <span>Fullscreen Presentation</span>
            <span className="h-px w-16 bg-blue-300/35" />
            <span className="hidden text-slate-400/80 sm:inline">Parametric Study</span>
          </div>
          <h1 className="mt-5 text-4xl font-black uppercase leading-[0.9] text-white sm:text-6xl lg:text-7xl">
            VITALIS GEN
          </h1>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-slate-200/86 sm:text-lg">
            {generationPrompt}
          </p>
        </div>

        <button
          type="button"
          onClick={onExit}
          className="pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-slate-950/25 text-white/55 opacity-35 backdrop-blur-xl transition hover:border-white/25 hover:bg-white/10 hover:text-white hover:opacity-100 active:scale-95"
          aria-label="退出展览模式"
          title="退出展览模式"
        >
          <X size={18} />
        </button>
      </div>

      <div className="presentation-dock grid gap-6 px-5 py-5 sm:px-7 lg:grid-cols-[1fr_280px] lg:items-end">
        <div>
          <div className="mb-4 flex items-center gap-4">
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.32em] text-slate-400">
              Geometry Parameters
            </div>
            <div className="h-px flex-1 bg-white/[0.10]" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-7">
            <PresentationMetric label="Slices" value={params.slice_count} />
            <PresentationMetric label="Length" value={params.length.toFixed(1)} suffix="m" />
            <PresentationMetric label="Wave" value={params.wave.toFixed(2)} />
            <PresentationMetric label="Thickness" value={params.thickness.toFixed(2)} suffix="cm" />
            <PresentationMetric label="Twist" value={Math.round(params.twist_angle)} suffix="deg" />
            <PresentationMetric label="Incline" value={params.incline.toFixed(2)} suffix="deg" />
            <PresentationMetric label="Mirror" value={params.mirror_x ? "On" : "Off"} />
          </div>
        </div>

        <div className="border-t border-white/[0.12] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="font-mono text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
            Profile Curve
          </div>
          <div className="mt-3 font-mono text-lg font-black text-slate-50">{profileSummary}</div>
          <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-white/10">
            {params.profile_points.map((point, index) => (
              <span
                key={`${point.x}-${index}`}
                className="h-full border-r border-slate-950/40 bg-blue-200/80 last:border-r-0"
                style={{ flexGrow: point.y }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PresentationMetric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="min-w-0 border-l border-white/[0.14] pl-3">
      <div className="font-mono text-[9px] font-black uppercase tracking-[0.24em] text-slate-400/90">{label}</div>
      <div className="mt-2 flex min-w-0 items-baseline gap-1 text-xl font-black text-white sm:text-[1.7rem]">
        <span className="truncate">{value}</span>
        {suffix && <span className="text-xs font-bold uppercase text-blue-200/80">{suffix}</span>}
      </div>
    </div>
  );
}
