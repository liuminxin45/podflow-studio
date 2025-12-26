# podcast-bot

这是一个【可长期运行、可全自动、低成本、高质量】的 AI 播客“内容生产流水线”（非 Web App）。

它会按固定流程完成：

- 抓取 RSS 新闻（可扩展网页正文抽取）
- 自动筛选与去重（占位实现，可替换为向量相似度）
- 用 DeepSeek LLM 生成口语化播客脚本（SSML）
- 用 豆包 TTS 合成音频（异步提交 + 轮询骨架）
- 用 ffmpeg 做后期（片头/片尾/BGM/响度）
- 输出可发布的 mp3 + 元数据

项目强调：**幂等、可重试、可恢复、状态落库**，便于 cron / n8n 编排。

---

## 快速启动

### 1) 安装依赖

Python 3.10+

你还需要在系统里安装 `ffmpeg` 并确保命令行可用（`ffmpeg -version` 能输出版本）。

```bash
pip install -e .
```

如果你希望迁移到其它电脑并“一次性安装依赖”，也可以使用 `requirements.txt`：

```bash
python -m venv .venv
```

Windows 激活虚拟环境并安装依赖：

```bash
# PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# cmd.exe
.\.venv\Scripts\activate.bat
pip install -r requirements.txt
```

IDE/Pyright 的导入提示通常依赖于项目虚拟环境；本项目已在 `pyproject.toml` 中配置使用本地 `.venv`。

### 2) 准备环境变量

复制 `.env.example` 为 `.env` 并填写：

- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `LLM_PROVIDER`（默认 `moonshot`；如需使用 DeepSeek，设为 `deepseek` 并填写 `DEEPSEEK_API_KEY`）
- `MOONSHOT_BASE_URL`（可选，默认 `https://api.moonshot.cn/v1`）
- `MOONSHOT_API_KEY`（当 `LLM_PROVIDER=moonshot` 时必填）
- `MOONSHOT_MODEL`（可选，默认 `kimi-k2-turbo-preview`）
- 豆包 TTS 相关变量（如果你暂时不跑 TTS，可先留空）
- Metaso 网络调查相关变量（可选）

Kimi/Moonshot 使用 OpenAI-compatible 接口（`/chat/completions`）。安装依赖后，可用以下命令快速验证（会产生一次 API 调用）：

```bash
python -c "import os, json, requests; url=os.environ.get('MOONSHOT_BASE_URL','https://api.moonshot.cn/v1').rstrip('/')+'/chat/completions'; key=os.environ.get('MOONSHOT_API_KEY'); model=os.environ.get('MOONSHOT_MODEL','kimi-k2-turbo-preview'); payload={'model':model,'temperature':0,'messages':[{'role':'user','content':'你好，返回一个 JSON: {\\"ok\\":true}'}]}; r=requests.post(url, headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'), timeout=(10,60)); r.raise_for_status(); print(r.json()['choices'][0]['message']['content'])"
```

注意：本项目内的 `src/tts/doubao.py` 是“工程骨架”，已经按 **submit() + poll()** 的异步模式把参数、异常、重试/超时边界设计好，但你需要根据自己账号开通的豆包/火山引擎 TTS 接口版本补齐真实 endpoint 与签名。

豆包 TTS 支持多种模式，通过环境变量 `DOUBAO_MODE` 切换：

- **podcast**：PodcastTTS（多 speaker/生成式播客），使用 `wss://openspeech.bytedance.com/api/v3/sami/podcasttts`，资源 `volc.service_type.10050`
- **tts_v3_http**：单人朗读 TTS（官方 HTTP 单向流式：`https://openspeech.bytedance.com/api/v3/tts/unidirectional`），需要你在控制台开通的 **TTS 资源 ID**（不要用 10050）
- **tts_v3_ws**：单人朗读 TTS（WebSocket 单向流式：`wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream`），需要你在控制台开通的 **TTS 资源 ID**（不要用 10050）
- **voiceclone_http**：声音复刻（SpeakerID 音色）TTS（HTTP：`https://openspeech.bytedance.com/api/v1/tts`），使用 `X-Api-Key` + `S_` 开头的 `SpeakerID`
- **tts**：单人朗读默认模式，等同于 **tts_v3_http**

