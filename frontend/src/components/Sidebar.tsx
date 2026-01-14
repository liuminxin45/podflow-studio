import { 
  Download, Layers, Filter, Search, FileText, Volume2, Upload,
  ChevronRight, Zap
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
    <aside className="w-72 bg-dark-950 border-r border-dark-700 flex flex-col h-screen">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-dark-700">
        <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center mr-3">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-semibold text-base text-dark-50">Pipeline</span>
          <span className="text-xs text-dark-400 ml-2">v1.0</span>
        </div>
      </div>
      
      {/* Stage List */}
      <nav className="flex-1 py-6 overflow-y-auto">
        <div className="px-6 mb-4">
          <span className="text-[11px] font-semibold text-dark-500 uppercase tracking-widest">
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
      <div className="p-4 border-t border-dark-700">
        <div className="text-[11px] text-dark-500 font-mono">
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
    pending: { color: 'bg-dark-600', ring: '' },
    running: { color: 'bg-amber-500', ring: 'ring-2 ring-amber-500/30 animate-pulse' },
    success: { color: 'bg-emerald-500', ring: 'ring-2 ring-emerald-500/20' },
    failed: { color: 'bg-red-500', ring: 'ring-2 ring-red-500/20' },
  };
  
  const cfg = statusConfig[status];
  
  return (
    <li className="relative">
      {/* Connector Line */}
      {!isLast && (
        <div className="absolute left-[22px] top-10 w-px h-4 bg-dark-700" />
      )}
      
      <button
        onClick={onClick}
        className={`
          w-full flex items-center px-3 py-3 rounded-xl text-left
          transition-all duration-200 cursor-pointer group
          ${isSelected 
            ? 'bg-dark-800 ring-1 ring-primary-500/50' 
            : 'hover:bg-dark-800/50'
          }
        `}
      >
        {/* Order Badge */}
        <div className={`
          w-8 h-8 rounded-lg flex items-center justify-center mr-3 text-sm font-mono font-medium
          transition-colors duration-200
          ${isSelected 
            ? 'bg-primary-600 text-white' 
            : 'bg-dark-800 text-dark-400 group-hover:bg-dark-700 group-hover:text-dark-300'
          }
        `}>
          {stage.order}
        </div>
        
        {/* Icon + Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${isSelected ? 'text-primary-400' : 'text-dark-500'}`} />
            <span className={`font-medium text-sm ${isSelected ? 'text-dark-50' : 'text-dark-300'}`}>
              {stage.name}
            </span>
          </div>
          <div className="text-xs text-dark-500 mt-0.5 pl-6">{stage.description}</div>
        </div>
        
        {/* Status Dot */}
        <div className={`w-2.5 h-2.5 rounded-full ${cfg.color} ${cfg.ring}`} />
        
        {/* Arrow */}
        <ChevronRight className={`
          w-4 h-4 ml-2 transition-all duration-200
          ${isSelected ? 'text-primary-400 opacity-100' : 'text-dark-600 opacity-0 group-hover:opacity-50'}
        `} />
      </button>
    </li>
  );
}
