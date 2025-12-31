# 人工反馈驱动的自动选题优化系统 - 设计文档

**版本**: v1.0  
**日期**: 2025-12-31  
**状态**: 设计阶段

---

## 1. 系统概述

### 1.1 背景与目标

**问题**：
- 自动选题系统会过滤掉一些人工认为应该保留的内容
- LLM 的判断标准与人类编辑的偏好存在差异
- 缺乏反馈机制来持续优化选题策略

**目标**：
- 建立人工反馈收集机制
- 通过反馈数据优化选题策略
- 让 LLM 学习人类编辑的偏好
- 实现"越用越准"的自适应选题系统

### 1.2 核心理念

```
人工反馈 → 数据积累 → 策略优化 → 提示工程 → 更好的选题
    ↑                                              ↓
    └──────────────── 持续迭代 ──────────────────┘
```

---

## 2. 系统架构

### 2.1 整体架构（集成到 Pipeline）

```
┌─────────────────────────────────────────────────────────┐
│                   自动选题 Pipeline                      │
│  Fetch → Cluster → Selection → TopicScoring → TopicGate │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │   选题结果 Report      │
         │   (JSON)               │
         └───────┬───────────────┘
                 │
                 ▼
         ┌───────────────────────┐
         │  【人工反馈检查点】     │
         │  检查配置开关          │
         └───────┬───────────────┘
                 │
        ┌────────┴────────┐
        │                 │
    enabled          disabled
        │                 │
        ▼                 ▼
  ┌─────────────┐   ┌──────────────┐
  │ CLI 反馈界面 │   │ 跳过，继续   │
  │ (交互式审核) │   │ 后续流程     │
  └─────┬───────┘   └──────────────┘
        │
        ▼
  ┌─────────────┐
  │ 反馈数据存储 │
  └─────┬───────┘
        │
        ▼
  ┌─────────────┐
  │ 继续后续流程 │
  │ (Research→   │
  │  Script→...) │
  └─────────────┘
                 │
                 ▼
         ┌───────────────────────┐
         │  反馈数据存储          │
         │  feedback_history/    │
         └───────┬───────────────┘
                 │
                 ▼
         ┌───────────────────────┐
         │  策略优化引擎          │
         │  - 规则调整            │
         │  - 提示优化            │
         │  - 阈值自适应          │
         └───────┬───────────────┘
                 │
                 ▼
         ┌───────────────────────┐
         │  下次选题应用优化策略   │
         └───────────────────────┘
```

### 2.2 模块划分

#### **Module 1: 反馈收集器 (Feedback Collector)**
- CLI 交互界面
- Pipeline 集成接口（SelectionStep 调用）
- 配置开关支持（`human_feedback.enabled`）
- Web 审核界面（可选，Phase 4）

#### **Module 2: 反馈存储 (Feedback Storage)**
- 反馈历史数据库（JSON 文件）
- 版本化管理
- 查询与统计接口

#### **Module 3: 策略优化器 (Strategy Optimizer)**
- 规则调整算法
- 提示工程优化
- 阈值自适应

#### **Module 4: LLM 学习器 (LLM Learner)**
- Few-shot 示例生成
- 提示模板优化
- 偏好建模

### 2.3 配置开关

在 `config/settings.yaml` 中新增配置：

```yaml
human_feedback:
  enabled: true              # 是否启用人工反馈（默认：true）
  storage_dir: "feedback_history"  # 反馈数据存储目录
  auto_continue: true        # 反馈完成后自动继续后续流程（默认：true）
  timeout_seconds: 300       # 等待人工反馈的超时时间（秒）
  min_feedback_threshold: 1  # 最少需要反馈的主题数（设为 0 表示可跳过）
```

**行为说明**：
- `enabled=true`：SelectionStep 完成后，自动暂停并启动 CLI 反馈界面
- `enabled=false`：SelectionStep 完成后，直接继续后续流程，无人工介入
- `auto_continue=true`：反馈完成后自动返回 Pipeline 继续执行
- `auto_continue=false`：反馈完成后终止，需手动重启后续流程

