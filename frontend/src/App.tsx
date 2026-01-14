import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { StagePanel } from './components/StagePanel';
import { STAGES } from './types/stage';
import type { StageData } from './types/stage';
import { runStage, getStageInput, getState } from './api/stageApi';

// 获取今天日期
const getToday = () => new Date().toISOString().split('T')[0];

function App() {
  const [selectedStage, setSelectedStage] = useState('fetch');
  const [episodeDate] = useState(getToday());
  const [stageStatus, setStageStatus] = useState<Record<string, 'pending' | 'running' | 'success' | 'failed'>>({});
  const [stageDataMap, setStageDataMap] = useState<Record<string, StageData>>(() => {
    const initial: Record<string, StageData> = {};
    STAGES.forEach(stage => {
      initial[stage.id] = {
        input: { loading: true },
        output: null,
        result: null,
      };
    });
    return initial;
  });
  const [runningStage, setRunningStage] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);

  // 检查 API 连接并加载状态
  useEffect(() => {
    const checkApi = async () => {
      try {
        const state = await getState();
        setApiConnected(true);
        
        // 恢复之前的运行状态
        if (state.stage_outputs) {
          const newDataMap: Record<string, StageData> = {};
          STAGES.forEach(stage => {
            newDataMap[stage.id] = {
              input: {},
              output: state.stage_outputs[stage.id] || null,
              result: state.stage_results[stage.id] ? {
                status: state.stage_results[stage.id].status as 'success' | 'failed' | 'pending',
                output: state.stage_outputs[stage.id] || null,
                error: state.stage_results[stage.id].error,
                metadata: {
                  stage_name: stage.id,
                  stage_version: '1.0.0',
                  started_at: null,
                  completed_at: null,
                  duration_seconds: state.stage_results[stage.id].duration_seconds,
                },
              } : null,
            };
            
            if (state.stage_results[stage.id]) {
              setStageStatus(prev => ({
                ...prev,
                [stage.id]: state.stage_results[stage.id].status as 'success' | 'failed',
              }));
            }
          });
          setStageDataMap(newDataMap);
        }
      } catch {
        setApiConnected(false);
      }
    };
    
    checkApi();
  }, []);

  // 加载当前 Stage 的预期输入
  useEffect(() => {
    const loadInput = async () => {
      if (!apiConnected) return;
      
      try {
        const inputResp = await getStageInput(selectedStage, episodeDate);
        setStageDataMap(prev => ({
          ...prev,
          [selectedStage]: {
            ...prev[selectedStage],
            input: inputResp.input,
          },
        }));
      } catch (err) {
        console.error('Failed to load input:', err);
      }
    };
    
    loadInput();
  }, [selectedStage, apiConnected, episodeDate]);

  // 运行 Stage（真实后端调用）
  const handleRunStage = useCallback(async (stageId: string) => {
    setRunningStage(stageId);
    setStageStatus(prev => ({ ...prev, [stageId]: 'running' }));

    try {
      const response = await runStage({
        stage_id: stageId,
        episode_date: episodeDate,
        use_previous_output: true,
      });

      setStageDataMap(prev => ({
        ...prev,
        [stageId]: {
          ...prev[stageId],
          output: response.output,
          result: {
            status: response.status as 'success' | 'failed' | 'pending',
            output: response.output,
            error: response.error,
            metadata: {
              stage_name: stageId,
              stage_version: '1.0.0',
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              duration_seconds: response.duration_seconds,
            },
          },
        },
      }));

      setStageStatus(prev => ({ 
        ...prev, 
        [stageId]: response.status === 'success' ? 'success' : 'failed' 
      }));
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setStageDataMap(prev => ({
        ...prev,
        [stageId]: {
          ...prev[stageId],
          result: {
            status: 'failed',
            output: null,
            error: errorMsg,
            metadata: {
              stage_name: stageId,
              stage_version: '1.0.0',
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              duration_seconds: null,
            },
          },
        },
      }));
      setStageStatus(prev => ({ ...prev, [stageId]: 'failed' }));
    }
    
    setRunningStage(null);
  }, [episodeDate]);

  // API 未连接时显示提示
  if (apiConnected === false) {
    return (
      <div className="flex h-screen bg-dark-900 items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-lg font-semibold mb-2">API 未连接</div>
          <div className="text-dark-400 text-sm mb-4">请启动后端服务:</div>
          <code className="bg-dark-800 text-dark-200 px-4 py-2 rounded-lg font-mono text-sm">
            python -m src.stages.api
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-dark-900">
      <Sidebar
        selectedStage={selectedStage}
        onSelectStage={setSelectedStage}
        stageStatus={stageStatus}
      />
      <StagePanel
        stageId={selectedStage}
        stageData={stageDataMap[selectedStage]}
        onRun={handleRunStage}
        isRunning={runningStage === selectedStage}
      />
    </div>
  );
}

export default App;