互斥与优先级规则：

- **模式互斥**：同一时刻只应启用一种 `DOUBAO_MODE`（`podcast` / `tts`/`tts_v3_http` / `tts_v3_ws` / `voiceclone_http`）。
- **资源 ID 互斥**：`volc.service_type.10050` 仅用于 `podcast`；单音色（TTS1.0/2.0）必须使用 `seed-tts-*` 或 `volc.service_type.10029/10048` 等。
- **语气提示优先级**：如果 `DOUBAO_TTS_V3_CONTEXT_TEXT` 非空，则忽略 `DOUBAO_TTS_V3_CONTEXT_TEXTS`；否则解析 `..._TEXTS` 并仅取第一条。

SSML（Universal SSML）规则与限制（来自官方文档）：

- **必须**：请求参数选择 `text_type=ssml`
- **必须**：所有文本放在唯一的 `<speak>...</speak>` 根元素内
- **不支持**：双向流式 API 目前不支持 SSML（因此不应使用双向相关 namespace）
- **长度建议**：使用 SSML 时（包含标签本身）建议不超过 150 字符，超过会显著提高 badcase 概率
- **标签支持差异**：不同模型/音色支持标签不同
- **特别注意**：`<break>` 仅适用于豆包语音合成模型 **1.0** 的音色，不适用于 **2.0** 音色（如 `seed-tts-2.0`）

最小配置（写进 `.env`）：