---

## 3. 核心设计

### 3.1 反馈数据模型

```python
from pydantic import BaseModel, Field
from typing import Literal, Optional, List
from datetime import datetime

class TopicFeedback(BaseModel):
    """单个主题的人工反馈"""
    
    # 基础信息
    feedback_id: str = Field(..., description="反馈ID")
    topic_id: str = Field(..., description="主题ID")
    timestamp: datetime = Field(..., description="反馈时间")
    episode_date: str = Field(..., description="期数日期")
    
    # 主题信息快照
    topic_snapshot: dict = Field(..., description="主题完整信息")
    
    # 系统决策
    system_decision: Literal["must", "maybe", "discard"] = Field(
        ..., description="系统原始决策"
    )
    system_score: float = Field(..., description="系统打分")
    score_breakdown: dict = Field(..., description="打分明细")
    
    # 人工反馈
    human_decision: Literal["accept", "reject", "uncertain"] = Field(
        ..., description="人工决策"
    )
    human_priority: Optional[int] = Field(
        None, ge=1, le=5, description="人工优先级评分"
    )
    
    # 反馈详情
    feedback_reason: str = Field(
        default="", description="反馈原因（为什么不同意系统决策）"
    )
    tags: List[str] = Field(
        default_factory=list, 
        description="标签（如：消费者关心、话题性强、数据过时等）"
    )
    
    # 改进建议
    suggested_archetype: Optional[str] = Field(
        None, description="建议的内容原型（如果系统判断错误）"
    )
    suggested_score_adjustment: Optional[dict] = Field(
        None, description="建议的打分调整"
    )


class FeedbackSession(BaseModel):
    """一次反馈会话"""
    
    session_id: str = Field(..., description="会话ID")
    timestamp: datetime = Field(..., description="会话时间")
    episode_date: str = Field(..., description="期数日期")
    report_path: str = Field(..., description="对应的 report 文件路径")
    
    # 会话统计
    total_reviewed: int = Field(default=0, description="审核总数")
    agree_count: int = Field(default=0, description="同意系统决策")
    disagree_count: int = Field(default=0, description="不同意系统决策")
    
    # 反馈列表
    feedbacks: List[TopicFeedback] = Field(
        default_factory=list, description="反馈列表"
    )
    
    # 元数据
    reviewer: str = Field(default="default", description="审核人")
    notes: str = Field(default="", description="总体备注")
```

### 3.2 反馈收集 CLI 工具

