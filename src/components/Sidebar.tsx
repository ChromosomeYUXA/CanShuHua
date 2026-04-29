import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Bot, GripHorizontal, Info, Loader2, RotateCcw, Send, SlidersHorizontal, Sparkles } from "lucide-react";
import { ChatMessage, ProfilePoint, SculptureParams } from "../types";
import { parseParamsFromText } from "../services/aiService";

const DEFAULT_PROFILE_POINTS: ProfilePoint[] = [
  { x: 0.0, y: 0.7 },
  { x: 1 / 3, y: 1.2 },
  { x: 2 / 3, y: 1.2 },
  { x: 1.0, y: 0.7 },
];

const PROFILE_MIN_Y = 0.2;
const PROFILE_MAX_Y = 2.0;
const AI_PANEL_MIN_WIDTH = 320;
const AI_PANEL_MIN_HEIGHT = 340;
const AI_PANEL_MARGIN = 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getInitialAiPanelFrame() {
  const width = 384;
  const height = 450;
  if (typeof window === "undefined") {
    return { x: AI_PANEL_MARGIN, y: AI_PANEL_MARGIN, width, height };
  }

  return {
    x: AI_PANEL_MARGIN,
    y: Math.max(AI_PANEL_MARGIN, window.innerHeight - height - AI_PANEL_MARGIN),
    width,
    height,
  };
}

interface Props {
  params: SculptureParams;
  setParams: (params: SculptureParams) => void;
  isGenerating: boolean;
  onResetSculpture: () => void;
  onPromptSubmitted?: (prompt: string) => void;
}