```bash
# 建议：让 .env 覆盖当前 shell 的环境变量（避免旧变量影响本次运行）
# 注意：如果你在 PowerShell 里显式设置了 DOUBAO_MODE，本项目会优先使用 PowerShell 的值（用于临时切换模式）。
DOTENV_OVERRIDE=1

# =============================
# 一键切换 TTS 模式
# =============================
# 只需修改这一行，即可切换 TTS 模式：
# - tts / tts_v3_http → 单音色 HTTP
# - tts_v3_ws        → 单音色 WebSocket
# - voiceclone_http  → 声音复刻（SpeakerID）
# - podcast          → 多人播客
#
# 模式专属配置会自动从以下文件加载（如果存在）：
# - .env.tts
# - .env.tts_v3_ws
# - .env.voiceclone_http
# - .env.podcast
# =============================
DOUBAO_MODE=tts

# =============================
# 各模式配置示例（可选：拆分到独立文件）
# =============================

# [示例] 单音色 HTTP（默认走 TTS1.0，可切换到 2.0）
# 推荐：将以下配置写入 .env.tts 文件
DOUBAO_TTS_V3_URL=https://openspeech.bytedance.com/api/v3/tts/unidirectional
# 版本切换（新增链路）：默认走 1.0
DOUBAO_TTS_VERSION=1
DOUBAO_TTS_V1_RESOURCE_ID=seed-tts-1.0
DOUBAO_TTS_V2_RESOURCE_ID=seed-tts-2.0

# 可选：按版本分别设置音色（避免 1.0/2.0 音色混用导致 resource mismatch）
# DOUBAO_TTS_V1_VOICE=...
# DOUBAO_TTS_V2_VOICE=...

# 如果你显式设置了 DOUBAO_TTS_V3_RESOURCE_ID（非空），会覆盖上面的 DOUBAO_TTS_VERSION 选择
# DOUBAO_TTS_V3_RESOURCE_ID=
# 如果你的脚本是 SSML（含 <speak> / <break> 等标签），可设置为 1 来强制按 SSML 处理
DOUBAO_TTS_V3_FORCE_SSML=1
# 官方要求：text_type=ssml（必须是字符串 ssml）
DOUBAO_TTS_V3_TEXT_TYPE_SSML=ssml
# [推荐：TTS1.0] 通过专用字段发送 SSML，避免网关把标签当普通文本朗读
DOUBAO_TTS_V3_SEND_SSML_FIELD=1

# 注意：<break> 不适用于 TTS2.0 音色；如需 <break> 停顿，请保持 DOUBAO_TTS_VERSION=1 或显式切换到 TTS1.0 资源

# 可选：语气/风格
# DOUBAO_TTS_V3_CONTEXT_TEXT=你的语气更欢乐一点，像播客主播一样自然
# DOUBAO_TTS_V3_EMOTION=happy
# DOUBAO_TTS_V3_EMOTION_SCALE=4

# 或 WebSocket 单音色（需要切换 DOUBAO_MODE）
# DOUBAO_MODE=tts_v3_ws
# DOUBAO_TTS_V3_WS_URL=wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream
# DOUBAO_TTS_V3_RESOURCE_ID=seed-tts-2.0
# DOUBAO_TTS_V3_WS_APP_KEY=aGjiRDfUWi

# 或 声音复刻（SpeakerID 音色，HTTP /api/v1/tts）
# 推荐：将以下配置写入 .env.voiceclone_http 文件
# 注意：请不要把你的真实 DOUBAO_VOICECLONE_API_KEY 提交到仓库；.env.* 文件已在 .gitignore 中排除。
 # DOUBAO_MODE=voiceclone_http
 # DOUBAO_VOICECLONE_URL=https://openspeech.bytedance.com/api/v1/tts
 # DOUBAO_VOICECLONE_API_KEY=...
 # DOUBAO_VOICECLONE_SPEAKER_ID=S_yiQKtNFN1
 # DOUBAO_VOICECLONE_CLUSTER=volcano_icl  # 或 volcano_icl_concurr
 # DOUBAO_VOICECLONE_STRIP_SSML=1
 # # Runtime controls (recommended defaults for ICL1.0)
 # DOUBAO_VOICECLONE_SPEED_RATIO=0.95
 # DOUBAO_VOICECLONE_RATE=24000
 # DOUBAO_VOICECLONE_LOUDNESS_RATIO=
 # DOUBAO_VOICECLONE_EXPLICIT_LANGUAGE=zh
 # DOUBAO_VOICECLONE_CONTEXT_LANGUAGE=
 # DOUBAO_VOICECLONE_SPLIT_SENTENCE=1
 # DOUBAO_VOICECLONE_EXTRA_PARAM=
 # # Chunking / retry tuning (to mitigate server RPC timeout code=3031)
 # DOUBAO_VOICECLONE_MAX_BYTES=300
 # DOUBAO_VOICECLONE_MIN_BYTES=80
 # DOUBAO_VOICECLONE_RETRIES=1
 # DOUBAO_VOICECLONE_RETRY_BACKOFF_SECONDS=1.0

# 或 PodcastTTS
# 推荐：将以下配置写入 .env.podcast 文件
# DOUBAO_MODE=podcast
# DOUBAO_WS_URL=wss://openspeech.bytedance.com/api/v3/sami/podcasttts
# DOUBAO_RESOURCE_ID=volc.service_type.10050
# DOUBAO_WS_APP_KEY=aGjiRDfUWi
# DOUBAO_WS_SEQUENCE=1

# 共享（单音色模式用）
DOUBAO_TTS_VOICE=zh_male_m191_uranus_bigtts

# 调试开关
DOUBAO_TTS_DISABLE_FALLBACK=1
DOUBAO_TTS_FORCE=0
```

Windows PowerShell 下也可以在命令行临时覆盖（不改 `.env`）：

```bash
$env:DOUBAO_MODE="tts"
$env:DOUBAO_TTS_V3_RESOURCE_ID="seed-tts-2.0"
$env:DOUBAO_TTS_VOICE="zh_male_m191_uranus_bigtts"
$env:DOUBAO_TTS_DISABLE_FALLBACK="1"
$env:DOUBAO_TTS_FORCE="1"
python run.py --max-items 1
```

#### 配置文件管理工具

项目提供了配置文件备份和恢复工具，方便迁移或管理多套配置：

