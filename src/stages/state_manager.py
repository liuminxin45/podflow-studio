"""
State Manager for Pipeline Persistence

Handles saving and loading of stage configurations, inputs, and outputs
"""

import json
from pathlib import Path
from typing import Any, Dict, Optional
from datetime import datetime


class StateManager:
    """Manages persistent state for pipeline stages"""
    
    def __init__(self, state_dir: str = "state"):
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = self.state_dir / "pipeline_state.json"
    
    def load_state(self) -> Dict[str, Any]:
        """Load the entire pipeline state from disk"""
        if not self.state_file.exists():
            return self._get_default_state()
        
        try:
            with open(self.state_file, 'r', encoding='utf-8') as f:
                state = json.load(f)
            return state
        except Exception as e:
            print(f"Failed to load state: {e}")
            return self._get_default_state()
    
    def save_state(self, state: Dict[str, Any]) -> None:
        """Save the entire pipeline state to disk"""
        try:
            state["last_updated"] = datetime.now().isoformat()
            with open(self.state_file, 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Failed to save state: {e}")
    
    def get_stage_config(self, stage_id: str) -> Dict[str, Any]:
        """Get configuration for a specific stage"""
        state = self.load_state()
        return state.get("stage_configs", {}).get(stage_id, {})
    
    def save_stage_config(self, stage_id: str, config: Dict[str, Any]) -> None:
        """Save configuration for a specific stage"""
        state = self.load_state()
        if "stage_configs" not in state:
            state["stage_configs"] = {}
        state["stage_configs"][stage_id] = config
        self.save_state(state)
    
    def get_stage_output(self, stage_id: str) -> Optional[Dict[str, Any]]:
        """Get output for a specific stage"""
        state = self.load_state()
        return state.get("stage_outputs", {}).get(stage_id)
    
    def save_stage_output(self, stage_id: str, output: Dict[str, Any]) -> None:
        """Save output for a specific stage"""
        state = self.load_state()
        if "stage_outputs" not in state:
            state["stage_outputs"] = {}
        state["stage_outputs"][stage_id] = output
        self.save_state(state)
    
    def get_stage_result(self, stage_id: str) -> Optional[Dict[str, Any]]:
        """Get result metadata for a specific stage"""
        state = self.load_state()
        return state.get("stage_results", {}).get(stage_id)
    
    def save_stage_result(self, stage_id: str, result: Dict[str, Any]) -> None:
        """Save result metadata for a specific stage"""
        state = self.load_state()
        if "stage_results" not in state:
            state["stage_results"] = {}
        state["stage_results"][stage_id] = result
        self.save_state(state)
    
    def reset_stage(self, stage_id: str) -> None:
        """Reset a specific stage (clear config, output, result)"""
        state = self.load_state()
        
        if "stage_configs" in state and stage_id in state["stage_configs"]:
            del state["stage_configs"][stage_id]
        
        if "stage_outputs" in state and stage_id in state["stage_outputs"]:
            del state["stage_outputs"][stage_id]
        
        if "stage_results" in state and stage_id in state["stage_results"]:
            del state["stage_results"][stage_id]
        
        self.save_state(state)
    
    def reset_all(self) -> None:
        """Reset entire pipeline state"""
        state = self._get_default_state()
        self.save_state(state)
    
    def get_run_metadata(self) -> Dict[str, Any]:
        """Get current run metadata"""
        state = self.load_state()
        return {
            "run_id": state.get("run_id"),
            "episode_date": state.get("episode_date"),
            "run_dir": state.get("run_dir"),
        }
    
    def save_run_metadata(self, run_id: str, episode_date: str, run_dir: str) -> None:
        """Save run metadata"""
        state = self.load_state()
        state["run_id"] = run_id
        state["episode_date"] = episode_date
        state["run_dir"] = run_dir
        self.save_state(state)
    
    def _get_default_state(self) -> Dict[str, Any]:
        """Get default empty state"""
        return {
            "run_id": None,
            "episode_date": None,
            "run_dir": None,
            "stage_configs": {},
            "stage_outputs": {},
            "stage_results": {},
            "last_updated": None,
        }