export default function Sidebar({ params, setParams, isGenerating, onResetSculpture, onPromptSubmitted }: Props) {
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: "ai",
      content: "您好，我是您的 3D 雕塑创意助手。可以描述整体感觉、比例、曲线、镜像和动态，我会同步更新集合体。",
    },
  ]);
  const [isParsing, setIsParsing] = useState(false);
  const [aiPanelFrame, setAiPanelFrame] = useState(getInitialAiPanelFrame);

  useEffect(() => {
    const keepAiPanelInViewport = () => {
      setAiPanelFrame((frame) => {
        const maxWidth = Math.max(AI_PANEL_MIN_WIDTH, window.innerWidth - AI_PANEL_MARGIN * 2);
        const maxHeight = Math.max(AI_PANEL_MIN_HEIGHT, window.innerHeight - AI_PANEL_MARGIN * 2);
        const width = Math.min(frame.width, maxWidth);
        const height = Math.min(frame.height, maxHeight);

        return {
          width,
          height,
          x: clamp(frame.x, AI_PANEL_MARGIN, Math.max(AI_PANEL_MARGIN, window.innerWidth - width - AI_PANEL_MARGIN)),
          y: clamp(frame.y, AI_PANEL_MARGIN, Math.max(AI_PANEL_MARGIN, window.innerHeight - height - AI_PANEL_MARGIN)),
        };
      });
    };

    window.addEventListener("resize", keepAiPanelInViewport);
    return () => window.removeEventListener("resize", keepAiPanelInViewport);
  }, []);

  const startAiPanelDrag = (event: React.PointerEvent) => {
    if (event.button !== 0) return;

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startFrame = aiPanelFrame;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const nextX = startFrame.x + moveEvent.clientX - startX;
      const nextY = startFrame.y + moveEvent.clientY - startY;

      setAiPanelFrame((frame) => ({
        ...frame,
        x: clamp(nextX, AI_PANEL_MARGIN, Math.max(AI_PANEL_MARGIN, window.innerWidth - frame.width - AI_PANEL_MARGIN)),
        y: clamp(nextY, AI_PANEL_MARGIN, Math.max(AI_PANEL_MARGIN, window.innerHeight - frame.height - AI_PANEL_MARGIN)),
      }));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", cleanup, true);
      window.removeEventListener("pointercancel", cleanup, true);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", cleanup, true);
    window.addEventListener("pointercancel", cleanup, true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  };

  const startAiPanelResize = (event: React.PointerEvent) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startFrame = aiPanelFrame;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const maxWidth = Math.max(AI_PANEL_MIN_WIDTH, window.innerWidth - startFrame.x - AI_PANEL_MARGIN);
      const maxHeight = Math.max(AI_PANEL_MIN_HEIGHT, window.innerHeight - startFrame.y - AI_PANEL_MARGIN);

      setAiPanelFrame((frame) => ({
        ...frame,
        width: clamp(startFrame.width + moveEvent.clientX - startX, AI_PANEL_MIN_WIDTH, maxWidth),
        height: clamp(startFrame.height + moveEvent.clientY - startY, AI_PANEL_MIN_HEIGHT, maxHeight),
      }));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", cleanup, true);
      window.removeEventListener("pointercancel", cleanup, true);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", cleanup, true);
    window.addEventListener("pointercancel", cleanup, true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = input;
    setInput("");
    onPromptSubmitted?.(userMsg);
    setChat((prev) => [...prev, { role: "user", content: userMsg }]);

    setIsParsing(true);
    try {
      const nextParams = await parseParamsFromText(userMsg, params);
      setParams(nextParams);

      const profileSummary = nextParams.profile_points.map((point) => point.y.toFixed(2)).join(" / ");
      setChat((prev) => [
        ...prev,
        {
          role: "ai",
          content: `已更新：长度 ${nextParams.length}m，波浪 ${nextParams.wave}，厚度 ${nextParams.thickness}，倾斜 ${nextParams.incline}，扭转 ${nextParams.twist_angle}°，切片 ${nextParams.slice_count}，镜像 ${nextParams.mirror_x ? "开启" : "关闭"}，曲线 ${profileSummary}。`,
        },
      ]);
    } catch {
      setChat((prev) => [...prev, { role: "ai", content: "解析失败，请稍后重试或换一种描述方式。" }]);
    } finally {
      setIsParsing(false);
    }
  };

  const updateParam = (key: keyof SculptureParams, value: number) => {
    setParams({ ...params, [key]: value });
  };

  return (
    <>
      <motion.aside
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
        className="glass-panel fixed z-20 hidden flex-col overflow-hidden rounded-3xl text-slate-100 lg:flex"
        style={{
          left: aiPanelFrame.x,
          top: aiPanelFrame.y,
          width: aiPanelFrame.width,
          height: aiPanelFrame.height,
        }}
      >
        <div
          className="flex cursor-grab touch-none select-none items-center gap-3 border-b border-white/10 px-6 py-5 active:cursor-grabbing"
          onPointerDown={startAiPanelDrag}
        >
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600/30 text-blue-200">
            <Bot size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-white">AI Creative Assistant</div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ready to design
            </div>
          </div>
          <GripHorizontal size={17} className="shrink-0 text-slate-500" />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {chat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${msg.role === "user" ? "lab-chat-user" : "lab-chat-ai"}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isParsing && (
            <div className="lab-chat-ai inline-flex rounded-2xl px-4 py-3">
              <Loader2 className="animate-spin text-blue-300" size={16} />
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          <div className="lab-input relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="描述您的创意方案..."
              className="w-full bg-transparent py-3 pl-4 pr-12 text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              onClick={handleSend}
              disabled={isParsing}
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-white/5 text-blue-200 transition hover:bg-blue-500/20 active:scale-95 disabled:opacity-50"
              aria-label="发送"
            >
              <Send size={17} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onPointerDown={startAiPanelResize}
          className="absolute bottom-0 right-0 h-8 w-8 touch-none cursor-nwse-resize"
          aria-label="Resize AI panel"
        >
          <span className="absolute bottom-2 right-2 h-4 w-4 rounded-br-[1.5rem] border-b-2 border-r-2 border-blue-300/75" />
        </button>
      </motion.aside>

      <motion.aside
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55, delay: 0.12, ease: "easeOut" }}
        className="glass-panel fixed right-6 top-[12vh] z-20 flex max-h-[78vh] w-[320px] flex-col overflow-hidden rounded-3xl text-slate-100 md:w-[344px]"
      >
        <div className="flex items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600/25 text-blue-200">
              <SlidersHorizontal size={18} />
            </div>
            <div className="text-sm font-black text-white">参数控制</div>
          </div>
          <Info size={15} className="text-slate-500" />
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          <ControlItem label="Slice Count" unit="pcs" value={params.slice_count} min={1} max={100} step={1} onChange={(v) => updateParam("slice_count", v)} />
          <ControlItem label="Total Length" unit="m" value={params.length} min={0.1} max={20} step={0.1} onChange={(v) => updateParam("length", v)} />
          <ControlItem label="Wave Amplitude" unit="amp" value={params.wave} min={0} max={10} step={0.01} onChange={(v) => updateParam("wave", v)} />
          <ControlItem label="Thickness" unit="cm" value={params.thickness} min={0.01} max={2} step={0.01} onChange={(v) => updateParam("thickness", v)} />
          <ControlItem label="Twist Angle" unit="deg" value={params.twist_angle} min={0} max={360} step={1} onChange={(v) => updateParam("twist_angle", v)} />
          <ControlItem label="Incline" unit="deg" value={params.incline} min={-20} max={20} step={0.01} onChange={(v) => updateParam("incline", v)} />
          <ToggleItem label="Mirror X Axis" checked={params.mirror_x} onChange={(checked) => setParams({ ...params, mirror_x: checked })} />
          <ProfileCurveEditor
            points={params.profile_points}
            onChange={(profilePoints) => setParams({ ...params, profile_points: profilePoints })}
            onReset={() => setParams({ ...params, profile_points: DEFAULT_PROFILE_POINTS })}
          />

          <button
            onClick={onResetSculpture}
            disabled={isGenerating}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black text-slate-950 shadow-2xl shadow-blue-950/30 transition hover:bg-blue-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
            重置几何体
          </button>
        </div>

        <div className="border-t border-white/10 px-6 py-5 font-mono text-[10px] uppercase tracking-[0.26em] text-slate-500">
          Precision Parametric Engine v1.0
        </div>
      </motion.aside>
    </>
  );
}

