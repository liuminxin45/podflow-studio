# PodFlow Studio Product Constitution

本文档是 PodFlow Studio 的产品宪章，用来约束默认入口、README、Roadmap、架构和测试。任何新能力都必须先不破坏本地单人新闻早报闭环。

## Product Position

PodFlow Studio 是一个本地优先的单人新闻播客生产流水线，面向“通勤早咖啡”这类单人新闻简报场景，支持自动采集数据、自动生成可编辑播客稿、AI 语音合成或人声替换、自动音频成片，并输出可发布 RSS / 发布包。

默认定位必须收敛为：

```text
单人新闻早报 / 单人新闻播客 / 通勤早咖啡式内容生产
```

默认 preset 必须是 `morning_news_brief`：

```yaml
id: morning_news_brief
content_type: news_brief
num_hosts: 1
target_duration_minutes: 22
target_duration_minutes_range: 20-24
template_variant: quick_9_plus_deep_1
recommended_news_item_count: 10
quick_news_recommended_count: 9
deep_dive_recommended_count: 1
allow_custom_news_item_count: true
tone: clear, concise, commute-friendly
language: zh-CN
```

多人播客、长故事节目和复杂内容管理可以保留为 secondary / experimental，但不得作为默认路径。

## Primary User

主要用户是单人内容创作者、播客主理人、开发者型编辑或小团队中的个人操作者。

他们的核心需求是：

- 每天或每周用少量素材快速做一期新闻早报；
- 保留事实来源，避免黑盒生成；
- 能在发布前手动改稿、核对事实、替换单段录音；
- 本地保存输入、中间产物、音频和发布包；
- 没有模型 key 时也能先跑通 demo 和主路径。

## Primary Workflow

```text
数据源采集
  -> 新闻筛选 / 去重 / 归并
  -> 事实卡片
  -> 整理为快讯 / 深度解读结构
  -> 单人新闻早报稿
  -> 人工手调稿件
  -> AI TTS / 人声录制替换
  -> 自动音频成片
  -> RSS / 发布包输出
```

核心状态对象是 `EpisodeRun`，至少包含：

```text
episode_id
preset
source_inputs
facts
selected_topics
script
edited_script
voice_segments
audio_outputs
publish_outputs
run_report
```

主路径必须产出可落盘中间文件，并且可以从 `run_report.json` 看见 facts 数量、使用数量、未使用数量、脚本来源、音频降级状态和 RSS 是否为本地预览。

## P0 Acceptance Criteria

1. 用户可以使用内置 demo 数据生成一期单人新闻早报。
2. 生成过程可以产出结构化事实卡片。
3. 生成稿件必须可以人工编辑。
4. 编辑后的稿件必须进入 TTS / 音频成片流程。
5. 最终必须输出 mp3 和 feed.xml；如果本机缺少 ffmpeg，可以降级为 wav，但必须在 report 中说明。
6. 最终发布包必须包含 `final.*`、`feed.xml`、`episode.json`、`run_report.json`。
7. 端到端流程必须有自动化测试或可复现脚本。
8. 没有外部 API key 时，demo 仍必须跑通。
9. RSS enclosure 不得只写本地绝对路径；没有 `public_base_url` 时必须标记 local-preview only。
10. 每个新闻稿件段落必须能追溯到 `source_fact_ids`；无来源段落必须进入 report warning。

## Non-goals

- 不是通用剪辑软件。
- 不是新闻 CMS。
- 不是多人播客平台。
- 不以海量数据源聚合为第一目标。
- 不是通用 TTS 平台。
- 不是云端发布平台或账号系统。
- 当前优先保证单人新闻早报闭环。

## Design Rules

- 默认入口必须指向 `morning_news_brief`。
- 默认主持人数量必须是 1。
- 默认内容类型必须是 `news_brief`。
- 默认早咖啡模板推荐 9 条快讯 + 1 条深度解读，但不得把推荐条数作为阻断条件。
- script 生成必须基于 `facts`，不能直接把原始素材拼成稿件。
- `script` 必须结构化为 `ScriptSegment[]`，不能只保存大段文本。
- `edited_script` 优先级高于 generated `script`。
- TTS 输出应记录 `voice_segments`，每段保留 segment id、文本、来源 fact ids 和音频路径。
- AudioAssembly 输出 `audio_report.json`，并在依赖不可用时优雅降级。
- PublishPackage 输出到 `dist/episodes/<episode_id>/`，并生成 RSS 和 episode metadata。
- 新增能力必须配套 demo、测试、示例配置或明确的 roadmap 标记。
- 旧功能若与新定位冲突，应降级为 secondary / experimental，而不是继续作为默认入口。