**合并所有配置到单个备份文件：**
```bash
# 合并到 .env.backup
python scripts/merge_env.py

# 指定输出文件
python scripts/merge_env.py -o backups/env-20251218.backup

# 预览合并结果（不写入文件）
python scripts/merge_env.py --dry-run
```

**从备份恢复配置文件：**
```bash
# 恢复所有 .env* 文件
python scripts/split_env.py .env.backup

# 指定输出目录
python scripts/split_env.py .env.backup --output-dir /path/to/restore

# 预览拆分结果（不写入文件）
python scripts/split_env.py .env.backup --dry-run
```

**使用场景：**
- **迁移到新机器**：`merge` → 复制备份文件 → `split`
- **定期备份**：定期运行 `merge_env.py` 保存配置快照
- **快速切换环境**：保存多个 `.env.backup.*` 文件（如 dev/prod），随时切换

详细说明见 `scripts/README.md`。

Metaso 网络调查：设置 `METASO_API_KEY` 后，`fetch` 会在生成 `rss_filtered_*.json` 后调用 `metaso.cn/api/v1/chat/completions` 并产出 `rss_research_*.json`。

Metaso `MODEL` 可选值：

- **fast**（默认）
- **fast_thinking**
- **ds-r1**

可通过环境变量 `METASO_MODEL` 切换。

### 3) 修改 RSS

编辑 `config/settings.yaml`：

- `sources.rss` 下替换为你的 RSS

### 4) 放入音频素材

将以下文件放到 `assets/`：

- `intro.mp3`
- `outro.mp3`
- `bgm.mp3`

### 5) 一键跑完整流程

```bash
python run.py
```

日志和各步骤产物会按“每次运行”落盘到独立目录，便于审阅：

```
out/runs/<episode_date>/<run_id>/
  logs/
  fetch/
  script/
  tts/
  render/
  publish/
```

默认情况下，`script/tts/render/publish` 会自动复用同一天最近一次的 run 目录（如果你没有显式指定）。你也可以手动指定：

```bash
python run.py --run-id myrun
# 或者
python run.py --run-dir ./out/runs/2025-12-17/myrun
```

---

## 配置说明（settings.yaml）

- `channel`: 栏目元信息与风格
- `sources.rss`: RSS 列表
- `sources.newsnow`: NewsNow 聚合源列表（通过 `/api/s?id=...` 拉取）
- `sources.sixtys`: 60s API 数据源列表（通过 `/v2/60s` 拉取“每天 60 秒读懂世界”并拆成多条 items）
- `sources.lily_rss`: rss.lilydjwg.me 转 RSS 源列表（每条可 `enabled: false` 关闭，默认启用）
- `pipeline.max_items`: 抓取上限
- `pipeline.pick_items`: 生成脚本时选用条目数
- `deepseek.temperature`: LLM 温度
- `tts.voice`: 豆包音色
- `audio.*`: 片头/片尾/BGM 与音量
- `output.*`: 输出目录

---

## run.py 使用说明

### 选择配置文件

```bash
python run.py --config ./config/settings.yaml
```

### 指定日期

默认使用当天日期；你也可以指定日期（用于回放某一天的全流程）：

```bash
python run.py --date 2025-12-16
```

### 分步执行（step）

可选值：`all` / `fetch` / `script` / `tts` / `render` / `publish` / `list-items` / `list-fetch-health`

```bash
python run.py --step fetch
python run.py --step script
python run.py --step tts
python run.py --step render
python run.py --step publish
```

### 用网络调查结果生成脚本（script-input）

脚本生成阶段支持选择输入来源：

- `--script-input auto`（默认）：如果当天存在 `rss_research_content_*.json`，优先用网络调查结果；否则回退为 items
- `--script-input items`：只用 items（不依赖网络调查结果）
- `--script-input research`：强制使用网络调查结果（要求当天存在 `rss_research_content_*.json`）

LLM 默认使用 Kimi/Moonshot（见 `.env` 的 `LLM_PROVIDER`）；如需切换到 DeepSeek，设置 `LLM_PROVIDER=deepseek`。

示例：先抓取+网络调查，再用调查结果生成播客文案：

