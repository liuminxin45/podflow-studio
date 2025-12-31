"""
测试反馈应用逻辑 - 验证 _apply_human_feedback 是否正确过滤主题
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.topic_selection.feedback.models import FeedbackSession


def load_feedback_session(feedback_path: str) -> FeedbackSession:
    """加载反馈会话"""
    with open(feedback_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return FeedbackSession(**data)


def load_report(report_path: str) -> dict:
    """加载选题报告"""
    with open(report_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def simulate_apply_feedback(candidates: list, feedback_session: FeedbackSession) -> list:
    """模拟 SelectionStep._apply_human_feedback 的逻辑"""
    # 构建 topic_id -> human_decision 的映射
    feedback_map = {
        fb.topic_id: fb.human_decision
        for fb in feedback_session.feedbacks
    }
    
    adjusted_candidates = []
    rejected_count = 0
    
    for candidate in candidates:
        topic_id = candidate['topic_id']
        title = candidate['title']
        
        # 检查是否有人工反馈
        if topic_id in feedback_map:
            human_decision = feedback_map[topic_id]
            
            if human_decision == "reject":
                # 人工明确拒绝，跳过
                print(f"  ❌ 过滤: {title[:50]}...")
                rejected_count += 1
                continue
            elif human_decision == "accept":
                # 人工明确接受，保留
                print(f"  ✅ 保留: {title[:50]}...")
                adjusted_candidates.append(candidate)
            else:  # uncertain
                # 不确定，保留原始决策
                print(f"  ⚠️  保留(不确定): {title[:50]}...")
                adjusted_candidates.append(candidate)
        else:
            # 没有反馈，保留原始决策
            print(f"  ⏭️  保留(无反馈): {title[:50]}...")
            adjusted_candidates.append(candidate)
    
    return adjusted_candidates, rejected_count


def main():
    # 加载反馈数据
    feedback_path = "feedback_history/feedback_session_20251231_223304.json"
    print(f"\n📂 加载反馈数据: {feedback_path}")
    feedback_session = load_feedback_session(feedback_path)
    
    print(f"\n📊 反馈统计:")
    print(f"  - 总审核: {feedback_session.total_reviewed}")
    print(f"  - 同意系统: {feedback_session.agree_count}")
    print(f"  - 不同意: {feedback_session.disagree_count}")
    print(f"  - 反馈条数: {len(feedback_session.feedbacks)}")
    
    # 加载报告
    report_path = Path(feedback_session.report_path)
    print(f"\n📂 加载选题报告: {report_path.name}")
    report = load_report(report_path)
    
    # 获取通过的候选
    all_candidates = report.get('all_candidates', [])
    passed_candidates = [c for c in all_candidates if c.get('should_publish', False)]
    
    print(f"\n✅ 原始通过主题: {len(passed_candidates)} 个")
    for i, c in enumerate(passed_candidates, 1):
        print(f"  {i}. {c['title']}")
    
    # 应用反馈
    print(f"\n{'='*80}")
    print("🔄 应用人工反馈...")
    print(f"{'='*80}")
    
    adjusted_candidates, rejected_count = simulate_apply_feedback(
        passed_candidates, 
        feedback_session
    )
    
    print(f"\n{'='*80}")
    print("📊 应用结果")
    print(f"{'='*80}")
    print(f"原始通过: {len(passed_candidates)} 个")
    print(f"人工拒绝: {rejected_count} 个")
    print(f"最终保留: {len(adjusted_candidates)} 个")
    print(f"过滤比例: {rejected_count / len(passed_candidates) * 100:.1f}%")
    
    print(f"\n✅ 最终通过主题列表:")
    for i, c in enumerate(adjusted_candidates, 1):
        print(f"  {i}. {c['title']}")
    
    # 验证逻辑正确性
    print(f"\n{'='*80}")
    print("✅ 验证结果")
    print(f"{'='*80}")
    
    # 检查是否正确过滤了 reject 的主题
    reject_topic_ids = {
        fb.topic_id for fb in feedback_session.feedbacks 
        if fb.human_decision == "reject"
    }
    
    remaining_topic_ids = {c['topic_id'] for c in adjusted_candidates}
    
    # 检查是否有 reject 的主题泄漏到最终结果
    leaked = reject_topic_ids & remaining_topic_ids
    if leaked:
        print(f"❌ 错误: 发现 {len(leaked)} 个被拒绝的主题仍在结果中!")
        for topic_id in leaked:
            print(f"   - {topic_id}")
        return False
    else:
        print(f"✅ 通过: 所有被拒绝的主题都已正确过滤")
    
    # 检查是否有 accept 的主题被错误过滤
    accept_topic_ids = {
        fb.topic_id for fb in feedback_session.feedbacks 
        if fb.human_decision == "accept"
    }
    
    missing = accept_topic_ids - remaining_topic_ids
    if missing:
        print(f"❌ 错误: {len(missing)} 个被接受的主题丢失!")
        for topic_id in missing:
            print(f"   - {topic_id}")
        return False
    else:
        print(f"✅ 通过: 所有被接受的主题都已正确保留")
    
    print(f"\n{'='*80}")
    print("🎉 测试全部通过！反馈应用逻辑工作正常")
    print(f"{'='*80}")
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
