import { 
  Download, Layers, Filter, Search, FileText, Volume2, Upload,
  ChevronRight, Zap, Settings
} from 'lucide-react';
import { STAGES } from '../types/stage';
import type { StageInfo } from '../types/stage';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Download,
  Layers,
  Filter,
  Search,
  FileText,
  Volume2,
  Upload,
};

interface SidebarProps {
  selectedStage: string;
  onSelectStage: (stageId: string) => void;
  stageStatus: Record<string, 'pending' | 'running' | 'success' | 'failed'>;
}

export function Sidebar({ selectedStage, onSelectStage, stageStatus }: SidebarProps) {
  return (
    <aside className="w-72 bg-slate-950 border-r border-slate-800 flex flex-col h-screen">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center mr-3">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-semibold text-base text-slate-100">Pipeline</span>
          <span className="text-xs text-slate-500 ml-2">v1.0</span>
        </div>
      </div>
      
      {/* Stage List */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="px-5 mb-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Configuration
          </span>
        </div>
        
        <ul className="space-y-1 px-3 mb-4">
          <li>
            <button
              onClick={() => onSelectStage('global')}
              className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-all ${
                selectedStage === 'global'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Settings className="w-4 h-4 mr-3" />
              <span className="text-sm font-medium">Global Config</span>
            </button>
          </li>
        </ul>
        
        <div className="px-5 mb-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Stages
          </span>
        </div>
        
        <ul className="space-y-1 px-3">
          {STAGES.map((stage, index) => (
            <StageItem
              key={stage.id}
              stage={stage}
              isSelected={selectedStage === stage.id}
              status={stageStatus[stage.id] || 'pending'}
              onClick={() => onSelectStage(stage.id)}
              isLast={index === STAGES.length - 1}
            />
          ))}
        </ul>
      </nav>
      
      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="text-[10px] text-slate-600 font-mono">
          Modular Stages · Python Backend
        </div>
      </div>
    </aside>
  );
}

interface StageItemProps {
  stage: StageInfo;
  isSelected: boolean;
  status: 'pending' | 'running' | 'success' | 'failed';
  onClick: () => void;
  isLast: boolean;
}

function StageItem({ stage, isSelected, status, onClick, isLast }: StageItemProps) {
  const Icon = iconMap[stage.icon] || Download;
  
  const statusConfig = {
    pending: { color: 'bg-slate-600', ring: '' },
    running: { color: 'bg-amber-500', ring: 'ring-2 ring-amber-500/30 animate-pulse' },
    success: { color: 'bg-emerald-500', ring: 'ring-2 ring-emerald-500/20' },
    failed: { color: 'bg-red-500', ring: 'ring-2 ring-red-500/20' },
  };
  
  const cfg = statusConfig[status];
  
  return (
    <li className="relative">
      {/* Connector Line */}
      {!isLast && (
        <div className="absolute left-[22px] top-11 w-px h-4 bg-slate-800" />
      )}
      
      <button
        onClick={onClick}
        className={`
          w-full flex items-center px-3 py-3 rounded-lg text-left
          transition-all duration-150 cursor-pointer group
          ${isSelected 
            ? 'bg-slate-800 ring-1 ring-blue-500/40' 
            : 'hover:bg-slate-800/50'
          }
        `}
      >
        {/* Order Badge */}
        <div className={`
          w-8 h-8 rounded-lg flex items-center justify-center mr-3 text-xs font-mono font-medium
          transition-colors duration-150
          ${isSelected 
            ? 'bg-blue-600 text-white' 
            : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-300'
          }
        `}>
          {stage.order}
        </div>
        
        {/* Icon + Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
            <span className={`font-medium text-sm ${isSelected ? 'text-slate-100' : 'text-slate-300'}`}>
              {stage.name}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 pl-5 truncate">{stage.description}</div>
        </div>
        
        {/* Status Dot */}
        <div className={`w-2 h-2 rounded-full ${cfg.color} ${cfg.ring}`} />
        
        {/* Arrow */}
        <ChevronRight className={`
          w-3.5 h-3.5 ml-1.5 transition-all duration-150
          ${isSelected ? 'text-blue-400 opacity-100' : 'text-slate-600 opacity-0 group-hover:opacity-50'}
        `} />
      </button>
    </li>
  );
}