```python
# tools/feedback_cli.py

import click
import json
from pathlib import Path
from datetime import datetime
from rich.console import Console
from rich.table import Table
from rich.prompt import Prompt, Confirm

console = Console()

@click.command()
@click.option('--report', required=True, help='选题报告 JSON 路径')
@click.option('--output-dir', default='feedback_history', help='反馈数据输出目录')
def review_topics(report: str, output_dir: str):
    """交互式审核选题结果"""
    
    # 加载报告
    report_path = Path(report)
    with open(report_path, 'r', encoding='utf-8') as f:
        report_data = json.load(f)
    
    console.print(f"\n[bold green]选题审核工具[/bold green]")
    console.print(f"报告: {report_path}")
    console.print(f"候选主题数: {len(report_data['all_candidates'])}\n")
    
    # 创建反馈会话
    session = FeedbackSession(
        session_id=f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        timestamp=datetime.now(),
        episode_date=report_path.parent.parent.name,  # 从路径提取日期
        report_path=str(report_path),
        reviewer=Prompt.ask("审核人", default="default")
    )
    
    # 遍历候选主题
    for candidate in report_data['all_candidates']:
        _review_single_topic(candidate, session, report_data)
    
    # 保存反馈
    _save_feedback_session(session, output_dir)
    
    # 显示统计
    _show_feedback_summary(session)


def _review_single_topic(
    candidate: dict, 
    session: FeedbackSession,
    report_data: dict
):
    """审核单个主题"""
    
    # 查找对应的打分详情
    scoring_detail = next(
        (s for s in report_data.get('scoring_details', []) 
         if s['topic_id'] == candidate['topic_id']),
        None
    )
    
    # 显示主题信息
    console.print("\n" + "="*80)
    console.print(f"[bold cyan]主题 {session.total_reviewed + 1}[/bold cyan]")
    console.print(f"标题: [yellow]{candidate['title']}[/yellow]")
    console.print(f"实体: {', '.join(candidate.get('entities', []))}")
    console.print(f"新闻数: {candidate.get('items_count', 0)}")
    
    # 显示系统决策
    decision = scoring_detail.get('decision', 'unknown') if scoring_detail else 'unknown'
    score = candidate.get('topic_score', 0)
    
    decision_color = {
        'must': 'green',
        'maybe': 'yellow',
        'discard': 'red'
    }.get(decision, 'white')
    
    console.print(f"系统决策: [{decision_color}]{decision.upper()}[/{decision_color}]")
    console.print(f"系统打分: {score:.2f}/100")
    
    # 显示打分明细
    if scoring_detail:
        _show_score_breakdown(scoring_detail)
    
    # 收集人工反馈
    session.total_reviewed += 1
    
    if not Confirm.ask("\n是否需要给出反馈", default=False):
        session.agree_count += 1
        return
    
    # 收集详细反馈
    feedback = TopicFeedback(
        feedback_id=f"fb_{session.session_id}_{session.total_reviewed}",
        topic_id=candidate['topic_id'],
        timestamp=datetime.now(),
        episode_date=session.episode_date,
        topic_snapshot=candidate,
        system_decision=decision,
        system_score=score,
        score_breakdown=scoring_detail.get('details', {}) if scoring_detail else {},
        human_decision=Prompt.ask(
            "你的决策",
            choices=["accept", "reject", "uncertain"],
            default="accept"
        ),
        human_priority=int(Prompt.ask(
            "优先级（1-5）",
            default="3"
        )),
        feedback_reason=Prompt.ask(
            "反馈原因（为什么不同意系统？）",
            default=""
        ),
        tags=Prompt.ask(
            "标签（逗号分隔）",
            default=""
        ).split(',') if Prompt.ask("标签（逗号分隔）", default="") else []
    )
    
    session.feedbacks.append(feedback)
    
    if feedback.human_decision != decision:
        session.disagree_count += 1
    else:
        session.agree_count += 1


def _show_score_breakdown(scoring_detail: dict):
    """显示打分明细"""
    
    details = scoring_detail.get('details', {})
    
    table = Table(title="打分明细")
    table.add_column("维度", style="cyan")
    table.add_column("得分", justify="right", style="magenta")
    
    for key, value in details.items():
        if isinstance(value, (int, float)):
            table.add_row(key, f"{value:.2f}")
    
    console.print(table)


def _save_feedback_session(session: FeedbackSession, output_dir: str):
    """保存反馈会话"""
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    filename = f"feedback_{session.session_id}.json"
    filepath = output_path / filename
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(session.model_dump(), f, indent=2, ensure_ascii=False, default=str)
    
    console.print(f"\n[green]✓ 反馈已保存: {filepath}[/green]")


def _show_feedback_summary(session: FeedbackSession):
    """显示反馈统计"""
    
    console.print("\n" + "="*80)
    console.print("[bold green]审核完成统计[/bold green]\n")
    console.print(f"总审核数: {session.total_reviewed}")
    console.print(f"同意系统: {session.agree_count} ({session.agree_count/session.total_reviewed*100:.1f}%)")
    console.print(f"不同意: {session.disagree_count} ({session.disagree_count/session.total_reviewed*100:.1f}%)")
    console.print(f"提供详细反馈: {len(session.feedbacks)}")


if __name__ == '__main__':
    review_topics()
```

### 3.3 策略优化算法

#### **3.3.1 阈值自适应**

