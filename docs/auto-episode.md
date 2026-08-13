# PodFlow 自动出片（预览链路）

本文档说明如何在无桌面 UI 的环境（CLI / GitHub Actions）里，用免费额度自动生产一期播客「预览成片」。

## 定位

自动链路产出的是 **预览成片**，不是正式节目：

- 用 Gemini（Google AI Studio 免费额度）做选题与写作；
- 用 `edge-tts`（免费、免 key）配音；
- 不经过人工终审，明确标记 `production_mode: preview`，不触碰正式发布门禁。

正式节目仍走 `produce` 三阶段 + 豆包付费配音 + 人工 SHA256 审批，门禁保持不变。

## 环境变量

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `PODFLOW_TARGET_TOPIC` | AI 选题主题（留空则按热点聚类） | 空 |
| `PODFLOW_TIME_RANGE_HOURS` | 选题时效窗口（小时） | 24 |
| `PODFLOW_MAX_ITEMS` | 最多选取条目数 | 10 |
| `PODFLOW_AUTO_EXECUTE` | 自动执行模式（`1`/`true`） | 关 |
| `PODFLOW_ORGANIZE_MODE` | `ai` 启用 AI 整理 | — |
| `PODFLOW_LLM_PROVIDER` | LLM 提供方（`gemini` / `openai_compatible` 等） | `gemini` |
| `PODFLOW_LLM_API_BASE` | LLM base URL（gemini 留空自动填 OpenAI 兼容端点） | 空 |
| `PODFLOW_LLM_MODEL` | 模型名 | `gemini-2.5-flash` |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `PODFLOW_LLM_API_KEY` | Gemini key（运行时读取，不落盘） | — |
| `PODFLOW_LLM_API_KEY_ENV_VAR` | 自定义 key 环境变量名 | — |
| `PODFLOW_TTS_ENGINE` | TTS 引擎（`edge-tts` 免费 / `doubao_tts` 付费） | `edge-tts` |
| `PODFLOW_TTS_VOICE` | 音色 | `zh-CN-XiaoxiaoNeural` |
| `PODFLOW_DOUBAO_APP_ID` / `PODFLOW_DOUBAO_ACCESS_TOKEN` | 豆包凭证（可选） | — |
| `PODFLOW_FETCH_SOURCES` | 数据源（逗号分隔：`newsnow,ai_news_daily`） | 全部源 |
| `PODFLOW_NEWSNOW_SOURCE_IDS` | NewsNow 子源 ID | 默认子源 |

密钥一律通过环境变量注入，运行时由 `protocol.llm_runtime` 解析，**不会写入 workflow state**。

## Gemini 接入

1. 到 [Google AI Studio](https://aistudio.google.com) 创建 key（`AIza...`，免费、无需信用卡）。
2. 设置环境变量 `GEMINI_API_KEY=<key>`。
3. `PODFLOW_LLM_PROVIDER=gemini`（默认）时，`api_base` 自动指向
   `https://generativelanguage.googleapis.com/v1beta/openai`。

免费额度约 15 RPM / 每天数百次请求，一期节目的选题 + 写作调用量远在额度内。
注意：免费 tier 的 prompt 可能被 Google 用于产品改进，敏感内容请勿使用。

## 本地运行

```bash
# 指定主题
PODFLOW_TARGET_TOPIC="AI 芯片" \
GEMINI_API_KEY=AIza... \
node scripts/python313.js scripts/run_auto_episode.py --output out/auto-episode

# 不指定主题 → 热点聚类选题
GEMINI_API_KEY=AIza... \
node scripts/python313.js scripts/run_auto_episode.py
```

产物位于 `out/auto-episode/`：`final.mp3`、`facts.json`、`script.*.json`、`state.json`、`run_report.json`。

## GitHub Actions

`.github/workflows/auto-episode.yml`：

- `schedule`：每天 UTC 00:00（北京时间 08:00）自动跑一期。
- `workflow_dispatch`：手动触发，可填 `target_topic`。

需要配置 secret：

| Secret | 说明 |
| --- | --- |
| `GEMINI_API_KEY` | 必填，Gemini 免费 key |

跑完上传 `podflow-auto-episode` artifact（mp3 + json）。

## 免费 TTS 说明

- `edge-tts` 由微软 Edge 免费提供、免 key，适合预览与试听。
- 免费服务无 SLA，偶发失败需重试；专名/数字发音可能不精确。
- 正式节目仍使用豆包 `zh_female_shuangkuaisisi_emo_v2_mars_bigtts`，配合发音预检与人工终审。
