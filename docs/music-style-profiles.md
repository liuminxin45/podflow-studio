# 音乐风格发现规则

PodFlow Studio 使用 `protocol/music_profiles.json` 作为候选音乐风格的唯一规则注册表。规则只负责在线发现和候选排序，不会把搜索结果直接用于正式节目。

内置风格包括温暖早咖啡、都市通勤、清晨专注和周末松弛。所有风格首先执行相同的硬门禁：

- 来源必须提供 CC0 标识、原始作品页面和可读取音频 URL。
- 时长必须落在风格规定的范围内，确保能从一首作品中制作完整 Cue Pack。
- 标记为人声、激烈、黑暗、预告片或其他排除风格的候选直接拒绝。
- BPM 或纯音乐状态缺失时仅允许进入人工复核，不得自动批准。

使用以下命令查看规则或从 Openverse 获取待试听候选：

```bash
node scripts/python313.js scripts/discover_music.py --list-styles
node scripts/python313.js scripts/discover_music.py --style morning_coffee_warm --limit 10
```

Openverse 是发现索引，不是权利担保方。候选进入正式 Cue Pack 前必须回到作品原始页面核验授权、下载源文件、保存来源快照和 SHA256，并完成人工试听。动态搜索失败、元数据缺失或没有合格候选时必须保留真实原因，不得回退到未审核音乐。
