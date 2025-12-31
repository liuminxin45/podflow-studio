"""
反馈收集器 - 处理反馈收集逻辑
"""

import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from rich.console import Console
from rich.table import Table
from rich.prompt import Prompt, Confirm

from .models import TopicFeedback, FeedbackSession


console = Console()
logger = logging.getLogger(__name__)


class FeedbackCollector:
    """人工反馈收集器"""
    
    def __init__(
        self,
        storage_dir: str = "feedback_history",
        auto_continue: bool = True,
        min_feedback_threshold: int = 0,
    ):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.auto_continue = auto_continue
        self.min_feedback_threshold = min_feedback_threshold
    
    def collect_feedback(
        self,
        report_path: str,
        episode_date: str,
        standalone: bool = False,
    ) -> FeedbackSession:
        """
        收集人工反馈
        
        Args:
            report_path: 选题报告 JSON 路径
            episode_date: 期数日期
            standalone: 是否为独立模式（不触发后续流程）
        
        Returns:
            FeedbackSession: 反馈会话数据
        """
        # 加载报告
        report_path = Path(report_path)
        if not report_path.exists():
            logger.error(f"Report file not found: {report_path}")
            raise FileNotFoundError(f"Report file not found: {report_path}")
        
        with open(report_path, 'r', encoding='utf-8') as f:
            report_data = json.load(f)
        
        # 显示欢迎信息
        self._show_welcome(report_path, report_data)
        
        # 创建反馈会话
        session = FeedbackSession(
            session_id=f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            timestamp=datetime.now(),
            episode_date=episode_date,
            report_path=str(report_path),
            reviewer=self._get_reviewer_name()
        )
        
        # 遍历候选主题
        candidates = report_data.get('all_candidates', [])
        score_breakdowns = {
            sb['topic_id']: sb 
            for sb in report_data.get('score_breakdowns', [])
        }
        
        for candidate in candidates:
            # 只审核通过的主题（优化用户体验）
            if not candidate.get('should_publish', False):
                continue
            
            self._review_single_topic(
                candidate=candidate,
                session=session,
                score_breakdown=score_breakdowns.get(candidate['topic_id'])
            )
        
        # 保存反馈
        self._save_feedback_session(session)
        
        # 显示统计
        self._show_feedback_summary(session, standalone)
        
        return session
    
    def _show_welcome(self, report_path: Path, report_data: dict):
        """显示欢迎信息"""
        stats = report_data.get('stats', {})
        
        console.print("\n" + "="*80)
        console.print("[bold green]🎯 选题审核 - 人工反馈收集[/bold green]")
        console.print("="*80)
        console.print(f"\n📋 报告: {report_path.name}")
        console.print(f"📊 统计:")
        console.print(f"   - 候选主题数: {stats.get('candidates_generated', 0)}")
        console.print(f"   - 通过打分: {stats.get('candidates_passed_scoring', 0)}")
        console.print(f"   - 通过门控: {stats.get('candidates_passed_gate', 0)}")
        console.print("\n💡 提示: 仅审核通过的主题，按 Ctrl+C 可随时退出\n")
    
    def _get_reviewer_name(self) -> str:
        """获取审核人姓名"""
        try:
            return Prompt.ask("👤 审核人", default="default")
        except KeyboardInterrupt:
            return "default"
    
    def _review_single_topic(
        self,
        candidate: dict,
        session: FeedbackSession,
        score_breakdown: Optional[dict] = None,
    ):
        """审核单个主题"""
        try:
            # 显示主题信息
            console.print("\n" + "─"*80)
            console.print(f"[bold cyan]主题 {session.total_reviewed + 1}[/bold cyan]")
            console.print(f"📰 标题: [yellow]{candidate['title']}[/yellow]")
            
            entities = candidate.get('entities', [])
            if entities:
                console.print(f"🏷️  实体: {', '.join(entities)}")
            
            console.print(f"📊 新闻数: {candidate.get('items_count', 0)}")
            
            # 显示系统决策
            decision = score_breakdown.get('decision', 'unknown') if score_breakdown else 'unknown'
            score = candidate.get('topic_score', 0)
            
            decision_color = {
                'must': 'green',
                'maybe': 'yellow',
                'discard': 'red'
            }.get(decision, 'white')
            
            console.print(f"🤖 系统决策: [{decision_color}]{decision.upper()}[/{decision_color}]")
            console.print(f"📈 系统打分: {score:.2f}/100")
            
            # 显示打分明细
            if score_breakdown and score_breakdown.get('details'):
                self._show_score_breakdown(score_breakdown['details'])
            
            # 收集人工反馈
            session.total_reviewed += 1
            
            if not Confirm.ask("\n💭 是否需要给出反馈", default=False):
                session.agree_count += 1
                console.print("[dim]✓ 已跳过（默认同意系统决策）[/dim]")
                return
            
            # 收集详细反馈
            human_decision = Prompt.ask(
                "你的决策",
                choices=["accept", "reject", "uncertain"],
                default="accept"
            )
            
            feedback_reason = ""
            tags = []
            human_priority = None
            
            if human_decision != "uncertain":
                feedback_reason = Prompt.ask(
                    "💬 反馈原因（为什么不同意系统？留空跳过）",
                    default=""
                )
                
                tags_input = Prompt.ask(
                    "🏷️  标签（逗号分隔，留空跳过）",
                    default=""
                )
                if tags_input:
                    tags = [t.strip() for t in tags_input.split(',') if t.strip()]
                
                human_priority = int(Prompt.ask(
                    "⭐ 优先级（1-5）",
                    default="3"
                ))
            
            feedback = TopicFeedback(
                feedback_id=f"fb_{session.session_id}_{session.total_reviewed}",
                topic_id=candidate['topic_id'],
                timestamp=datetime.now(),
                episode_date=session.episode_date,
                topic_snapshot=candidate,
                system_decision=decision,
                system_score=score,
                score_breakdown=score_breakdown.get('details', {}) if score_breakdown else {},
                human_decision=human_decision,
                human_priority=human_priority,
                feedback_reason=feedback_reason,
                tags=tags,
            )
            
            session.feedbacks.append(feedback)
            
            # 统计同意/不同意
            if human_decision == "accept" and decision in ['must', 'maybe']:
                session.agree_count += 1
                console.print("[green]✓ 反馈已记录（同意系统）[/green]")
            elif human_decision == "reject" and decision == 'discard':
                session.agree_count += 1
                console.print("[green]✓ 反馈已记录（同意系统）[/green]")
            else:
                session.disagree_count += 1
                console.print("[yellow]⚠ 反馈已记录（不同意系统）[/yellow]")
        
        except KeyboardInterrupt:
            console.print("\n\n[yellow]⚠️  用户中断，保存当前进度...[/yellow]")
            raise
    
    def _show_score_breakdown(self, details: dict):
        """显示打分明细"""
        table = Table(title="打分明细", show_header=True, header_style="bold magenta")
        table.add_column("维度", style="cyan", width=24)
        table.add_column("得分", justify="right", style="magenta", width=10)
        
        # 维度中文映射
        dimension_names = {
            'archetype_mean': '内容价值（母型）',
            'personal_impact': '个人影响度',
            'counter_intuitive': '反直觉性',
            'trend': '趋势信号',
            'time': '时效性',
            'persona': '人群相关性',
            'history_echo': '历史呼应',
            'continuity': '连续性',
            'data_enrichable': '数据可补充性',
            'follow_up': '可跟进性'
        }
        
        # 按重要性排序（分组显示）
        order = [
            'archetype_mean', 'personal_impact', 'counter_intuitive',
            'trend', 'time', 'persona', 'history_echo',
            'continuity', 'data_enrichable', 'follow_up'
        ]
        
        for key in order:
            if key in details:
                value = details[key]
                if isinstance(value, (int, float)):
                    display_name = dimension_names.get(key, key)
                    table.add_row(display_name, f"{value:.2f}")
        
        console.print(table)
    
    def _save_feedback_session(self, session: FeedbackSession):
        """保存反馈会话"""
        filename = f"feedback_{session.session_id}.json"
        filepath = self.storage_dir / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(
                session.model_dump(),
                f,
                indent=2,
                ensure_ascii=False,
                default=str
            )
        
        logger.info(f"Feedback session saved: {filepath}")
    
    def _show_feedback_summary(self, session: FeedbackSession, standalone: bool):
        """显示反馈统计"""
        console.print("\n" + "="*80)
        console.print("[bold green]✅ 审核完成统计[/bold green]")
        console.print("="*80)
        console.print(f"\n📊 总审核数: {session.total_reviewed}")
        console.print(f"✅ 同意系统: {session.agree_count} ({session.agree_count/max(session.total_reviewed, 1)*100:.1f}%)")
        console.print(f"❌ 不同意: {session.disagree_count} ({session.disagree_count/max(session.total_reviewed, 1)*100:.1f}%)")
        console.print(f"💬 提供详细反馈: {len(session.feedbacks)}")
        
        # 保存位置
        filepath = self.storage_dir / f"feedback_{session.session_id}.json"
        console.print(f"\n💾 反馈已保存: [cyan]{filepath}[/cyan]")
        
        if not standalone and self.auto_continue:
            console.print("\n[green]✨ 反馈收集完成，继续后续流程...[/green]")
        
        console.print("="*80 + "\n")
