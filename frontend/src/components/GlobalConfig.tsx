import { useState, useEffect } from 'react';
import { ConfigEditor } from './ConfigEditor';
import { LLMProviderManager } from './LLMProviderManager';

export function GlobalConfig() {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/global/config');
      if (response.ok) {
        const data = await response.json();
        const configFields = convertConfigToFields(data.config);
        setFields(configFields);
      }
    } catch (error) {
      console.error('Failed to load global config:', error);
    } finally {
      setLoading(false);
    }
  };

  const convertConfigToFields = (config: any): any[] => {
    if (!config) return [];

    const fields: any[] = [];

    // LLM Configuration (model is now managed by LLMProviderManager)
    if (config.llm) {
      fields.push(
        { key: 'llm.temperature', label: 'Temperature', type: 'number', value: config.llm.temperature || 0.7, description: 'Model creativity (0-1)' },
        { key: 'llm.max_tokens', label: 'Max Tokens', type: 'number', value: config.llm.max_tokens || 4000, description: 'Maximum output tokens' },
        { key: 'llm.timeout_seconds', label: 'Timeout (seconds)', type: 'number', value: config.llm.timeout_seconds || 120, description: 'Request timeout' }
      );
    }

    // Channel Configuration with dropdowns
    if (config.channel) {
      fields.push(
        { 
          key: 'channel.id', 
          label: 'Channel ID', 
          type: 'select', 
          value: config.channel.id || 'life-consumer', 
          options: ['life-consumer', 'tech-news', 'business', 'entertainment', 'sports', 'science'],
          description: 'Channel identifier' 
        },
        { 
          key: 'channel.name', 
          label: 'Channel Name', 
          type: 'string', 
          value: config.channel.name || '生活与消费资讯', 
          description: 'Channel display name' 
        },
        { 
          key: 'channel.language', 
          label: 'Language', 
          type: 'select', 
          value: config.channel.language || 'zh-CN', 
          options: ['zh-CN', 'zh-TW', 'en-US', 'en-GB', 'ja-JP', 'ko-KR'],
          description: 'Content language' 
        }
      );
    }

    return fields;
  };

  const handleSave = async (updates: Record<string, any>): Promise<void> => {
    try {
      const response = await fetch('http://localhost:8000/global/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        await loadConfig();
      } else {
        throw new Error('Failed to save config');
      }
    } catch (error) {
      console.error('Failed to save global config:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Global Configuration</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure global settings shared across all stages
        </p>
      </div>
      
      {/* LLM Provider Management */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <LLMProviderManager onProviderChange={loadConfig} />
      </div>

      {/* Other Global Settings */}
      <ConfigEditor fields={fields} onSave={handleSave} stageName="global" />
    </div>
  );
}
