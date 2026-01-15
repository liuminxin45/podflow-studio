import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, X, Trash2, Download, Search, ChevronDown, ChevronUp, Wifi, WifiOff } from 'lucide-react';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  stage?: string;
  message: string;
}

interface ConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Console({ isOpen, onClose }: ConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'info' | 'warning' | 'error' | 'debug'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logsEndRef.current && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // SSE connection with reconnection logic
  const connectToLogStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('http://localhost:8000/logs/stream');
    eventSourceRef.current = eventSource;
    
    eventSource.onopen = () => {
      setConnected(true);
      console.log('Log stream connected');
    };
    
    eventSource.onmessage = (event) => {
      try {
        const logEntry: LogEntry = JSON.parse(event.data);
        setLogs(prev => {
          // Limit to last 500 logs to prevent memory issues
          const newLogs = [...prev, logEntry];
          return newLogs.slice(-500);
        });
      } catch (err) {
        console.error('Failed to parse log entry:', err);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      // Reconnect after 2 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connectToLogStream();
      }, 2000);
    };
  }, []);

  useEffect(() => {
    connectToLogStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectToLogStream]);

  const handleClear = () => {
    setLogs([]);
  };

  const handleDownload = () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] [${log.level.toUpperCase()}]${log.stage ? ` [${log.stage}]` : ''} ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log => {
    const matchesFilter = filter === 'all' || log.level === filter;
    const matchesSearch = searchTerm === '' || 
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.stage && log.stage.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const levelConfig = {
    info: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
    warning: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
    error: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
    debug: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-80 bg-slate-900 border-t border-slate-700 flex flex-col z-50 shadow-2xl" style={{ height: '320px' }}>
      {/* Header */}
      <div className="h-12 bg-slate-950 border-b border-slate-700 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Console</h2>
          <span className="text-xs text-slate-500 font-mono">
            {filteredLogs.length} logs
          </span>
          {/* Connection status */}
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${connected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
            {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {connected ? 'Live' : 'Disconnected'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-40"
            />
          </div>

          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer"
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              autoScroll 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          >
            {autoScroll ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            title="Download logs"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-red-900/50 transition-colors cursor-pointer"
            title="Close console"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Logs */}
      <div 
        ref={logsContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs bg-slate-900"
        style={{ minHeight: 0 }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Terminal className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No logs to display</p>
            {searchTerm && <p className="text-xs mt-1">Try adjusting your search or filter</p>}
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            const cfg = levelConfig[log.level];
            return (
              <div
                key={index}
                className={`flex items-start gap-2 px-2 py-1.5 rounded ${cfg.bg} border ${cfg.border}`}
              >
                <span className="text-slate-500 text-xs whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`text-xs font-medium uppercase whitespace-nowrap w-12 ${cfg.text}`}>
                  {log.level}
                </span>
                {log.stage && (
                  <span className="text-blue-400 text-xs whitespace-nowrap">
                    [{log.stage}]
                  </span>
                )}
                <span className="text-slate-200 flex-1 break-all">
                  {log.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
