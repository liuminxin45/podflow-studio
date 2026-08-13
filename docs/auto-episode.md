# PodFlow 自动出片（CLI / GitHub Actions）

本文档说明如何在无桌面 UI 的环境（CLI / GitHub Actions）里自动生产一期播客。

## 定位：一条链路，显式门禁开关

生产链路只有一条，与桌面端、`produce` CLI 共用同一套节点。LLM（DeepSeek）和
TTS（edge-tts / 豆包）是可替换引擎，不是独立链路。

自动出片与正式发布**唯一**的区别，是人工终审门禁是否被显式跳过：

- 自动出片：`--skip-approval` 显式跳过人工终审，产物标记 `unreviewed: true` 自证未审。
- 正式发布：走 `produce` 三阶段 + 豆包付费配音 + 人工 SHA256 审批，门禁不变。

跳过审批是**显式参数 + 产物自证**，不依赖启动方式推断。`approve` 阶段保持人工，
只是允许显式跳过它。

## 环境变量

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `PODFLOW_TARGET_TOPIC` | AI 选题主题（留空则按热点聚类） | 空 |
| `PODFLOW_TIME_RANGE_HOURS` | 选题时效窗口（小时） | 24 |
| `PODFLOW_MAX_ITEMS` | 最多选取条目数 | 10 |
| `PODFLOW_AUTO_EXECUTE` | 自动执行模式（`1`/`true`） | 关 |
| `PODFLOW_ORGANIZE_MODE` | `ai` 启用 AI 整理 | — |
| `PODFLOW_LLM_PROVIDER` | LLM 提供方（`deepseek` / `openai_compatible` 等） | `deepseek` |
| `PODFLOW_LLM_API_BASE` | LLM base URL（deepseek 留空自动填 OpenAI 兼容端点） | 空 |
| `PODFLOW_LLM_MODEL` | 模型名 | `deepseek-chat` |
| `DEEPSEEK_API_KEY` / `PODFLOW_LLM_API_KEY` | DeepSeek key（运行时读取，不落盘） | — |
| `PODFLOW_LLM_API_KEY_ENV_VAR` | 自定义 key 环境变量名 | — |
| `PODFLOW_TTS_ENGINE` | TTS 引擎（`edge-tts` 免费 / `doubao_tts` 付费） | `edge-tts` |
| `PODFLOW_TTS_VOICE` | 音色 | `zh-CN-XiaoxiaoNeural` |
| `PODFLOW_DOUBAO_APP_ID` / `PODFLOW_DOUBAO_ACCESS_TOKEN` | 豆包凭证（可选） | — |
| `PODFLOW_FETCH_SOURCES` | 数据源（逗号分隔：`rss,newsnow,ai_news_daily`） | 全部源 |
| `PODFLOW_RSS_URLS` | 关键免密钥 RSS 源（逗号分隔），CI 的可靠基线 | 内置 ithome/solidot |
| `PODFLOW_NEWSNOW_SOURCE_IDS` | NewsNow 子源 ID | 默认子源 |

密钥一律通过环境变量注入，运行时由 `protocol.llm_runtime` 解析，**不会写入 workflow state**。

## DeepSeek 接入

1. 到 [DeepSeek 开放平台](https://platform.deepseek.com) 创建 key（`sk-...`）。
2. 设置环境变量 `DEEPSEEK_API_KEY=<key>`，可选 `DEEPSEEK_MODEL`（默认 `deepseek-chat`）。
3. `PODFLOW_LLM_PROVIDER=deepseek`（默认）时，`api_base` 自动指向
   `https://api.deepseek.com`（OpenAI 兼容端点）。

DeepSeek 按 token 计费、无免费额度，但单价低；一期节目的选题 + 写作调用量成本很低。
国内可直连，无需代理。

## 本地运行

```bash
# 指定主题
PODFLOW_TARGET_TOPIC="AI 芯片" \
DEEPSEEK_API_KEY=sk-... \
node scripts/python313.js scripts/run_auto_episode.py --output out/auto-episode

# 不指定主题 → 热点聚类选题
DEEPSEEK_API_KEY=sk-... \
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
| `DEEPSEEK_API_KEY` | 必填，DeepSeek key |
| `DEEPSEEK_MODEL` | 可选，默认 `deepseek-chat` |

跑完上传 `podflow-auto-episode` artifact（mp3 + play.html + json）。

### 数据源可靠性

NewsNow 公开实例与 AI 资讯 API 是第三方聚合源，在 GitHub Runner 上可能不可达或被限流，
导致 fetch 返回 0 条。因此自动出片以 **key-free RSS 源** 作为可靠基线（`PODFLOW_RSS_URLS`），
NewsNow / AI 资讯只作补充。`run_auto_episode` 在 fetch 为空时会重试一次，并在日志打印每个
阶段的条目数与 fetch 级错误，便于定位失败（`[stage] fetch: 0 items` 等）。

若 RSS 源也需替换，改 `PODFLOW_RSS_URLS` 为任意可达的公开 RSS/Atom 地址即可。

## 免费 TTS 说明

- `edge-tts` 由微软 Edge 免费提供、免 key，适合试听与自动出片。
- 免费服务无 SLA，偶发失败需重试；专名/数字发音可能不精确。
- 正式节目仍使用豆包 `zh_female_shuangkuaisisi_emo_v2_mars_bigtts`，配合发音预检与人工终审。
