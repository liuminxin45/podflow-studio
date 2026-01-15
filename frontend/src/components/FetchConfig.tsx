import { useState, useEffect } from 'react';
import { Rss, ToggleLeft, ToggleRight, RefreshCw, Save, ChevronDown, ChevronUp } from 'lucide-react';

interface RssSource {
  name: string;
  fetcher: string;
  enabled: boolean;
  category: string;
  urls: string[];
}

interface FetchConfigProps {
  onConfigChange?: (sources: RssSource[]) => void;
}

export function FetchConfig({ onConfigChange }: FetchConfigProps) {
  const [sources, setSources] = useState<RssSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/stage/fetch/config');
      if (response.ok) {
        const data = await response.json();
        setSources(data.config?.sources || []);
      }
    } catch (error) {
      console.error('Failed to load fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (index: number) => {
    setSources(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], enabled: !updated[index].enabled };
      return updated;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('http://localhost:8000/stage/fetch/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources }),
      });
      if (response.ok) {
        setHasChanges(false);
        onConfigChange?.(sources);
      }
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = sources.filter(s => s.enabled).length;

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-5 py-4 bg-slate-800/80 cursor-pointer hover:bg-slate-800 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Rss className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">RSS Sources</h3>
            <p className="text-xs text-slate-500">
              {enabledCount} of {sources.length} sources enabled
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Changes
            </button>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </div>

      {/* Sources List */}
      {expanded && (
        <div className="divide-y divide-slate-700/50">
          {sources.map((source, index) => (
            <div 
              key={index}
              className={`flex items-center justify-between px-5 py-3 transition-colors ${
                source.enabled ? 'bg-slate-800/30' : 'bg-slate-900/30 opacity-60'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${source.enabled ? 'text-slate-100' : 'text-slate-400'}`}>
                    {source.name}
                  </span>
                  <span className="px-1.5 py-0.5 text-xs rounded bg-slate-700 text-slate-400">
                    {source.fetcher}
                  </span>
                  <span className="px-1.5 py-0.5 text-xs rounded bg-slate-700/50 text-slate-500">
                    {source.category}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 truncate">
                  {source.urls?.[0] || 'No URL'}
                  {source.urls?.length > 1 && ` (+${source.urls.length - 1} more)`}
                </div>
              </div>
              
              <button
                onClick={() => toggleSource(index)}
                className="flex-shrink-0 p-1 cursor-pointer transition-colors"
                title={source.enabled ? 'Disable source' : 'Enable source'}
              >
                {source.enabled ? (
                  <ToggleRight className="w-8 h-8 text-emerald-400" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-slate-500" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
