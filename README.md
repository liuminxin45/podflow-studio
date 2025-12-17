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
- **tts**：单人朗读默认模式，等同于 **tts_v3_http**

最小配置（写进 `.env`）：

```bash
# 建议：让 .env 覆盖当前 shell 的环境变量（避免旧变量影响本次运行）
DOTENV_OVERRIDE=1

# PodcastTTS
DOUBAO_MODE=podcast
DOUBAO_WS_URL=wss://openspeech.bytedance.com/api/v3/sami/podcasttts
DOUBAO_RESOURCE_ID=volc.service_type.10050
DOUBAO_WS_APP_KEY=aGjiRDfUWi
DOUBAO_WS_SEQUENCE=1

# 单人TTS
# DOUBAO_MODE=tts
# DOUBAO_TTS_V3_URL=https://openspeech.bytedance.com/api/v3/tts/unidirectional
# DOUBAO_TTS_V3_RESOURCE_ID=seed-tts-2.0
#
# 或 WebSocket:
# DOUBAO_MODE=tts_v3_ws
# DOUBAO_TTS_V3_WS_URL=wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream
# DOUBAO_TTS_V3_RESOURCE_ID=seed-tts-2.0
# DOUBAO_TTS_V3_WS_APP_KEY=aGjiRDfUWi

# 共享
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

日志在 `out/logs/`，产物在 `out/episodes/`。

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
   ├─ episodes/
   └─ logs/
```
