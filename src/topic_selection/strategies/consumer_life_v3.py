"""
Consumer Life Strategy (v3) - Enhanced with Pattern/Compound/Domain Rules

民生消费策略：面向普通消费者、家长、上班族、学生、普通理财/投资人群（非专业）

核心目标：优先捕捉"群众爱聊、能感知、影响钱袋子/生活体验"的新闻
修复硬匹配卡死问题：引入语义域(domain) + 词族/联合命中规则
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from .base import BaseTopicStrategy
from src.topic_selection.processing.topic_scoring import TopicScorerConfig


class ConsumerLifeStrategyV3(BaseTopicStrategy):
    """民生消费策略 v3（大众兴趣优先 + 语义增强）"""

    @property
    def name(self) -> str:
        return "consumer_life_v3"

    @property
    def description(self) -> str:
        return (
            "面向普通消费者/家长/上班族/学生/普通理财人群，优先钱袋子、"
            "房地产与房贷、消费补贴与以旧换新、电车与智驾、国民品牌价格异动、"
            "连锁零售大动作与可触达前沿科技等话题（v3：语义域增强）"
        )

    def get_signal_prompt_template(self) -> str:
        return """你是"面向中国普通民众的新闻播客选题编辑（民生消费向）"。你的任务是评估一条新闻对普通听众的"想听程度"和"现实相关性"，并输出结构化评分。

【受众画像】
- 普通消费者、家长、上班族、学生、普通理财/投资人群（黄金白银、A股大盘、房贷、消费品牌价格波动）
- 不以技术从业者/开发者为核心受众

【强优先关注（出现即倾向给高分，尤其 personal_impact / risk_opportunity / change_happening）】
1) 黄金/白银/金价银价（投资、首饰、避险）
2) A股大盘关键利好/利空（上证/深证/沪深300、政策、监管、降息、印花税、增量资金等）
3) 房地产/楼市与房贷：房价、首付、公积金、LPR/房贷利率、限购限贷、交易税费、保交楼/交付、烂尾风险
4) 国家宏观与国民经济政策但要"落到普通人"：扩内需、促消费、消费补贴/消费券、以旧换新/"国补"、稳就业、社保医保养老金变化
5) 电车/新能源汽车：价格战、购车补贴/限制变化、智驾（含L3）、充电/换电、电池安全与标准
6) 大商超/连锁零售重大动作（如胖东来等）
7) 普通人可触达的前沿科技：AI眼镜、L3自动驾驶、AI手机（豆包手机/腾讯元宝等）、人形机器人（消费端落地/量产/预售/价格）
8) 国民品牌/热门消费品的"暴涨/跳水/炒价/断货/召回/安全事件"（茅台、潮玩LABUBU、小米旗舰机炒到2万等）
9) 春晚/国民级文化节点与大厂/品牌合作（如字节与春晚合作、分会场等）
10) 影响价格与供给的政策/产业变化（电脑明年涨价、供应链冲击、海南自贸港封关等）
11) 连锁餐饮/咖啡"覆盖/扩张/万店/价格战"（麦当劳省级全覆盖、诺瓦万店等）
12) 大促赛道爆发（双11宠物赛道销售额激增等）

【必须降分的内容】
- 纯技术/模型/开源/框架/工程细节，普通人短期难受益（训练、推理、benchmark、API、SDK、架构、论文）
- 与大众生活场景无关、缺少可感知结果的"内部技术迭代"

【标题】{title}
【内容】{content}

输出JSON格式（只输出JSON，不要解释）：
```json
{{
  "archetypes": {{
    "change_happening": 0-3,
    "personal_impact": 0-3,
    "competition_conflict": 0-3,
    "risk_opportunity": 0-3,
    "counter_intuitive": 0-3,
    "inflection_trend": 0-3
  }},
  "continuity": 0-1,
  "why_now": 0-1,
  "data_enrichable": 0-1,
  "follow_up_potential": 0-1,
  "entities": ["实体1", "实体2"],
  "why_now_reason": "为什么现在值得关注（一句话）",
  "domains": ["domain1", "domain2"]
}}
```

可选的语义域标签（domains，可多选）：
- national_culture: 国民文化节点（春晚/央视晚会/全国性仪式）
- real_estate: 房地产/房贷/LPR/公积金/交易税费
- macro_consume_policy: 扩内需/促消费/国补/以旧换新/消费券
- precious_metals: 黄金/白银/首饰/避险
- a_share_market: A股/大盘/印花税/降息降准/监管
- ev_auto: 电车/新能源/智驾/L3/充电/换电/电池安全
- popular_brand_price: 茅台/潮玩/手机炒价/断货/召回/跳水暴涨
- retail_chain: 胖东来/商超/连锁/麦当劳/万店咖啡
- consumer_frontier_tech: AI眼镜/AI手机/人形机器人/消费级AI终端
- consumer_ai_app: 国民级AI应用/效率工具（腾讯元宝/豆包/夸克/百度AI助手/微信AI/支付宝AI等的功能上线/任务/提醒/日程/代办/搜索/购物助手等普通人可直接使用的能力）
- ecommerce_promo: 双11/大促/赛道爆发
- other: 其他

