import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Wifi, WifiOff, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface LLMProvider {
  id: string;
  name: string;
  apiUrl: string;
  modelsUrl?: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
  selectedModel?: string;
  isCustom?: boolean;
}

interface LLMProviderManagerProps {
  onProviderChange?: (providerId: string) => void;
}

export function LLMProviderManager({ onProviderChange }: LLMProviderManagerProps) {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [fetchingModels, setFetchingModels] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<LLMProvider>>({
    id: '',
    name: '',
    apiUrl: '',
    modelsUrl: '',
    apiKey: '',
    models: [],
    defaultModel: '',
  });

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await fetch('http://localhost:8000/llm/providers');
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers);
        setSelectedProvider(data.selected_provider || '');
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  };

  const testConnection = async (provider: LLMProvider) => {
    setTestingProvider(provider.id);
    try {
      const response = await fetch('http://localhost:8000/llm/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: provider.apiUrl,
          modelsUrl: provider.modelsUrl,
          apiKey: provider.apiKey,
        }),
      });
      
      const result = await response.json();
      setTestResults(prev => ({
        ...prev,
        [provider.id]: {
          success: result.success,
          message: result.message,
        },
      }));

      // If successful and has modelsUrl, fetch models
      if (result.success && result.models) {
        setProviders(prev => prev.map(p => 
          p.id === provider.id ? { ...p, models: result.models } : p
        ));
      }
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [provider.id]: {
          success: false,
          message: `Connection failed: ${error}`,
        },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const saveProvider = async () => {
    if (!formData.id || !formData.name || !formData.apiUrl || !formData.apiKey) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/llm/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          isCustom: true,
        }),
      });

      if (response.ok) {
        await loadProviders();
        setIsAddingProvider(false);
        setEditingProvider(null);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to save provider:', error);
      alert('Failed to save provider');
    }
  };

  const deleteProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;

    try {
      const response = await fetch(`http://localhost:8000/llm/providers/${providerId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadProviders();
      }
    } catch (error) {
      console.error('Failed to delete provider:', error);
    }
  };

  const selectProvider = async (providerId: string) => {
    try {
      const response = await fetch('http://localhost:8000/llm/providers/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId }),
      });

      if (response.ok) {
        setSelectedProvider(providerId);
        onProviderChange?.(providerId);
      }
    } catch (error) {
      console.error('Failed to select provider:', error);
    }
  };

  const startEdit = (provider: LLMProvider) => {
    setFormData({ ...provider });
    setEditingProvider(provider.id);
    setIsAddingProvider(true);
  };

  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      apiUrl: '',
      modelsUrl: '',
      apiKey: '',
      models: [],
      defaultModel: '',
    });
  };

  const fetchModels = async (provider: LLMProvider) => {
    if (!provider.modelsUrl) return;

    setFetchingModels(provider.id);
    try {
      const response = await fetch('http://localhost:8000/llm/fetch-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelsUrl: provider.modelsUrl,
          apiKey: provider.apiKey,
        }),
      });

      const result = await response.json();
      if (result.success && result.models) {
        setProviders(prev => prev.map(p => 
          p.id === provider.id ? { ...p, models: result.models } : p
        ));
        
        // Auto-expand to show models
        setExpandedProvider(provider.id);
      } else {
        alert(result.message || 'Failed to fetch models');
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      alert('Failed to fetch models');
    } finally {
      setFetchingModels(null);
    }
  };

  const updateProviderModel = async (providerId: string, model: string) => {
    try {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) return;

      const updatedProvider = { ...provider, selectedModel: model, defaultModel: model };
      
      const response = await fetch('http://localhost:8000/llm/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProvider),
      });

      if (response.ok) {
        setProviders(prev => prev.map(p => 
          p.id === providerId ? updatedProvider : p
        ));
        
        // If this is the selected provider, update the global config
        if (selectedProvider === providerId) {
          await selectProvider(providerId);
        }
      }
    } catch (error) {
      console.error('Failed to update model:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">LLM Providers</h3>
        <button
          onClick={() => {
            resetForm();
            setIsAddingProvider(true);
            setEditingProvider(null);
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Provider
        </button>
      </div>

      {/* Add/Edit Provider Form */}
      {isAddingProvider && (
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-200">
            {editingProvider ? 'Edit Provider' : 'Add New Provider'}
          </h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Provider ID *</label>
              <input
                type="text"
                value={formData.id || ''}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                disabled={!!editingProvider}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                placeholder="e.g., bltcy"
              />
            </div>
            
            <div>
              <label className="text-xs text-slate-400 block mb-1">Provider Name *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="e.g., BLTCY AI"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">API URL *</label>
            <input
              type="text"
              value={formData.apiUrl || ''}
              onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="https://api.example.com/v1/chat/completions"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Models URL (optional)</label>
            <input
              type="text"
              value={formData.modelsUrl || ''}
              onChange={(e) => setFormData({ ...formData, modelsUrl: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="https://api.example.com/v1/models"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">API Key *</label>
            <input
              type="password"
              value={formData.apiKey || ''}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="sk-..."
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Default Model</label>
            <input
              type="text"
              value={formData.defaultModel || ''}
              onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="e.g., gpt-4"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={saveProvider}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={() => {
                setIsAddingProvider(false);
                setEditingProvider(null);
                resetForm();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Provider List */}
      <div className="space-y-2">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={`bg-slate-800/50 rounded-lg border ${
              selectedProvider === provider.id ? 'border-blue-500' : 'border-slate-700'
            } overflow-hidden`}
          >
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="radio"
                    checked={selectedProvider === provider.id}
                    onChange={() => selectProvider(provider.id)}
                    className="w-4 h-4 text-blue-600 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-100">{provider.name}</h4>
                      {provider.isCustom && (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">Custom</span>
                      )}
                      {testResults[provider.id] && (
                        testResults[provider.id].success ? (
                          <Wifi className="w-4 h-4 text-green-400" />
                        ) : (
                          <WifiOff className="w-4 h-4 text-red-400" />
                        )
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{provider.apiUrl}</p>
                    {(provider.selectedModel || provider.defaultModel) && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        Model: {provider.selectedModel || provider.defaultModel}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {provider.modelsUrl && (
                    <button
                      onClick={() => fetchModels(provider)}
                      disabled={fetchingModels === provider.id}
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                      title="Fetch models"
                    >
                      {fetchingModels === provider.id ? (
                        <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => testConnection(provider)}
                    disabled={testingProvider === provider.id}
                    className="p-1.5 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                    title="Test connection"
                  >
                    {testingProvider === provider.id ? (
                      <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  <button
                    onClick={() => startEdit(provider)}
                    className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                    title="Edit provider"
                  >
                    <Edit2 className="w-4 h-4 text-slate-400" />
                  </button>
                  {provider.isCustom && (
                    <button
                      onClick={() => deleteProvider(provider.id)}
                      className="p-1.5 hover:bg-red-900/50 rounded transition-colors"
                      title="Delete provider"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                  {provider.models.length > 0 && (
                    <button
                      onClick={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                    >
                      {expandedProvider === provider.id ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {testResults[provider.id] && (
                <div className={`mt-2 p-2 rounded text-xs ${
                  testResults[provider.id].success 
                    ? 'bg-green-500/10 text-green-400' 
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {testResults[provider.id].message}
                </div>
              )}

              {expandedProvider === provider.id && provider.models.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Select Model ({provider.models.length} available)
                    </label>
                    <select
                      value={provider.selectedModel || provider.defaultModel}
                      onChange={(e) => updateProviderModel(provider.id, e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
                    >
                      {provider.models.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
