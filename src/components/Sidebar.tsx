import { useEffect, useRef, useState } from "react";
import { ChatMessage, ProfilePoint, SculptureParams } from "../types";
import { Loader2, MessageSquare, RotateCcw, Send, Sliders } from "lucide-react";
import { parseParamsFromText } from "../services/aiService";

const DEFAULT_PROFILE_POINTS: ProfilePoint[] = [
  { x: 0.0, y: 0.7 },
  { x: 1 / 3, y: 1.2 },
  { x: 2 / 3, y: 1.2 },
  { x: 1.0, y: 0.7 },
];

const PROFILE_MIN_Y = 0.2;
const PROFILE_MAX_Y = 2.0;

interface Props {
  params: SculptureParams;
  setParams: (params: SculptureParams) => void;
  isGenerating: boolean;
  onResetSculpture: () => void;
}

export default function Sidebar({ params, setParams, isGenerating, onResetSculpture }: Props) {
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: "ai",
      content: "你好，我是你的 3D 雕塑助手。你可以描述想要的雕塑形态，比如长度、波浪、倾斜、扭转和切片数量。",
    },
  ]);
  const [isParsing, setIsParsing] = useState(false);
  const [panelFrame, setPanelFrame] = useState({ x: 24, y: 96, width: 320, height: 420 });
  const [sidebarWidth, setSidebarWidth] = useState(384);
  const panelFrameRef = useRef(panelFrame);
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    panelFrameRef.current = panelFrame;
  }, [panelFrame]);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
  }, [sidebarWidth]);

  useEffect(() => {
    const defaultHeight = Math.round(window.innerHeight / 3);
    const height = Math.max(260, defaultHeight);
    setPanelFrame((frame) => ({
      ...frame,
      height,
      y: Math.max(12, window.innerHeight - height - 24),
    }));
  }, []);

  const startPanelDrag = (mode: "move" | "resize" | "sidebar", event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startFrame = panelFrameRef.current;
    const startSidebarWidth = sidebarWidthRef.current;
    const margin = 12;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (mode === "sidebar") {
        const nextWidth = startSidebarWidth - deltaX;
        const maxWidth = Math.min(720, Math.max(300, window.innerWidth - 360));
        setSidebarWidth(Math.min(Math.max(300, nextWidth), maxWidth));
        return;
      }

      if (mode === "move") {
        const maxX = window.innerWidth - startFrame.width - margin;
        const maxY = window.innerHeight - startFrame.height - margin;
        setPanelFrame({
          ...startFrame,
          x: Math.min(Math.max(margin, startFrame.x + deltaX), Math.max(margin, maxX)),
          y: Math.min(Math.max(margin, startFrame.y + deltaY), Math.max(margin, maxY)),
        });
        return;
      }

      const maxWidth = window.innerWidth - startFrame.x - margin;
      const maxHeight = window.innerHeight - startFrame.y - margin;
      setPanelFrame({
        ...startFrame,
        width: Math.min(Math.max(280, startFrame.width + deltaX), Math.max(280, maxWidth)),
        height: Math.min(Math.max(260, startFrame.height + deltaY), Math.max(260, maxHeight)),
      });
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
    document.body.style.cursor = mode === "move" ? "grabbing" : mode === "resize" ? "nwse-resize" : "ew-resize";
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = input;
    setInput("");
    setChat((prev) => [...prev, { role: "user", content: userMsg }]);

    setIsParsing(true);
    try {
      const newParams = await parseParamsFromText(userMsg);
      const nextParams = { ...newParams, mirror_x: params.mirror_x, profile_points: params.profile_points };
      setParams(nextParams);
      setChat((prev) => [
        ...prev,
        {
          role: "ai",
          content: `好的，我已调整参数：长度 ${nextParams.length}m，波浪 ${nextParams.wave}，倾斜 ${nextParams.incline}，扭转 ${nextParams.twist_angle}°，切片 ${nextParams.slice_count}。`,
        },
      ]);
    } catch {
      setChat((prev) => [...prev, { role: "ai", content: "抱歉，解析失败，请稍后重试。" }]);
    } finally {
      setIsParsing(false);
    }
  };

  const updateParam = (key: keyof SculptureParams, value: number) => {
    setParams({ ...params, [key]: value });
  };

  const updateProfilePoints = (profilePoints: ProfilePoint[]) => {
    setParams({ ...params, profile_points: profilePoints });
  };

  const resetProfilePoints = () => {
    setParams({ ...params, profile_points: DEFAULT_PROFILE_POINTS });
  };

  return (
    <>
      <div
        className="cipher-ai-panel fixed z-20 flex flex-col p-4 text-slate-200"
        style={{ left: panelFrame.x, top: panelFrame.y, width: panelFrame.width, height: panelFrame.height }}
      >
        <div className="mb-4 flex cursor-grab items-center gap-2 active:cursor-grabbing" onPointerDown={(event) => startPanelDrag("move", event)}>
          <MessageSquare size={18} className="text-[#ffd400]" />
          <div className="flex flex-col">
            <span className="text-sm font-medium cipher-accent">AI 助手</span>
            <span className="cipher-small-muted">实时参数解析 · 生成预览</span>
          </div>
        </div>

        <div className="mb-4 flex-1 space-y-4 overflow-y-auto pr-2">
          {chat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === "user" ? "cipher-chat-bubble-user" : "cipher-chat-bubble-ai"}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isParsing && (
            <div className="flex justify-start">
              <div className="cipher-ai-loading rounded-2xl p-3">
                <Loader2 className="animate-spin text-[#ffd400]" size={16} />
              </div>
            </div>
          )}
        </div>

        <div className="cipher-ai-input relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="输入你的想法..."
            className="w-full rounded-xl bg-transparent py-3 pl-4 pr-12 text-sm focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={isParsing}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#ffd400] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>

        <div
          className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-br-lg border-b-2 border-r-2 border-[#ffd400]/70"
          onPointerDown={(event) => startPanelDrag("resize", event)}
          aria-label="调整 AI 助手面板大小"
        />
      </div>

      <div className="fixed right-0 top-0 z-10 flex h-screen flex-col px-4 py-6 text-slate-200 cipher-sidebar" style={{ width: sidebarWidth }}>
        <div
          className="absolute left-0 top-0 z-30 h-full w-5 -translate-x-2.5 cursor-ew-resize hover:bg-[#ffd400]/10"
          onPointerDown={(event) => startPanelDrag("sidebar", event)}
          aria-label="调整参数面板宽度"
        />
        <div className="flex-1 overflow-y-auto px-0 py-4">
          <div className="cipher-panel">
            <div className="mb-2 flex items-center gap-2 font-medium text-[#ffd400]">
              <Sliders size={18} />
              <span>参数控制</span>
            </div>

            <button
              onClick={onResetSculpture}
              disabled={isGenerating}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[rgba(255,212,0,0.06)] bg-transparent py-2 text-sm text-[#ffd400] transition-colors hover:bg-[rgba(255,212,0,0.03)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw size={16} className="text-[#ffd400]" />
              重置雕塑参数
            </button>

            <div className="mt-4 space-y-6">
              <ControlItem label="切片数量" value={params.slice_count} min={1} max={100} step={1} onChange={(v) => updateParam("slice_count", v)} />
              <ControlItem label="雕塑长度 (m)" value={params.length} min={0.1} max={20} step={0.1} onChange={(v) => updateParam("length", v)} />
              <ControlItem label="波浪幅度" value={params.wave} min={0} max={10} step={0.01} onChange={(v) => updateParam("wave", v)} />
              <ControlItem label="切片厚度" value={params.thickness} min={0.01} max={2} step={0.01} onChange={(v) => updateParam("thickness", v)} />
              <ControlItem label="扭曲角度 (°)" value={params.twist_angle} min={0} max={360} step={1} onChange={(v) => updateParam("twist_angle", v)} />
              <ControlItem label="倾斜角度" value={params.incline} min={-20} max={20} step={0.01} onChange={(v) => updateParam("incline", v)} />
              <ToggleItem
                label="X 轴对称"
                checked={params.mirror_x}
                onChange={(checked) => setParams({ ...params, mirror_x: checked })}
              />
              <ProfileCurveEditor points={params.profile_points} onChange={updateProfilePoints} onReset={resetProfilePoints} />
            </div>
          </div>
        </div>
      </div>
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
    <label className="cipher-panel flex cursor-pointer items-center justify-between gap-3">
      <span className="text-xs cipher-label">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#ffd400]"
      />
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
  const height = 150;
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
    <div className="cipher-panel space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[#ffd400]">外轮廓曲线</span>
        <span className="cipher-small-muted">0.2 - 2.0</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full touch-none rounded-lg border border-[rgba(255,212,0,0.06)] bg-black/25"
        preserveAspectRatio="none"
      >
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,212,0,0.12)" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="rgba(255,212,0,0.12)" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 6" />
        <polyline points={polylinePoints} fill="none" stroke="#ffd400" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {svgPoints.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={6}
            fill="#ffd400"
            stroke="#0a0a0a"
            strokeWidth={2}
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={(event) => startPointDrag(index, event)}
          />
        ))}
      </svg>
      <button
        onClick={onReset}
        className="flex w-full items-center justify-center rounded-lg border border-[rgba(255,212,0,0.08)] bg-transparent py-2 text-sm text-[#ffd400] transition-colors hover:bg-[rgba(255,212,0,0.04)]"
      >
        重置轮廓
      </button>
    </div>
  );
}

function ControlItem({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs cipher-label">
        <span>{label}</span>
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
          className="cipher-number-input w-20 bg-transparent text-right font-mono text-[#ffd400] outline-none focus:text-white"
          aria-label={`${label} 数值`}
        />
      </div>
      <div className="cipher-panel">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer cipher-range"
        />
      </div>
    </div>
  );
}