```python
# src/topic_selection/feedback/optimizer.py

from typing import List, Dict
import numpy as np
from collections import defaultdict

class ThresholdOptimizer:
    """阈值自适应优化器"""
    
    def __init__(self, feedback_history: List[TopicFeedback]):
        self.feedback_history = feedback_history
    
    def optimize_thresholds(self) -> Dict[str, float]:
        """基于反馈历史优化阈值"""
        
        # 分析反馈数据
        false_positives = [  # 系统说"好"，人说"不好"
            fb for fb in self.feedback_history
            if fb.system_decision in ['must', 'maybe'] 
            and fb.human_decision == 'reject'
        ]
        
        false_negatives = [  # 系统说"不好"，人说"好"
            fb for fb in self.feedback_history
            if fb.system_decision == 'discard'
            and fb.human_decision == 'accept'
        ]
        
        # 计算最优阈值
        if false_positives and false_negatives:
            # 基于 ROC 曲线思想找最优分界点
            fp_scores = [fb.system_score for fb in false_positives]
            fn_scores = [fb.system_score for fb in false_negatives]
            
            # 新的 must_threshold 应该高于大部分 FP
            must_threshold = np.percentile(fp_scores, 75) if fp_scores else 70.0
            
            # 新的 discard_threshold 应该低于大部分 FN
            maybe_threshold = np.percentile(fn_scores, 25) if fn_scores else 55.0
            
            return {
                'threshold_must_publish': max(70.0, must_threshold),
                'threshold_maybe_publish': max(55.0, min(maybe_threshold, must_threshold - 5))
            }
        
        return {}  # 数据不足，保持默认


#### **3.3.2 评分权重优化**

class ScoreWeightOptimizer:
    """评分权重优化器"""
    
    def __init__(self, feedback_history: List[TopicFeedback]):
        self.feedback_history = feedback_history
    
    def optimize_weights(self) -> Dict[str, float]:
        """基于反馈优化评分权重"""
        
        # 收集特征和标签
        X = []  # 特征：各维度得分
        y = []  # 标签：人工决策（1=accept, 0=reject）
        
        for fb in self.feedback_history:
            if fb.human_decision == 'uncertain':
                continue
            
            # 提取特征
            details = fb.score_breakdown
            features = [
                details.get('archetype_mean', 0),
                details.get('personal_impact', 0),
                details.get('counter_intuitive', 0),
                details.get('trend', 0),
                details.get('time', 0),
                details.get('persona', 0),
                details.get('history_echo', 0),
                details.get('continuity', 0),
                details.get('data_enrichable', 0),
                details.get('follow_up', 0),
            ]
            
            X.append(features)
            y.append(1 if fb.human_decision == 'accept' else 0)
        
        if len(X) < 10:
            return {}  # 数据不足
        
        # 简单的相关性分析
        X = np.array(X)
        y = np.array(y)
        
        # 计算每个特征与人工决策的相关性
        correlations = []
        for i in range(X.shape[1]):
            corr = np.corrcoef(X[:, i], y)[0, 1]
            correlations.append(abs(corr) if not np.isnan(corr) else 0)
        
        # 归一化为权重（保持总和不变）
        total_corr = sum(correlations)
        if total_corr > 0:
            weights = [c / total_corr * 60 for c in correlations[:3]]  # 内容分
            weights += [c / total_corr * 25 for c in correlations[3:7]]  # 代理信号
            weights += [c / total_corr * 15 for c in correlations[7:]]   # 结构加成
            
            return {
                'archetype_mean_max': weights[0],
                'personal_impact_max': weights[1],
                'counter_intuitive_max': weights[2],
                'trend_max': weights[3],
                'time_max': weights[4],
                'persona_max': weights[5],
                'history_echo_max': weights[6],
                'continuity_max': weights[7],
                'data_enrichable_max': weights[8],
                'follow_up_max': weights[9],
            }
        
        return {}
```

#### **3.3.3 提示工程优化**

