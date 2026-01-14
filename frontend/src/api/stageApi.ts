const API_BASE = 'http://localhost:8000';

export interface RunStageRequest {
  stage_id: string;
  episode_date: string;
  input_override?: Record<string, unknown>;
  use_previous_output?: boolean;
}

export interface StageResponse {
  status: string;
  stage_id: string;
  output: Record<string, unknown> | null;
  error: string | null;
  duration_seconds: number | null;
}

export interface PipelineState {
  run_id: string | null;
  episode_date: string | null;
  run_dir: string | null;
  stage_outputs: Record<string, Record<string, unknown>>;
  stage_results: Record<string, { status: string; error: string | null; duration_seconds: number | null }>;
}

export interface StageInputResponse {
  stage_id: string;
  input: Record<string, unknown>;
}

export async function runStage(request: RunStageRequest): Promise<StageResponse> {
  const response = await fetch(`${API_BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

export async function getState(): Promise<PipelineState> {
  const response = await fetch(`${API_BASE}/state`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function resetState(): Promise<void> {
  const response = await fetch(`${API_BASE}/reset`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
}

export async function getStageInput(stageId: string, episodeDate: string): Promise<StageInputResponse> {
  const response = await fetch(`${API_BASE}/stage/${stageId}/input?episode_date=${episodeDate}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function getStageOutput(stageId: string): Promise<{ stage_id: string; output: Record<string, unknown> | null; result: Record<string, unknown> | null }> {
  const response = await fetch(`${API_BASE}/stage/${stageId}/output`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}
