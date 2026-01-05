# Audio Generation Workflow Design

## 概述

本文档描述音频生成工作流的设计，支持两种模式：
1. **分段模式（Segmented）**：5段脚本 → 5个MP3 → 合并
2. **统一模式（Unified）**：5段脚本 → 合并脚本 → 1个MP3

## 设计原则

### 1. 抽象性
- 定义统一的工作流接口 `AudioWorkflow`
- 不同模式实现相同接口，对外透明
- 配置驱动，运行时动态选择

### 2. 隔离性
- 每种模式独立实现，互不干扰
- 共享代码通过基类和工具类复用
- 配置与实现分离

### 3. 可扩展性
- 易于添加新的工作流模式
- 支持工作流级别的自定义参数
- 预留插件机制

## 架构设计

### 核心组件

```
┌─────────────────────────────────────────────────┐
│           AudioStep (Pipeline Step)             │
│  - 读取配置决定使用哪种工作流                      │
│  - 调用 WorkflowFactory 创建工作流实例             │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│          WorkflowFactory (工厂类)                │
│  - create_workflow(mode, config) → AudioWorkflow │
└─────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌──────────────────┐          ┌──────────────────┐
│ SegmentedWorkflow│          │  UnifiedWorkflow │
│  (分段模式)       │          │   (统一模式)      │
└──────────────────┘          └──────────────────┘
        │                               │
        └───────────────┬───────────────┘
                        ▼
            ┌────────────────────┐
            │  AudioWorkflow     │
            │  (抽象基类)         │
            │  - execute()       │
            │  - validate()      │
            └────────────────────┘
```

### 接口定义

```python
class AudioWorkflow(ABC):
    """音频生成工作流抽象基类"""
    
    @abstractmethod
    def execute(self, ctx: EpisodeContext) -> AudioManifest:
        """
        执行音频生成工作流
        
        Args:
            ctx: Episode上下文，包含脚本段落、配置等
            
        Returns:
            AudioManifest: 音频清单，包含生成的音频路径和元数据
        """
        pass
    
    @abstractmethod
    def validate(self, ctx: EpisodeContext) -> bool:
        """
        验证工作流前置条件
        
        Args:
            ctx: Episode上下文
            
        Returns:
            bool: 是否满足执行条件
        """
        pass
```

## 工作流模式详解

### 模式1: Segmented（分段模式）- 当前实现

**流程：**
```
S0脚本 ──TTS──> S0.mp3 ┐
S1脚本 ──TTS──> S1.mp3 │
S2脚本 ──TTS──> S2.mp3 ├──> 音频合并 ──> final.mp3
S3脚本 ──TTS──> S3.mp3 │    (插入BGM)
S4脚本 ──TTS──> S4.mp3 ┘
```

**特点：**
- ✅ 每段独立生成，支持缓存
- ✅ 失败后可单独重试某段
- ✅ 支持段落级别的音频调整
- ❌ 需要多次TTS调用
- ❌ 合并时可能有接缝感

**适用场景：**
- 需要段落级别缓存
- 需要独立调整某段音频
- 开发调试阶段

### 模式2: Unified（统一模式）- 新增

**流程：**
```
S0脚本 ┐
S1脚本 │
S2脚本 ├──> 脚本合并 ──> 完整脚本 ──TTS──> final.mp3
S3脚本 │    (添加过渡)
S4脚本 ┘
```

**特点：**
- ✅ 只需一次TTS调用，速度快
- ✅ 音频连贯性好，无接缝
- ✅ 可利用TTS的上下文理解
- ❌ 无法单独重试某段
- ❌ 无段落级别缓存

**适用场景：**
- 生产环境，追求速度
- 需要更自然的语音连贯性
- 脚本稳定，不需要频繁调整

## 配置方案

### settings.yaml 配置

```yaml
# 音频生成配置
audio:
  # 工作流模式：segmented | unified
  workflow: segmented
  
  # 分段模式配置
  segmented:
    enable_cache: true          # 是否启用段落缓存
    fail_on_critical: true      # 关键段落(S0,S1)失败时是否停止
    critical_segments: [S0, S1] # 关键段落列表
  
  # 统一模式配置
  unified:
    enable_cache: true          # 是否启用完整脚本缓存
    transition_text: "\n\n"     # 段落间过渡文本
    add_pauses: true            # 是否在段落间添加停顿标记
    pause_duration_ms: 800      # 停顿时长（毫秒）
    merge_strategy: simple      # 合并策略：simple | smart
  
  # 通用配置
  assets_dir: ./assets
  output_format: mp3
  sample_rate: 24000
```

### 配置说明

#### workflow
- `segmented`: 分段模式（默认，保持向后兼容）
- `unified`: 统一模式（新增）