```python
class PromptOptimizer:
    """LLM 提示优化器"""
    
    def __init__(self, feedback_history: List[TopicFeedback]):
        self.feedback_history = feedback_history
    
    def generate_few_shot_examples(self, n: int = 5) -> List[dict]:
        """生成 Few-shot 示例"""
        
        # 选择高质量反馈作为示例
        good_examples = [
            fb for fb in self.feedback_history
            if fb.human_decision != 'uncertain'
            and fb.feedback_reason  # 有详细原因
        ]
        
        # 优先选择"系统错误"的案例
        disagreements = [
            fb for fb in good_examples
            if (fb.system_decision == 'discard' and fb.human_decision == 'accept')
            or (fb.system_decision in ['must', 'maybe'] and fb.human_decision == 'reject')
        ]
        
        # 选择代表性样本
        selected = disagreements[:n] if len(disagreements) >= n else good_examples[:n]
        
        examples = []
        for fb in selected:
            examples.append({
                'topic': fb.topic_snapshot,
                'system_decision': fb.system_decision,
                'correct_decision': fb.human_decision,
                'reason': fb.feedback_reason,
                'tags': fb.tags
            })
        
        return examples
    
    def generate_enhanced_prompt(self, base_prompt: str) -> str:
        """生成增强版提示"""
        
        examples = self.generate_few_shot_examples()
        
        if not examples:
            return base_prompt
        
        # 构建 Few-shot 部分
        few_shot_section = "\n\n## 历史案例参考\n\n"
        few_shot_section += "以下是之前审核中的典型案例，供你参考：\n\n"
        
        for i, ex in enumerate(examples, 1):
            few_shot_section += f"### 案例 {i}\n"
            few_shot_section += f"主题：{ex['topic']['title']}\n"
            few_shot_section += f"系统原判断：{ex['system_decision']}\n"
            few_shot_section += f"正确判断：{ex['correct_decision']}\n"
            few_shot_section += f"原因：{ex['reason']}\n"
            if ex['tags']:
                few_shot_section += f"关键点：{', '.join(ex['tags'])}\n"
            few_shot_section += "\n"
        
        # 插入到原提示中
        return base_prompt + few_shot_section
    
    def extract_decision_patterns(self) -> Dict[str, List[str]]:
        """提取决策模式"""
        
        patterns = defaultdict(list)
        
        for fb in self.feedback_history:
            if fb.human_decision == 'accept' and fb.feedback_reason:
                patterns['accept_reasons'].append(fb.feedback_reason)
            elif fb.human_decision == 'reject' and fb.feedback_reason:
                patterns['reject_reasons'].append(fb.feedback_reason)
        
        return dict(patterns)
```

### 3.4 自动应用优化策略

