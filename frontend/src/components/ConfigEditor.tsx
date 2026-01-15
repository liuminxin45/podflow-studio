import { useState } from 'react';
import { Save, RefreshCw, ChevronDown, ChevronUp, Settings, ToggleLeft, ToggleRight } from 'lucide-react';

interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  value: any;
  options?: string[]; // For select type
  description?: string;
}

interface ConfigEditorProps {
  stageName: string;
  fields: ConfigField[];
  onSave?: (config: Record<string, any>) => Promise<void>;
}

export function ConfigEditor({ stageName, fields: initialFields, onSave }: ConfigEditorProps) {
  const [fields, setFields] = useState<ConfigField[]>(initialFields);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  const updateField = (key: string, value: any) => {
    setFields(prev => prev.map(f => f.key === key ? { ...f, value } : f));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!onSave) return;
    
    setSaving(true);
    try {
      const config = fields.reduce((acc, field) => {
        acc[field.key] = field.value;
        return acc;
      }, {} as Record<string, any>);
      
      await onSave(config);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-5 py-4 bg-slate-800/80 cursor-pointer hover:bg-slate-800 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Settings className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{stageName} Configuration</h3>
            <p className="text-xs text-slate-500">
              {fields.length} parameters
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

      {/* Fields */}
      {expanded && (
        <div className="divide-y divide-slate-700/50">
          {fields.map((field) => (
            <div key={field.key} className="px-5 py-4 bg-slate-800/30">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium text-slate-200 block mb-1">
                    {field.label}
                  </label>
                  {field.description && (
                    <p className="text-xs text-slate-500 mb-2">{field.description}</p>
                  )}
                </div>
                
                <div className="flex-shrink-0 w-64">
                  {field.type === 'boolean' ? (
                    <button
                      onClick={() => updateField(field.key, !field.value)}
                      className="flex items-center gap-2 cursor-pointer"
                      title={field.value ? 'Enabled' : 'Disabled'}
                    >
                      {field.value ? (
                        <>
                          <ToggleRight className="w-8 h-8 text-emerald-400" />
                          <span className="text-xs text-emerald-400 font-medium">Enabled</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-8 h-8 text-slate-500" />
                          <span className="text-xs text-slate-500 font-medium">Disabled</span>
                        </>
                      )}
                    </button>
                  ) : field.type === 'select' ? (
                    <select
                      value={field.value}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
                    >
                      {field.options?.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      value={field.value}
                      onChange={(e) => updateField(field.key, parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  ) : (
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