```bash
python run.py --step fetch --force-fetch
python run.py --step script --script-input research
```

### RSS 多实例自动切换（urls）

`sources.rss` 每条源除了 `url` 以外，也支持 `urls`（列表）。抓取时会按顺序尝试，**第一个成功的会被使用**，其余跳过。

这适合像 60s API 这种有多个公共实例、单一域名可能不稳定的场景。

```yaml
sources:
  rss:
    - name: "60s-每天60秒读懂世界(RSS)"
      enabled: true
      category: "others"
      urls:
        - "https://60s.viki.moe/v2/60s/rss"
        - "https://60api.09cdn.xyz/v2/60s/rss"
```

### 发现 NewsNow 可用数据源（list-newsnow-sources）

用于自动发现某个 NewsNow 实例支持哪些 `source_id`（内部会从官方仓库的 sources 清单获取候选列表，并对你的 `base_url` 做轻量探测验证）。

```bash
python run.py --step list-newsnow-sources
python run.py --step list-newsnow-sources --newsnow-base-url https://newsnow.busiyi.world
python run.py --step list-newsnow-sources --newsnow-limit 200
```

将输出里 `ok=Y` 的 `id` 填回 `settings.yaml`：

```yaml
sources:
  newsnow:
    - name: "NewsNow-自定义"
      id: "weibo"  # 例如：把 list-newsnow-sources 输出的 id 填到这里
      base_url: "https://newsnow.busiyi.world"
      count: 10
```

### 强制重新抓取（force-fetch）

同一天重复运行 `fetch` 会因为 episode 状态已是 `fetched` 而跳过；需要重新抓取时使用：

```bash
python run.py --step fetch --force-fetch
```

### 临时限制抓取条数（max-items）

运行时覆盖 `settings.yaml` 里的 `pipeline.max_items`，用于调试或快速验证：

```bash
python run.py --step fetch --force-fetch --max-items 1
```

### 抓取内容归档到文件（fetch archives）

每次执行 `fetch` 时，程序会把本次抓取到的条目（包含去重前与去重后）保存为一个文件：

- 文件名：`rss_YYYYMMDD_HHMMSS.json`
- 目录结构：按 `年/月/日` 自动分层
- 文件内容：JSON（UTF-8，便于后续检索/回放/调试）

如果你配置并启用了 Metaso 网络调查（见上文环境变量与说明），`fetch` 还会额外产出：

- `rss_research_YYYYMMDD_HHMMSS.json`：网络调查的完整结果（包含请求与原始返回 JSON 等元信息）
- `rss_research_content_YYYYMMDD_HHMMSS.json`：从网络调查返回中提取出的“干净版” JSON，包含 `content`、`citations`、`meta`（provider/model）

目录可在 `settings.yaml` 中配置：

```yaml
output:
  fetch_archives_dir: "./out/fetch_archives"
```

### 查看已抓取数据（list-items）

查看 SQLite 中已落库的 items（总数、未使用数、按 source 分组、以及最新 N 条）：

```bash
python run.py --step list-items
python run.py --step list-items --items-limit 30
python run.py --step list-items --items-source "NewsNow-知乎" --items-limit 20
```

打印每条 item 的 `summary/content`（默认截断 200 字，可调）：

```bash
python run.py --step list-items --items-show-content
python run.py --step list-items --items-show-content --items-text-limit 500
```

### 查看抓取健康情况（list-fetch-health）

用于检测哪些源抓取正常、哪些可能失效/超时（统计近 N 天的成功/失败，并列出最近的抓取尝试明细），同时会输出抓取内容的估算 token 规模，用于提前预防后续调用 LLM 时 prompt 过大：

```bash
python run.py --step list-fetch-health
python run.py --step list-fetch-health --health-days 30 --health-limit 200
python run.py --step list-fetch-health --health-only-failed
```

### 查看抓取健康趋势（list-fetch-health-trend）

按天聚合输出每个 source 的抓取趋势（总次数/失败次数/ok但0条/平均耗时/最大耗时/估算 tokens），便于快速定位“从哪天开始异常”：