```python
# src/topic_selection/feedback/auto_apply.py

from pathlib import Path
import json
import yaml
from typing import Dict

class FeedbackDrivenConfig:
    """基于反馈的动态配置"""
    
    def __init__(
        self, 
        base_config_path: str,
        feedback_dir: str = 'feedback_history'
    ):
        self.base_config_path = Path(base_config_path)
        self.feedback_dir = Path(feedback_dir)
        self.feedback_history = self._load_feedback_history()
    
    def _load_feedback_history(self) -> List[TopicFeedback]:
        """加载反馈历史"""
        
        feedbacks = []
        for feedback_file in self.feedback_dir.glob('feedback_*.json'):
            with open(feedback_file, 'r', encoding='utf-8') as f:
                session_data = json.load(f)
                session = FeedbackSession(**session_data)
                feedbacks.extend(session.feedbacks)
        
        return feedbacks
    
    def get_optimized_config(self) -> dict:
        """获取优化后的配置"""
        
        # 加载基础配置
        with open(self.base_config_path, 'r', encoding='utf-8') as f:
            base_config = yaml.safe_load(f)
        
        if len(self.feedback_history) < 5:
            # 反馈数据不足，返回原始配置
            return base_config
        
        # 应用优化
        optimized_config = base_config.copy()
        
        # 1. 优化阈值
        threshold_optimizer = ThresholdOptimizer(self.feedback_history)
        new_thresholds = threshold_optimizer.optimize_thresholds()
        if new_thresholds:
            optimized_config['auto_topic']['scoring'].update(new_thresholds)
        
        # 2. 优化权重
        weight_optimizer = ScoreWeightOptimizer(self.feedback_history)
        new_weights = weight_optimizer.optimize_weights()
        if new_weights:
            optimized_config['auto_topic']['scoring'].update(new_weights)
        
        # 3. 生成优化报告
        self._generate_optimization_report(
            base_config,
            optimized_config,
            new_thresholds,
            new_weights
        )
        
        return optimized_config
    
    def _generate_optimization_report(
        self,
        base_config: dict,
        optimized_config: dict,
        threshold_changes: dict,
        weight_changes: dict
    ):
        """生成优化报告"""
        
        report_path = self.feedback_dir / 'optimization_report.md'
        
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write("# 策略优化报告\n\n")
            f.write(f"基于 {len(self.feedback_history)} 条反馈数据\n\n")
            
            if threshold_changes:
                f.write("## 阈值调整\n\n")
                for key, value in threshold_changes.items():
                    old_value = base_config['auto_topic']['scoring'].get(key, 'N/A')
                    f.write(f"- `{key}`: {old_value} → {value:.2f}\n")
                f.write("\n")
            
            if weight_changes:
                f.write("## 权重调整\n\n")
                for key, value in weight_changes.items():
                    old_value = base_config['auto_topic']['scoring'].get(key, 'N/A')
                    f.write(f"- `{key}`: {old_value} → {value:.2f}\n")
```

---

## 4. 实施路线图

### Phase 1: 基础设施（Week 1-2）

**目标**：建立反馈收集和存储机制

- [ ] 定义反馈数据模型
- [ ] 实现 CLI 反馈工具
- [ ] 创建反馈存储目录结构
- [ ] 测试反馈收集流程

### Phase 2: 策略优化（Week 3-4）

**目标**：实现基于反馈的策略优化

- [ ] 实现阈值优化算法
- [ ] 实现权重优化算法
- [ ] 实现 Few-shot 示例生成
- [ ] 集成到选题 Pipeline

### Phase 3: 自动化（Week 5-6）

**目标**：实现自动化优化流程

- [ ] 定期分析反馈数据
- [ ] 自动应用优化策略
- [ ] 生成优化报告
- [ ] A/B 测试框架

### Phase 4: 可视化（Week 7-8）

**目标**：Web 界面和可视化分析

- [ ] Web 审核界面
- [ ] 反馈数据可视化
- [ ] 策略效果追踪
- [ ] Dashboard 面板

---

## 5. 使用流程

### 5.1 日常工作流（集成模式）

#### **模式 1：启用人工反馈（默认）**

```bash
# Step 1: 运行完整流程（自动在选题后暂停，等待反馈）
python run.py --step all --date 2025-12-31

# 执行过程：
# 1. Fetch → Cluster → Selection → TopicScoring → TopicGate
# 2. 生成选题报告
# 3. 【自动暂停】启动 CLI 反馈界面
# 4. 人工审核并提供反馈
# 5. 【自动继续】Research → Script → Audio → Publish

# Step 2: 系统自动优化策略（每周一次）
python tools/optimize_strategy.py

# Step 3: 使用优化后的配置
python run.py --config config/settings_optimized.yaml --date 2026-01-01
```

#### **模式 2：禁用人工反馈**

```bash
# 在 config/settings.yaml 中设置：
# human_feedback:
#   enabled: false

# 运行完整流程（无人工介入，全自动）
python run.py --step all --date 2025-12-31

# 执行过程：
# Fetch → Cluster → Selection → TopicScoring → TopicGate
# → Research → Script → Audio → Publish
# （无暂停，全流程自动完成）
```

#### **模式 3：独立使用反馈工具（手动模式）**

