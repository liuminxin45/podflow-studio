# PodFlow 晨报音频生产规范

本文件描述当前晨报正式节目的音频生产和发布约束。可执行规则由
`protocol/production_plan.py`、音频节点、审核节点和相关测试共同落实；文档与实现不一致时，
必须同步修正两者，不能用文档绕过机器门禁。

## 口播

- 音色：`zh_female_shuangkuaisisi_emo_v2_mars_bigtts`。
- 开场 `happy / 2 / 0.96`，快讯 `neutral / 1 / 1.02`，重点解读 `neutral / 1 / 0.94`，收尾 `happy / 1 / 0.92`。
- 每段 80 至 140 个中文字符，最多 2 句，目标 12 至 28 秒，硬上限 30 秒。
- 同一新闻内部停顿 220 至 380ms，段落间 450 至 700ms。
- `surprised` 只可用于人工明确的提问或意外转折，强度不得超过 2。禁止按关键词自动制造夸张情绪。
- 专名、数字、百分比和英文缩写存在未确认项时不得进入正式 TTS。

## 时间线和混音

- 片头 8.0 秒：前 5.5 秒独立播放，后 2.5 秒与开场人声重叠并下压 11dB。
- 6 条快讯之间必须恰好有 5 个 1.35 秒 sting。
- 第 6 条快讯与重点解读之间必须有 1 个 2.4 秒 bridge。
- 片尾 7.0 秒：最后一句剩余约 2.5 秒时淡入并下压 11dB，人声结束后继续约 4.5 秒。
- 正文不得持续铺底乐。先分别校准人声与 cue，再对总线限幅和响度归一化。
- 最终 MP3：48 kHz、160 kbps、-16 LUFS ±1、真峰值不高于 -1 dBTP。

## 门禁

- 自动终审从去除静音帧后的 RMS 分位差计算动态，不允许静音伪造“能量变化”。
- 检查片段时长、区域语速、前后静音、异常长停顿、剪切、爆音、缺失、重复指纹以及 8 个音乐事件。
- `audio-quality-report.json` 必须为 `passed`。
- 人工全程试听后用最终 MP3 SHA256 审批。重新渲染后旧审批无效。
- 公开打包同时依赖自动终审与人工审批；mock、旧生产计划、缺来源、缺授权或不符合公开音频规格一律拒绝。

## 音乐权利

### 候选音乐发现

`protocol/music_profiles.json` 是候选音乐风格的规则注册表，只负责在线发现和排序，
不会把搜索结果直接用于正式节目。内置风格包括温暖早咖啡、都市通勤、清晨专注和
周末松弛，候选必须满足以下门禁：

- 来源提供 CC0 标识、原始作品页面和可读取音频 URL。
- 时长满足风格规则，能够从同一作品制作完整 Cue Pack。
- 人声、激烈、黑暗、预告片或其他排除风格直接拒绝。
- BPM 或纯音乐状态缺失时只能进入人工复核，不能自动批准。

```bash
node scripts/python313.js scripts/discover_music.py --list-styles
node scripts/python313.js scripts/discover_music.py --style morning_coffee_warm --limit 10
```

Openverse 只是发现索引，不是权利担保方。候选进入正式 Cue Pack 前必须回到原始作品页
核验授权，保存来源、原始文件 SHA256 和裁剪记录，并完成人工试听。发现失败或元数据
不完整时必须保留真实原因，不得回退到未审核音乐。

### 当前品牌音乐

四个 cue 仅由 Ondrosik 的 Quick Spark 派生。作者曲库与 FMA 曲目页记录 CC0 1.0。
原始文件 SHA256、取得日期、裁剪区间和派生文件指纹保存在
[`assets/audio/quick-spark-source.json`](../assets/audio/quick-spark-source.json)，完整说明见
[`assets/audio/RIGHTS.md`](../assets/audio/RIGHTS.md)。
