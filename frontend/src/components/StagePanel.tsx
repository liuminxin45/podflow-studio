import { useState } from 'react';
import { Play, RefreshCw, ChevronDown, ChevronUp, Copy, Check, Terminal, Clock, AlertCircle } from 'lucide-react';
import { STAGES } from '../types/stage';
import type { StageData } from '../types/stage';

interface StagePanelProps {
  stageId: string;
  stageData: StageData;
  onRun: (stageId: string) => void;
  isRunning: boolean;
}

export function StagePanel({ stageId, stageData, onRun, isRunning }: StagePanelProps) {
  const stage = STAGES.find(s => s.id === stageId);
  const [inputExpanded, setInputExpanded] = useState(true);
  const [outputExpanded, setOutputExpanded] = useState(true);
  
  if (!stage) return null;
  
  const status = stageData.result?.status || 'pending';
  
  const statusConfig = {
    pending: { bg: 'bg-dark-700', text: 'text-dark-400', label: 'Pending' },
    success: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Success' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Failed' },
    running: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Running' },
    partial: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Partial' },
    skipped: { bg: 'bg-dark-600', text: 'text-dark-400', label: 'Skipped' },
  };
  
  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-dark-900">
      {/* Header */}
      <header className="h-16 bg-dark-900 border-b border-dark-700 flex items-center justify-between px-6">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-xl bg-dark-800 ring-1 ring-dark-600 flex items-center justify-center mr-4">
            <span className="text-primary-400 font-mono font-semibold">{stage.order}</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-dark-50">
              {stage.name}
            </h1>
            <p className="text-sm text-dark-400">{stage.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Status Badge */}
          <span className={`px-3 py-1.5 rounded-lg text-xs font-medium ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>
          
          {/* Run Button */}
          <button
            onClick={() => onRun(stageId)}
            disabled={isRunning}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm
              transition-all duration-200 cursor-pointer
              ${isRunning 
                ? 'bg-dark-700 text-dark-400 cursor-not-allowed' 
                : 'bg-primary-600 text-white hover:bg-primary-500 shadow-lg shadow-primary-600/25'
              }
            `}
          >
            {isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isRunning ? 'Running...' : 'Run Stage'}
          </button>
        </div>
      </header>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Input Section */}
        <CollapsibleSection
          title="Input"
          subtitle="从上一 Stage 自动获取"
          expanded={inputExpanded}
          onToggle={() => setInputExpanded(!inputExpanded)}
          icon={<Terminal className="w-4 h-4 text-primary-400" />}
        >
          <JsonViewer data={stageData.input} />
        </CollapsibleSection>
        
        {/* Output Section */}
        <CollapsibleSection
          title="Output"
          subtitle="Stage 执行结果"
          expanded={outputExpanded}
          onToggle={() => setOutputExpanded(!outputExpanded)}
          icon={<Terminal className="w-4 h-4 text-emerald-400" />}
        >
          {stageData.output ? (
            <JsonViewer data={stageData.output} />
          ) : (
            <div className="text-center py-12 text-dark-500">
              <Terminal className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>尚未运行，暂无输出</p>
            </div>
          )}
        </CollapsibleSection>
        
        {/* Metadata */}
        {stageData.result?.metadata?.duration_seconds && (
          <div className="bg-dark-800 rounded-xl p-4 ring-1 ring-dark-700">
            <div className="flex items-center gap-2 text-dark-300 mb-3">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">执行信息</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-dark-500">版本:</span>
                <code className="text-dark-200 font-mono text-xs bg-dark-900 px-2 py-0.5 rounded">
                  {stageData.result.metadata.stage_version}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-dark-500">耗时:</span>
                <code className="text-emerald-400 font-mono text-xs">
                  {stageData.result.metadata.duration_seconds?.toFixed(2)}s
                </code>
              </div>
            </div>
          </div>
        )}
        
        {/* Error */}
        {stageData.result?.error && (
          <div className="bg-red-500/10 rounded-xl p-4 ring-1 ring-red-500/30">
            <div className="flex items-center gap-2 text-red-400 mb-3">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">错误信息</span>
            </div>
            <pre className="text-sm text-red-300 font-mono whitespace-pre-wrap overflow-x-auto">
              {stageData.result.error}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

function CollapsibleSection({ title, subtitle, expanded, onToggle, children, icon }: CollapsibleSectionProps) {
  return (
    <div className="bg-dark-800 rounded-xl ring-1 ring-dark-700 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-dark-750 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h2 className="text-base font-semibold text-dark-100">{title}</h2>
            <p className="text-sm text-dark-500">{subtitle}</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-dark-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-dark-500" />
        )}
      </button>
      
      {expanded && (
        <div className="border-t border-dark-700 p-4">
          {children}
        </div>
      )}
    </div>
  );
}

interface JsonViewerProps {
  data: Record<string, unknown>;
}

function JsonViewer({ data }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const jsonStr = JSON.stringify(data, null, 2);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors cursor-pointer z-10"
        title="Copy JSON"
      >
        {copied ? (
          <Check className="w-4 h-4 text-emerald-400" />
        ) : (
          <Copy className="w-4 h-4 text-dark-400" />
        )}
      </button>
      <pre className="bg-dark-950 text-dark-200 rounded-lg p-4 overflow-x-auto text-sm font-mono max-h-96 overflow-y-auto ring-1 ring-dark-700">
        {jsonStr}
      </pre>
    </div>
  );
}
