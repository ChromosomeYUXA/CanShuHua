import { useState } from "react";
import { SculptureParams, ChatMessage } from "../types";
import { Send, Loader2, Sliders, MessageSquare, RotateCcw } from "lucide-react";
import { parseParamsFromText } from "../services/aiService";

interface Props {
  params: SculptureParams;
  setParams: (params: SculptureParams) => void;
  isGenerating: boolean;
  onResetSculpture: () => void;
}

export default function Sidebar({ params, setParams, isGenerating, onResetSculpture }: Props) {
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([
    { role: 'ai', content: '你好！我是你的 3D 雕塑助手。你可以告诉我你想要的雕塑样式，例如：“长5米，扭转180度，切片多一点”。' }
  ]);
  const [isParsing, setIsParsing] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = input;
    setInput("");
    setChat(prev => [...prev, { role: 'user', content: userMsg }]);

    setIsParsing(true);
    try {
      const newParams = await parseParamsFromText(userMsg);
      setParams(newParams);
      setChat(prev => [...prev, { role: 'ai', content: `好的，我已调整参数：长度 ${newParams.length}m，扭转 ${newParams.twist_angle}°，切片 ${newParams.slice_count}。` }]);
    } catch (e) {
      setChat(prev => [...prev, { role: 'ai', content: '抱歉，解析失败，请稍后重试。' }]);
    } finally {
      setIsParsing(false);
    }
  };

  const updateParam = (key: keyof SculptureParams, value: number) => {
    setParams({ ...params, [key]: value });
  };

  return (
    <div className="w-96 h-screen bg-transparent border-l border-transparent flex flex-col text-slate-200 cipher-sidebar px-4 py-6">
      {/* AI 对话区 */}
      <div className="flex-[1.2] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 mb-4 cipher-panel">
          <MessageSquare size={18} className="text-[#ffd400]" />
          <div className="flex flex-col">
            <span className="text-sm font-medium cipher-accent">AI 助手</span>
            <span className="cipher-small-muted">实时参数解析 · 生成预览</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
          {chat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                msg.role === 'user' ? 'cipher-chat-bubble-user' : 'cipher-chat-bubble-ai'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isParsing && (
            <div className="flex justify-start">
              <div className="cipher-panel p-3 rounded-2xl">
                <Loader2 className="animate-spin text-[#ffd400]" size={16} />
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入你的想法..."
            className="w-full bg-transparent border border-[rgba(255,212,0,0.06)] rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none transition-all cipher-focus-ring"
          />
          <button 
            onClick={handleSend}
            disabled={isParsing}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#ffd400] hover:opacity-90 disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* 参数控制区 */}
      <div className="flex-1 px-0 py-4 space-y-6 overflow-y-auto">
        <div className="cipher-panel">
          <div className="flex items-center gap-2 text-[#ffd400] font-medium mb-2">
            <Sliders size={18} />
            <span>参数控制</span>
          </div>

          <button
            onClick={onResetSculpture}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-[rgba(255,212,0,0.06)] bg-transparent py-2 text-sm text-[#ffd400] hover:bg-[rgba(255,212,0,0.03)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw size={16} className="text-[#ffd400]" />
            重置雕塑参数
          </button>

          <div className="space-y-6 mt-4">
            {/* [SIDEBAR: UI_CONTROLS] 如果增加了新参数，请在这里添加对应的 ControlItem */}
            <ControlItem 
              label="切片数量" 
              value={params.slice_count} 
              min={1} max={100} step={1}
              onChange={(v) => updateParam('slice_count', v)}
            />
            <ControlItem 
              label="雕塑长度 (m)" 
              value={params.length} 
              min={0.1} max={20} step={0.1}
              onChange={(v) => updateParam('length', v)}
            />
            <ControlItem 
              label="切片厚度" 
              value={params.thickness} 
              min={0.01} max={2} step={0.01}
              onChange={(v) => updateParam('thickness', v)}
            />
            <ControlItem 
              label="扭曲角度 (°)" 
              value={params.twist_angle} 
              min={0} max={360} step={1}
              onChange={(v) => updateParam('twist_angle', v)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlItem({ label, value, min, max, step, onChange }: {
  label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs cipher-label">
        <span>{label}</span>
        <span className="text-[#ffd400] font-mono">{value}</span>
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