```bash
# 场景：已经运行完选题，事后补充反馈
python tools/feedback_cli.py \
  --report out/runs/20251231/.../auto_topic/report_*.json \
  --standalone  # 独立模式，不触发后续流程
```

### 5.2 优化迭代

```
Week 1: 收集 5-10 条反馈
  ↓
Week 2: 继续收集，累积 20+ 条
  ↓
Week 3: 运行优化器，调整策略
  ↓
Week 4: 观察新策略效果
  ↓
Week 5: 再次收集反馈
  ↓
循环迭代...
```

---

## 6. 技术细节

### 6.1 文件结构

```
auto-podcast/
├── feedback_history/           # 反馈数据目录
│   ├── feedback_20251231_*.json
│   ├── feedback_20260101_*.json
│   └── optimization_report.md
├── tools/
│   ├── feedback_cli.py        # CLI 反馈工具
│   └── optimize_strategy.py   # 策略优化工具
├── src/
│   └── topic_selection/
│       └── feedback/
│           ├── __init__.py
│           ├── models.py      # 数据模型
│           ├── collector.py   # 反馈收集
│           ├── optimizer.py   # 策略优化
│           └── applier.py     # 自动应用
└── config/
    ├── settings.yaml          # 基础配置
    └── settings_optimized.yaml # 优化后配置
```

### 6.2 依赖库

```txt
# requirements_feedback.txt
rich>=13.0.0          # CLI 美化
click>=8.0.0          # CLI 框架
pydantic>=2.0.0       # 数据验证
numpy>=1.24.0         # 数值计算
pandas>=2.0.0         # 数据分析（可选）
scikit-learn>=1.3.0   # 机器学习（可选）
```

---

## 7. 预期效果

### 7.1 短期（1-2 个月）

- **准确率提升 10-15%**：通过阈值和权重优化
- **减少误报/漏报**：基于 False Positive/Negative 分析
- **编辑效率提升**：更精准的初筛

### 7.2 中期（3-6 个月）

- **个性化选题**：学习特定编辑的偏好
- **自适应策略**：根据反馈自动调整
- **数据驱动决策**：基于统计数据而非直觉

### 7.3 长期（6-12 个月）

- **完全自动化**：90% 的选题无需人工干预
- **持续学习**：系统不断进化
- **多赛道优化**：不同 Track 的独立策略

---

## 8. 风险与挑战

### 8.1 数据质量

**风险**：反馈数据不一致、主观性强  
**对策**：
- 多人审核求平均
- 建立审核指南
- 标注质量检查

### 8.2 过拟合

**风险**：过度优化导致泛化能力下降  
**对策**：
- 保留验证集
- 定期 A/B 测试
- 限制优化频率

### 8.3 冷启动

**风险**：初期反馈数据少，优化效果不明显  
**对策**：
- 从小规模开始
- 设置最小反馈阈值（如 20 条）
- 渐进式应用优化

---

## 9. 后续扩展

### 9.1 高级功能

- **强化学习**：使用 RL 算法持续优化
- **多目标优化**：平衡准确率、多样性、新颖性
- **上下文感知**：考虑历史期数、季节性等
- **主动学习**：智能选择需要人工标注的样本

### 9.2 集成方向

- **Slack/企业微信集成**：快速反馈通道
- **Analytics Dashboard**：实时监控优化效果
- **自动化 A/B 测试**：对比不同策略效果

---

## 10. 总结

本系统通过建立**人工反馈闭环**，实现了自动选题策略的持续优化：

1. ✅ **易于使用**：CLI 工具，简单交互
2. ✅ **数据驱动**：基于真实反馈优化
3. ✅ **自动化**：策略自动调整
4. ✅ **可扩展**：支持多种优化算法
5. ✅ **可追溯**：完整的反馈历史

**核心价值**：让系统"越用越聪明"，不断逼近人类编辑的判断水平。

---

**附录**：
- [A] 反馈数据 Schema 定义
- [B] CLI 工具完整代码
- [C] 优化算法数学推导
- [D] 测试用例与验证方案