评分要点（请严格执行）：
- archetypes 每项 0-3：
  - personal_impact（核心）：是否影响普通人的"钱、房、生活便利、消费选择、安全健康、出行、教育"
    - 出现"涨价/降价/暴涨/跳水/炒到/黄牛/断货/召回/补贴/政策利好利空/房贷利率变化/LPR变化" → 倾向给高分
  - risk_opportunity（核心）：是否涉及"能赚钱/会亏钱/会踩坑/会省钱"的风险机会（黄金白银、A股、房价房贷、电车价格战、补贴窗口等）
  - change_happening：政策/市场/产品/品牌重大变化
  - counter_intuitive：反常识（大跳水、暴涨、突然封关、意外全覆盖、政策效果反直觉）
  - competition_conflict：品牌/平台/城市竞争、输赢格局（合作、扩张、价格战）
  - inflection_trend：大众可触达趋势（消费电子/车/AI终端/零售/房地产周期）优先；纯技术趋势减分
- continuity：是否是持续事件（政策推进、产业周期、价格趋势、连锁扩张、房地产周期）
- why_now：是否具有"现在必须讲"的窗口（重大公布、政策落地、价格异动、爆款出圈、补贴窗口）
- data_enrichable：是否容易补充历史对比/排名/价差/扩张速度/房贷测算（民生播客很重要）
- follow_up_potential：是否有后续可追（政策进度、交付、价格继续波动、合作落地、量产交付）
- entities：提取关键实体（公司/品牌/城市/产品/政策机构）
- domains：根据新闻内容选择1-3个最相关的语义域标签"""

    def get_scorer_config(self) -> TopicScorerConfig:
        """民生策略打分配置（v3）"""
        return TopicScorerConfig(
            archetype_mean_max=26.0,
            personal_impact_max=28.0,
            counter_intuitive_max=6.0,
            trend_max=10.0,
            time_max=5.0,
            persona_max=8.0,
            history_echo_max=2.0,
            continuity_max=4.0,
            data_enrichable_max=4.0,
            follow_up_max=3.0,
            threshold_must_publish=66.0,
            threshold_maybe_publish=50.0,
        )

    def get_persona_whitelist(self) -> Optional[List[str]]:
        """民生策略人群白名单"""
        return [
            "普通消费者", "家长", "上班族", "老年人", "学生", "家庭主妇",
            "普通投资者", "车主", "准车主", "购房者", "租房者",
        ]

    def get_persona_penalty_keywords(self) -> List[str]:
        """民生策略人群惩罚关键词"""
        return [
            "开发者", "极客", "工程师", "架构师", "技术决策者",
            "研究员", "论文", "基准",
        ]

    def get_keyword_adjustments(self) -> Dict[str, float]:
        """关键词调整（保留高优先级词，降低泛词权重）"""
        return {
            # 钱袋子核心
            "黄金": +10.0, "金价": +10.0, "白银": +7.0, "银价": +7.0,
            "涨价": +6.0, "降价": +6.0, "暴涨": +8.0, "跳水": +9.0,
            "炒到": +10.0, "断货": +7.0, "召回": +10.0,
            
            # A股/利率
            "A股": +8.0, "大盘": +7.0, "印花税": +8.0, "降息": +9.0,
            "LPR": +8.0, "房贷利率": +10.0,
            
            # 房地产
            "房地产": +10.0, "楼市": +10.0, "房价": +10.0,
            "首付": +9.0, "公积金": +8.0, "限购": +8.0, "烂尾": +10.0,
            
            # 补贴政策
            "消费补贴": +10.0, "国补": +10.0, "以旧换新": +10.0,
            "消费券": +8.0, "补贴": +7.0,
            
            # 电车
            "电车": +9.0, "新能源汽车": +9.0, "智驾": +8.0,
            "L3": +10.0, "价格战": +7.0,
            
            # 连锁零售
            "胖东来": +12.0, "万店": +8.0, "全覆盖": +6.0,
            
            # 国民品牌
            "茅台": +10.0, "LABUBU": +10.0, "潮玩": +7.0,
            
            # 消费科技
            "AI眼镜": +9.0, "AI手机": +9.0, "人形机器人": +8.0,
            
            # 降低泛词权重（改由compound规则控制）
            "合作": +1.0,  # 从+3降到+1
            "字节": +2.0,  # 从+5降到+2
            
            # 技术减分
            "开源": -8.0, "模型": -0.0, "框架": -10.0, "API": -10.0,
            "训练": -6.0, "推理": -6.0, "SOTA": -10.0, "benchmark": -8.0,
        }

    def get_pattern_adjustments(self) -> List[Tuple[str, float, str]]:
        """正则模式调整（覆盖同义词/别称）"""
        return [
            # 春晚相关（覆盖央视/总台/CCTV等）
            (r"(央视|总台|CCTV|中央电视台)", +8.0, "央视/总台"),
            (r"(春节联欢晚会|除夕晚会|春晚节目单|春晚彩排)", +10.0, "春晚相关"),
            (r"(分会场|主会场|联动舞台|导演组)", +6.0, "晚会场地"),
            
            # 房地产相关
            (r"(认房不认贷|认贷不认房)", +8.0, "房贷政策"),
            (r"(保交楼|交付|延期交付)", +9.0, "交付相关"),
            (r"(房企|地产商|开发商)", +5.0, "房企"),
            
            # 电车相关
            (r"(插混|增程|纯电)", +6.0, "电车类型"),
            (r"(充电桩|换电站|超充)", +6.0, "充电设施"),
            
            # 金融市场
            (r"(上证|深证|沪深300|创业板)", +6.0, "股市指数"),
            (r"(降准|加息|货币政策)", +8.0, "货币政策"),
            
            # 消费补贴
            (r"(家电下乡|汽车下乡|惠民补贴)", +9.0, "下乡补贴"),
            
            # 连锁扩张
            (r"(开店|关店|闭店|撤店)", +5.0, "门店动态"),
            (r"(省级覆盖|全国覆盖|城市覆盖)", +7.0, "覆盖范围"),
        ]

    def get_compound_adjustments(self) -> List[Dict]:
        """联合命中规则（AND规则，抑制泛词误报）"""
        return [
            {
                "anchor_patterns": [
                    r"(春晚|春节联欢晚会|央视|总台|CCTV|除夕|分会场|主会场)"
                ],
                "trigger_patterns": [
                    r"(合作|联动|官宣|赞助|冠名|独家|战略合作)"
                ],
                "bonus": 10.0,
                "description": "春晚合作（锚点+泛词）"
            },
            {
                "anchor_patterns": [
                    r"(春晚|央视|总台|晚会)"
                ],
                "trigger_patterns": [
                    r"(字节|抖音|TikTok|ByteDance)"
                ],
                "bonus": 8.0,
                "description": "字节春晚合作"
            },
            {
                "anchor_patterns": [
                    r"(房价|房地产|楼市|二手房|新房)"
                ],
                "trigger_patterns": [
                    r"(暴跌|腰斩|跳水|大跌|崩盘)"
                ],
                "bonus": 12.0,
                "description": "房价暴跌（高关注）"
            },
            {
                "anchor_patterns": [
                    r"(黄金|金价|足金)"
                ],
                "trigger_patterns": [
                    r"(突破|新高|历史新高|创新高)"
                ],
                "bonus": 10.0,
                "description": "金价创新高"
            },
            {
                "anchor_patterns": [
                    r"(电车|新能源汽车|电动汽车)"
                ],
                "trigger_patterns": [
                    r"(降价|价格战|跳水|促销)"
                ],
                "bonus": 8.0,
                "description": "电车价格战"
            },
            {
                "anchor_patterns": [
                    r"(腾讯元宝|豆包|夸克|百度AI|微信AI|支付宝AI|AI助手)"
                ],
                "trigger_patterns": [
                    r"(任务|提醒|日程|待办|安排时间|到点|功能上线|新功能)"
                ],
                "bonus": 8.0,
                "description": "国民AI应用功能更新"
            },
            {
                "anchor_patterns": [
                    r"(一句话|语音)"
                ],
                "trigger_patterns": [
                    r"(安排时间|到点提醒|代办|搜索|购物)"
                ],
                "bonus": 4.0,
                "description": "语音效率功能"
            },
        ]

    def get_domain_bonus_map(self) -> Dict[str, float]:
        """语义域加分映射（v3核心修复）"""
        return {
            "national_culture": 14.0,       # 春晚等国民文化节点
            "real_estate": 12.0,            # 房地产
            "macro_consume_policy": 12.0,   # 宏观消费政策
            "precious_metals": 10.0,        # 贵金属
            "a_share_market": 10.0,         # A股
            "ev_auto": 10.0,                # 电车
            "popular_brand_price": 12.0,    # 国民品牌价格异动
            "retail_chain": 10.0,           # 连锁零售
            "consumer_frontier_tech": 12.0, # 消费级科技
            "consumer_ai_app": 12.0,        # 国民级AI应用（新增）
            "ecommerce_promo": 6.0,         # 电商大促
        }


__all__ = ["ConsumerLifeStrategyV3"]
