import { useState, useEffect } from 'react';
import { ConfigEditor } from './ConfigEditor';

interface StageConfigProps {
  stageId: string;
  stageName: string;
}

export function StageConfig({ stageId, stageName }: StageConfigProps) {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, [stageId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/stage/${stageId}/config`);
      if (response.ok) {
        const data = await response.json();
        const configFields = convertConfigToFields(data.config, stageId);
        setFields(configFields);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const convertConfigToFields = (config: any, stageId: string): any[] => {
    if (!config) return [];

    switch (stageId) {
      case 'cluster':
        return [
          { key: 'method', label: 'Clustering Method', type: 'select', value: config.method || 'kmeans', options: ['kmeans', 'dbscan', 'hierarchical'], description: 'Algorithm for clustering articles' },
          { key: 'n_clusters', label: 'Number of Clusters', type: 'number', value: config.n_clusters || 5, description: 'Target number of clusters' },
          { key: 'min_cluster_size', label: 'Min Cluster Size', type: 'number', value: config.min_cluster_size || 2, description: 'Minimum articles per cluster' },
          { key: 'use_embeddings', label: 'Use Embeddings', type: 'boolean', value: config.use_embeddings !== false, description: 'Use semantic embeddings for clustering' },
        ];

      case 'selection':
        return [
          { key: 'max_items', label: 'Max Items', type: 'number', value: config.max_items || 10, description: 'Maximum items to select' },
          { key: 'min_items', label: 'Min Items', type: 'number', value: config.min_items || 5, description: 'Minimum items to select' },
          { key: 'diversity_weight', label: 'Diversity Weight', type: 'number', value: config.diversity_weight || 0.5, description: 'Weight for topic diversity (0-1)' },
          { key: 'recency_weight', label: 'Recency Weight', type: 'number', value: config.recency_weight || 0.3, description: 'Weight for recent articles (0-1)' },
          { key: 'quality_threshold', label: 'Quality Threshold', type: 'number', value: config.quality_threshold || 0.6, description: 'Minimum quality score (0-1)' },
        ];

      case 'research':
        return [
          { key: 'enabled', label: 'Research Enabled', type: 'boolean', value: config.enabled !== false, description: 'Enable background research' },
          { key: 'provider', label: 'Research Provider', type: 'select', value: config.provider || 'anspire', options: ['metaso', 'anspire', 'bocha-web', 'bocha-ai'], description: 'Research API provider' },
          { key: 'max_items', label: 'Max Items', type: 'number', value: config.max_items || 10, description: 'Maximum items to research' },
          { key: 'max_sources', label: 'Max Sources', type: 'number', value: config.max_sources || 3, description: 'Maximum research sources per topic' },
          { key: 'timeout_seconds', label: 'Timeout (seconds)', type: 'number', value: config.timeout_seconds || 60, description: 'Research timeout per request' },
          { key: 'max_retries', label: 'Max Retries', type: 'number', value: config.max_retries || 3, description: 'Maximum retry attempts' },
        ];

      case 'script':
        return [
          { key: 'llm.model', label: 'LLM Model', type: 'string', value: config.llm?.model || 'gpt-4', description: 'Language model for script generation' },
          { key: 'llm.temperature', label: 'Temperature', type: 'number', value: config.llm?.temperature || 0.7, description: 'Model creativity (0-1)' },
          { key: 'llm.max_tokens', label: 'Max Tokens', type: 'number', value: config.llm?.max_tokens || 2000, description: 'Maximum output tokens' },
          { key: 'channel.style', label: 'Channel Style', type: 'select', value: config.channel?.style || 'professional', options: ['professional', 'casual', 'humorous', 'educational'], description: 'Podcast tone and style' },
          { key: 'channel.duration_minutes', label: 'Duration (minutes)', type: 'number', value: config.channel?.duration_minutes || 10, description: 'Target podcast duration' },
        ];

      case 'audio':
        return [
          { key: 'provider', label: 'TTS Provider', type: 'select', value: config.provider || 'openai', options: ['openai', 'elevenlabs', 'azure', 'google'], description: 'Text-to-speech provider' },
          { key: 'voice', label: 'Voice', type: 'string', value: config.voice || 'alloy', description: 'Voice ID or name' },
          { key: 'speed', label: 'Speed', type: 'number', value: config.speed || 1.0, description: 'Speech speed multiplier' },
          { key: 'format', label: 'Audio Format', type: 'select', value: config.format || 'mp3', options: ['mp3', 'wav', 'opus'], description: 'Output audio format' },
          { key: 'bitrate', label: 'Bitrate', type: 'string', value: config.bitrate || '128k', description: 'Audio bitrate (e.g., 128k, 256k)' },
        ];

      case 'publish':
        return [
          { key: 'enabled', label: 'Auto Publish', type: 'boolean', value: config.enabled !== false, description: 'Automatically publish after generation' },
          { key: 'platforms', label: 'Platforms', type: 'string', value: config.platforms?.join(', ') || 'rss, spotify', description: 'Comma-separated platforms' },
          { key: 'visibility', label: 'Visibility', type: 'select', value: config.visibility || 'public', options: ['public', 'unlisted', 'private'], description: 'Content visibility' },
          { key: 'schedule_delay_hours', label: 'Schedule Delay (hours)', type: 'number', value: config.schedule_delay_hours || 0, description: 'Delay before publishing' },
        ];

      default:
        // Generic key-value editor for unknown stages
        return Object.entries(config).map(([key, value]) => ({
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string',
          value,
        }));
    }
  };

  const handleSave = async (config: Record<string, any>) => {
    try {
      // Handle nested keys (e.g., "llm.model")
      const nestedConfig: any = {};
      Object.entries(config).forEach(([key, value]) => {
        if (key.includes('.')) {
          const parts = key.split('.');
          if (!nestedConfig[parts[0]]) nestedConfig[parts[0]] = {};
          nestedConfig[parts[0]][parts[1]] = value;
        } else {
          nestedConfig[key] = value;
        }
      });

      const response = await fetch(`http://localhost:8000/stage/${stageId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nestedConfig),
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-center gap-2 text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading configuration...</span>
        </div>
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <p className="text-sm text-slate-500 text-center">No configuration available</p>
      </div>
    );
  }

  return <ConfigEditor stageName={stageName} fields={fields} onSave={handleSave} />;
}