#### segmented 配置
- `enable_cache`: 启用段落级别缓存，避免重复生成
- `fail_on_critical`: 关键段落失败时是否中止整个流程
- `critical_segments`: 定义哪些段落是关键段落

#### unified 配置
- `enable_cache`: 启用完整脚本缓存
- `transition_text`: 段落间的过渡文本（如换行、分隔符）
- `add_pauses`: 是否添加SSML停顿标记
- `pause_duration_ms`: 停顿时长
- `merge_strategy`: 
  - `simple`: 简单拼接，用transition_text连接
  - `smart`: 智能合并，根据段落类型添加不同过渡

## 实现细节

### 文件结构

```
src/app/pipelines/steps/
├── audio_step.py                    # 主入口，选择工作流
└── audio_workflows/
    ├── __init__.py
    ├── base.py                      # AudioWorkflow基类
    ├── factory.py                   # WorkflowFactory
    ├── segmented_workflow.py        # 分段模式实现
    ├── unified_workflow.py          # 统一模式实现
    └── script_merger.py             # 脚本合并工具
```

### 核心类实现

#### 1. WorkflowFactory

```python
class WorkflowFactory:
    """音频工作流工厂"""
    
    @staticmethod
    def create_workflow(mode: str, config: dict, logger) -> AudioWorkflow:
        """
        创建工作流实例
        
        Args:
            mode: 工作流模式 (segmented | unified)
            config: 配置字典
            logger: 日志记录器
            
        Returns:
            AudioWorkflow: 工作流实例
        """
        if mode == "segmented":
            return SegmentedWorkflow(config, logger)
        elif mode == "unified":
            return UnifiedWorkflow(config, logger)
        else:
            raise ValueError(f"Unknown workflow mode: {mode}")
```

#### 2. SegmentedWorkflow

```python
class SegmentedWorkflow(AudioWorkflow):
    """分段音频生成工作流（当前实现的封装）"""
    
    def execute(self, ctx: EpisodeContext) -> AudioManifest:
        # 1. 为每个段落生成TTS
        segment_audios = []
        for segment_script in ctx.script_segments:
            audio = self._generate_segment_tts(ctx, segment_script)
            segment_audios.append(audio)
        
        # 2. 准备BGM
        bgm_inserts = self._prepare_bgm(ctx)
        
        # 3. 合并音频
        final_path = self._merge_segments(ctx, segment_audios, bgm_inserts)
        
        # 4. 创建manifest
        return self._create_manifest(ctx, segment_audios, bgm_inserts, final_path)
```

#### 3. UnifiedWorkflow

```python
class UnifiedWorkflow(AudioWorkflow):
    """统一音频生成工作流（新增）"""
    
    def execute(self, ctx: EpisodeContext) -> AudioManifest:
        # 1. 合并所有段落脚本
        merged_script = self._merge_scripts(ctx.script_segments)
        
        # 2. 检查缓存
        cache_key = self._compute_cache_key(merged_script)
        if cached_audio := self._check_cache(cache_key):
            return cached_audio
        
        # 3. 一次性生成完整音频
        final_path = self._generate_unified_tts(ctx, merged_script)
        
        # 4. 创建manifest（简化版，无段落信息）
        return self._create_manifest(ctx, final_path)
    
    def _merge_scripts(self, segments: List[SegmentScript]) -> str:
        """合并脚本段落"""
        merger = ScriptMerger(self.config.get("unified", {}))
        return merger.merge(segments)
```

#### 4. ScriptMerger

```python
class ScriptMerger:
    """脚本合并工具"""
    
    def merge(self, segments: List[SegmentScript]) -> str:
        """
        合并多个脚本段落
        
        Args:
            segments: 脚本段落列表
            
        Returns:
            str: 合并后的完整脚本
        """
        if self.strategy == "simple":
            return self._simple_merge(segments)
        elif self.strategy == "smart":
            return self._smart_merge(segments)
    
    def _simple_merge(self, segments: List[SegmentScript]) -> str:
        """简单合并：用过渡文本连接"""
        parts = []
        for segment in segments:
            parts.append(segment.text)
            if self.add_pauses:
                parts.append(self._create_pause_mark())
        return self.transition_text.join(parts)
    
    def _smart_merge(self, segments: List[SegmentScript]) -> str:
        """智能合并：根据段落类型添加不同过渡"""
        parts = []
        for i, segment in enumerate(segments):
            parts.append(segment.text)
            
            # 根据段落类型决定过渡方式
            if i < len(segments) - 1:
                next_segment = segments[i + 1]
                transition = self._get_transition(segment, next_segment)
                parts.append(transition)
        
        return "".join(parts)
    
    def _create_pause_mark(self) -> str:
        """创建停顿标记（SSML或纯文本）"""
        if self.use_ssml:
            return f'<break time="{self.pause_duration_ms}ms"/>'
        else:
            return self.transition_text
```

### 主入口修改