function ToggleItem({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="lab-label">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-blue-500" />
    </label>
  );
}

function ProfileCurveEditor({
  points,
  onChange,
  onReset,
}: {
  points: ProfilePoint[];
  onChange: (points: ProfilePoint[]) => void;
  onReset: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = 320;
  const height = 142;
  const padding = 16;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const toSvgPoint = (point: ProfilePoint) => ({
    x: padding + point.x * (width - padding * 2),
    y: padding + (1 - (point.y - PROFILE_MIN_Y) / (PROFILE_MAX_Y - PROFILE_MIN_Y)) * (height - padding * 2),
  });

  const svgPoints = points.map(toSvgPoint);
  const polylinePoints = svgPoints.map((point) => `${point.x},${point.y}`).join(" ");

  const updatePointFromPointer = (index: number, event: PointerEvent | React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const rawX = (event.clientX - rect.left - padding) / Math.max(1, rect.width - padding * 2);
    const rawY = 1 - (event.clientY - rect.top - padding) / Math.max(1, rect.height - padding * 2);
    const nextPoints = points.map((point) => ({ ...point }));
    const point = nextPoints[index];
    if (!point) return;

    if (index !== 0 && index !== nextPoints.length - 1) {
      const minX = nextPoints[index - 1].x + 0.02;
      const maxX = nextPoints[index + 1].x - 0.02;
      point.x = clamp(rawX, minX, maxX);
    }

    point.y = clamp(PROFILE_MIN_Y + rawY * (PROFILE_MAX_Y - PROFILE_MIN_Y), PROFILE_MIN_Y, PROFILE_MAX_Y);
    onChange(nextPoints);
  };

  const startPointDrag = (index: number, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    updatePointFromPointer(index, event);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      updatePointFromPointer(index, moveEvent);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", cleanup, true);
      window.removeEventListener("pointercancel", cleanup, true);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", cleanup, true);
    window.addEventListener("pointercancel", cleanup, true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  };

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="lab-label">Profile Curve</span>
        <button onClick={onReset} className="text-blue-300 transition hover:text-white active:scale-95" aria-label="重置轮廓">
          <Sparkles size={16} />
        </button>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="h-36 w-full touch-none rounded-2xl border border-white/10 bg-slate-950/55" preserveAspectRatio="none">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(96,165,250,0.18)" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="rgba(96,165,250,0.18)" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" />
        <polyline points={polylinePoints} fill="none" stroke="#60a5fa" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {svgPoints.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={6}
            fill="#f8fafc"
            stroke="#2563eb"
            strokeWidth={2}
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={(event) => startPointDrag(index, event)}
          />
        ))}
      </svg>
    </div>
  );
}

function ControlItem({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const clampValue = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return value;
    const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
    const clamped = Math.min(max, Math.max(min, nextValue));
    return Number(clamped.toFixed(decimals));
  };

  const commitInput = () => {
    const nextValue = clampValue(Number(inputValue));
    setInputValue(String(nextValue));
    onChange(nextValue);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="lab-label">{label}</span>
        <label className="flex items-baseline gap-1 font-mono text-sm font-black text-white">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="lab-number-input w-16 bg-transparent text-right outline-none"
            aria-label={`${label} value`}
          />
          <span className="text-[10px] uppercase text-slate-500">{unit}</span>
        </label>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="lab-range w-full appearance-none"
      />
    </div>
  );
}