```bash
python run.py --step list-fetch-health-trend
python run.py --step list-fetch-health-trend --health-days 30 --health-limit 500
```

### 结构化日志（JSON）与告警阈值

如需让日志更易被机器/LLM 再处理，可开启 JSON 日志：

```bash
set LOG_FORMAT=json
python run.py --step fetch --force-fetch
```

抓取阶段会在以下情况下输出 `WARNING`：

- `FETCH_WARN_DURATION_MS`：单次抓取耗时超过阈值（默认 15000ms）
- `FETCH_HEALTH_WARN_TOTAL_TOKENS`：单次抓取总 tokens 估算超过阈值（默认 20000）
- `FETCH_HEALTH_WARN_MAX_ITEM_TOKENS`：单条 item 最大 tokens 估算超过阈值（默认 8000）

---

## 一期播客完整流程（流水线解释）

`run.py` 是调度器，会顺序执行：

1. `fetch`: 从 RSS 拉取条目，落库到 `items`，并标记当天 `episode` 为 `fetched`
2. `script`: 从库里挑选未使用条目，调用 DeepSeek 生成结构化 JSON（Pydantic 校验）并写入 `episodes`，标记为 `scripted`
3. `tts`: 将 SSML 脚本提交给豆包 TTS（异步），轮询直到拿到音频（骨架完整，具体接口参数需你按账号开通情况补齐）
4. `render`: 用 ffmpeg 拼接 intro + 主音频 + outro，并混入 bgm，做响度归一化，输出 mp3
5. `publish`: 本地落地 + 元数据文件（RSS 发布为占位）

每一步都**幂等**：同一天重复执行不会重复生成；失败可重试，状态在 SQLite 里可追踪。

---

## 如何接入 cron / n8n

### cron

每天 8:30 运行：

```cron
30 8 * * * /usr/bin/python /path/to/podcast-bot/run.py >> /path/to/podcast-bot/out/logs/cron.log 2>&1
```

### n8n

- 用 Execute Command 节点
- 命令：`python run.py`
- 建议把 `--step` 参数拆分成多个节点（fetch/script/tts/render/publish），便于失败重试与告警

---

## 数据源说明

### RSS

`sources.rss` 直接写 RSS URL。

### NewsNow

`sources.newsnow` 通过 NewsNow 服务端接口拉取：`<base_url>/api/s?id=<source_id>`。

部分公共实例可能会对该接口做访问限制；如遇到 403，建议自建 NewsNow 并把 `base_url` 指向你的域名。

### LilyRSS（rss.lilydjwg.me 转 RSS）

`sources.lily_rss` 用于把网站链接/ID 转换为 RSS，再统一当作 RSS 抓取。

支持 `enabled` 开关：

- `enabled: false` 关闭该条
- 不写 `enabled` 或写 `true` 默认启用

注：请勿对 `rss.lilydjwg.me` 进行大量爬取；如有大量访问需求，请自行架设服务使用。

---

## 目录结构

```
podcast-bot/
├─ pyproject.toml
├─ .env.example
├─ README.md
├─ run.py
├─ config/
│  └─ settings.yaml
├─ src/
│  ├─ fetch/
│  ├─ script/
│  ├─ tts/
│  ├─ audio/
│  ├─ publish/
│  └─ store/
├─ assets/
└─ out/
   └─ runs/
      └─ <episode_date>/
         └─ <run_id>/
            ├─ fetch/
            ├─ script/
            ├─ tts/
            ├─ render/
            ├─ publish/
            └─ logs/
```

每次运行 `run.py` 时，会在 `out/runs/<episode_date>/<run_id>` 下生成一个新的目录，包含本次运行的所有中间结果和日志。可以通过 `--run-id` 和 `--run-dir` 参数指定运行 ID 和目录。

例如：

```bash
python run.py --step fetch --force-fetch --run-id my_run
# 或者直接指定完整 run 目录
python run.py --step fetch --force-fetch --run-dir ./out/runs/2025-12-17/my_run
```