```python
class AudioStep(BaseStep):
    """音频生成步骤（支持多种工作流）"""
    
    def execute(self, ctx: EpisodeContext) -> None:
        # 1. 读取配置
        audio_cfg = ctx.config.get("audio", {})
        workflow_mode = audio_cfg.get("workflow", "segmented")
        
        # 2. 创建工作流
        workflow = WorkflowFactory.create_workflow(
            mode=workflow_mode,
            config=audio_cfg,
            logger=self.logger
        )
        
        # 3. 验证前置条件
        if not workflow.validate(ctx):
            self.logger.error(f"Workflow {workflow_mode} validation failed")
            return
        
        # 4. 执行工作流
        self.logger.info(f"Using {workflow_mode} audio workflow")
        manifest = workflow.execute(ctx)
        
        # 5. 保存结果
        ctx.audio_manifest = manifest
        ctx.audio_paths = {
            "final": manifest.final_path,
            "manifest": str(manifest.manifest_path),
        }
```

## 迁移方案

### 向后兼容

1. **默认行为不变**：`workflow: segmented` 为默认值
2. **现有代码重构**：将 `AudioStepSegmented` 的逻辑迁移到 `SegmentedWorkflow`
3. **配置兼容**：保留所有现有配置项

### 迁移步骤

1. 创建新的工作流架构（不影响现有代码）
2. 将现有逻辑封装到 `SegmentedWorkflow`
3. 实现 `UnifiedWorkflow`
4. 更新 `AudioStep` 使用工厂模式
5. 添加配置项到 `settings.yaml`
6. 测试两种模式切换

## 测试方案

### 单元测试

```python
def test_workflow_factory():
    """测试工作流工厂"""
    workflow = WorkflowFactory.create_workflow("segmented", {}, logger)
    assert isinstance(workflow, SegmentedWorkflow)
    
    workflow = WorkflowFactory.create_workflow("unified", {}, logger)
    assert isinstance(workflow, UnifiedWorkflow)

def test_script_merger_simple():
    """测试简单脚本合并"""
    segments = [
        SegmentScript(id="S0", text="开场白"),
        SegmentScript(id="S1", text="历史事件"),
    ]
    merger = ScriptMerger({"merge_strategy": "simple"})
    result = merger.merge(segments)
    assert "开场白" in result
    assert "历史事件" in result

def test_unified_workflow_cache():
    """测试统一模式缓存"""
    workflow = UnifiedWorkflow({"unified": {"enable_cache": True}}, logger)
    # 第一次生成
    manifest1 = workflow.execute(ctx)
    # 第二次应该使用缓存
    manifest2 = workflow.execute(ctx)
    assert manifest1.final_path == manifest2.final_path
```

### 集成测试

```python
def test_workflow_switching():
    """测试工作流切换"""
    # 使用分段模式
    ctx.config["audio"]["workflow"] = "segmented"
    step = AudioStep()
    step.execute(ctx)
    assert ctx.audio_manifest.segments  # 有段落信息
    
    # 切换到统一模式
    ctx.config["audio"]["workflow"] = "unified"
    step.execute(ctx)
    assert not ctx.audio_manifest.segments  # 无段落信息
```

## 性能对比

| 指标 | Segmented模式 | Unified模式 | 说明 |
|------|--------------|------------|------|
| TTS调用次数 | 5次 | 1次 | Unified显著减少 |
| 总耗时 | ~30-50秒 | ~10-20秒 | Unified更快 |
| 缓存粒度 | 段落级 | 整体级 | Segmented更灵活 |
| 音频连贯性 | 中等 | 优秀 | Unified无接缝 |
| 失败重试 | 段落级 | 整体级 | Segmented更可控 |

## 未来扩展

### 可能的新模式

1. **Hybrid模式**：关键段落独立生成，其他段落合并
2. **Streaming模式**：流式生成，边生成边播放
3. **Multi-voice模式**：不同段落使用不同音色

### 插件机制

```python
class AudioWorkflowPlugin(ABC):
    """工作流插件接口"""
    
    @abstractmethod
    def pre_execute(self, ctx: EpisodeContext) -> None:
        """执行前钩子"""
        pass
    
    @abstractmethod
    def post_execute(self, manifest: AudioManifest) -> AudioManifest:
        """执行后钩子"""
        pass
```

## 总结

本设计方案提供了：

1. ✅ **高抽象性**：统一的 `AudioWorkflow` 接口
2. ✅ **强隔离性**：模式间独立实现，互不干扰
3. ✅ **易扩展性**：工厂模式 + 插件机制
4. ✅ **配置驱动**：`settings.yaml` 一键切换
5. ✅ **向后兼容**：不破坏现有功能
6. ✅ **性能优化**：Unified模式显著提升速度

通过这个设计，用户可以根据场景灵活选择最合适的音频生成策略。
