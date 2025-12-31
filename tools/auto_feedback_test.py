"""
自动反馈测试工具 - 模拟人工标注员

用法：
    python tools/auto_feedback_test.py --report <report_path>
"""

import json
import sys
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.topic_selection.feedback.models import TopicFeedback, FeedbackSession
from datetime import datetime


def auto_annotate_topics(report_path: str, episode_date: str) -> FeedbackSession:
    """
    自动标注主题 - 模拟人工审核员
    
    标注策略：
    1. 欧洲市场相关 -> reject（受众不匹配）
    2. 小众品牌（铂智等）-> reject（品牌知名度低）
    3. 技术性过强的专业话题 -> reject（受众窄）
    4. 消费者直接相关的（召回、涨价等）-> accept
    5. 其他 -> 跳过（不标注）
    """
    
    # 加载报告
    report_path = Path(report_path)
    with open(report_path, 'r', encoding='utf-8') as f:
        report_data = json.load(f)
    
    # 创建会话
    session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    session = FeedbackSession(
        session_id=session_id,
        timestamp=datetime.now(),
        episode_date=episode_date,
        report_path=str(report_path),
        total_reviewed=0,
        agree_count=0,
        disagree_count=0,
        feedbacks=[],
        reviewer="auto_test_bot",
        notes="自动化测试 - 模拟人工标注"
    )
    
    # 获取通过的候选（从 all_candidates 中筛选 should_publish=True）
    all_candidates = report_data.get('all_candidates', [])
    passed_candidates = [c for c in all_candidates if c.get('should_publish', False)]
    
    # 获取打分明细
    score_breakdowns = report_data.get('score_breakdowns', [])
    if isinstance(score_breakdowns, list):
        score_breakdowns = {sb['topic_id']: sb for sb in score_breakdowns}
    else:
        score_breakdowns = {}
    
    print(f"\n🤖 自动标注员开始工作...")
    print(f"📋 总计 {len(passed_candidates)} 个通过的主题\n")
    
    for candidate in passed_candidates:
        topic_id = candidate['topic_id']
        title = candidate['title']
        score = candidate.get('topic_score', 0)
        
        session.total_reviewed += 1
        
        # 标注逻辑
        decision = None
        reason = ""
        tags = []
        priority = 3
        
        # 规则1: 欧洲市场
        if any(keyword in title for keyword in ['欧洲', '欧盟', 'Europe']):
            decision = "reject"
            reason = "离国内消费者太远，不关心欧洲市场"
            tags = ["受众不匹配", "地域性强"]
            priority = 2
            print(f"❌ [{session.total_reviewed}] {title[:40]}... -> REJECT (欧洲市场)")
        
        # 规则2: 小众品牌
        elif any(brand in title for brand in ['铂智', '元 MAX', '极氪', '智己']):
            decision = "reject"
            reason = "小众品牌或新车型，普通消费者关注度低"
            tags = ["品牌知名度低", "受众窄"]
            priority = 2
            print(f"❌ [{session.total_reviewed}] {title[:40]}... -> REJECT (小众品牌)")
        
        # 规则3: 技术性过强
        elif any(tech in title for tech in ['固态电池', 'LCoS', '半固态']):
            decision = "reject"
            reason = "技术性太强，普通消费者难以理解和关心"
            tags = ["技术性强", "受众窄"]
            priority = 2
            print(f"❌ [{session.total_reviewed}] {title[:40]}... -> REJECT (技术性强)")
        
        # 规则4: 召回相关（重要）
        elif '召回' in title:
            decision = "accept"
            reason = "涉及消费者安全，重要话题"
            tags = ["消费者关注", "安全"]
            priority = 5
            print(f"✅ [{session.total_reviewed}] {title[:40]}... -> ACCEPT (召回)")
        
        # 规则5: 涨价相关
        elif '涨价' in title or '降价' in title:
            decision = "accept"
            reason = "涉及消费者钱包，关注度高"
            tags = ["消费者关注", "价格"]
            priority = 4
            print(f"✅ [{session.total_reviewed}] {title[:40]}... -> ACCEPT (价格)")
        
        # 其他跳过
        else:
            session.agree_count += 1
            print(f"⏭️  [{session.total_reviewed}] {title[:40]}... -> SKIP (同意系统)")
            continue
        
        # 创建反馈
        score_breakdown = score_breakdowns.get(topic_id, {})
        
        feedback = TopicFeedback(
            feedback_id=f"fb_{session_id}_{len(session.feedbacks) + 1}",
            topic_id=topic_id,
            timestamp=datetime.now(),
            episode_date=episode_date,
            topic_snapshot={
                "title": title,
                "topic_score": score,
                "entities": candidate.get('entities', [])
            },
            system_decision=score_breakdown.get('decision', 'unknown'),
            system_score=score,
            score_breakdown=score_breakdown.get('details', {}),
            human_decision=decision,
            human_priority=priority,
            feedback_reason=reason,
            tags=tags,
            suggested_archetype=None,
            suggested_score_adjustment=None
        )
        
        session.feedbacks.append(feedback)
        
        if decision == "reject":
            session.disagree_count += 1
        else:
            session.agree_count += 1
    
    print(f"\n{'='*80}")
    print(f"✅ 标注完成")
    print(f"{'='*80}")
    print(f"📊 总审核: {session.total_reviewed}")
    print(f"✅ 同意系统: {session.agree_count}")
    print(f"❌ 不同意: {session.disagree_count}")
    print(f"📝 提供反馈: {len(session.feedbacks)}")
    
    return session


def save_session(session: FeedbackSession, storage_dir: str = "feedback_history"):
    """保存反馈会话"""
    storage_path = Path(storage_dir)
    storage_path.mkdir(parents=True, exist_ok=True)
    
    filename = f"feedback_{session.session_id}.json"
    filepath = storage_path / filename
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(
            session.model_dump(),
            f,
            indent=2,
            ensure_ascii=False,
            default=str
        )
    
    print(f"\n💾 反馈已保存: {filepath}")
    return filepath


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="自动反馈测试工具")
    parser.add_argument("--report", required=True, help="选题报告路径")
    parser.add_argument("--date", default=datetime.now().strftime("%Y%m%d"), help="期数日期")
    
    args = parser.parse_args()
    
    session = auto_annotate_topics(args.report, args.date)
    save_session(session)
    
    print(f"\n✅ 测试完成！")
