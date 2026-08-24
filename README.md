<div align="center">

![PodFlow Studio 0.2.0 — local-first AI podcast production workspace](readme-hero.png)

# PodFlow Studio

**本地优先的 AI 新闻播客制作工作台**

从素材发现、整理与事实卡片，到口播稿、配音、音频成片和 RSS 发布包，一条工作流完成一期节目。

**我们虽然追求全自动化，但不生产 AI 垃圾，只输出经过来源核验、编辑门禁、声音质检和人工终审的精品内容。**

[产品介绍](https://www.liuminxin.cn/works/podflow-studio) · [站内试听](https://www.liuminxin.cn/works/podflow-studio#episode-player) · [订阅 RSS](https://www.liuminxin.cn/podflow-studio/feed.xml) · [下载 Windows 0.2.0](https://github.com/liuminxin45/podflow-studio/releases/tag/0.2.0) · [查看源码](https://github.com/liuminxin45/podflow-studio)

</div>

## PodFlow Studio 是什么

PodFlow Studio 面向独立创作者和小型编辑团队，把每天重复的新闻播客生产流程放进一个统一的桌面工作台。默认节目品牌为 `PodFlow 晨报`，采用 6 条快讯加 1 条重点解读的 12 至 15 分钟结构；素材或来源不足时会阻断公开发布，不以无来源内容凑满时长。

它不是一个只会“生成文案”的聊天框。素材会沿着明确的编辑链路前进：先收集和整理来源，再形成事实卡片与可编辑稿件，最后进入配音、音频装配和发布。关键节点保留人工确认，来源与 AI 补充知识也会分开呈现。

自动化负责消除重复劳动，不负责替代编辑判断。任何来源不足、稿件未通过门禁、发音未确认、音频质量不合格或缺少人工终审的节目，都不能作为正式精品内容发布。

```text
发现素材 → 整理与研究 → 事实卡片 → 口播稿 → 配音 / 录音 → 音频成片 → RSS / 发布包
```

## 核心能力

- **发现素材**：从 RSS、网页、手动笔记、AI News Daily 和 NewsNow 聚合源采集内容，并按时效、主题和数量筛选。
- **AI 发现深度稿**：先由 AI 分析与网络研究判断事件的延展价值，再将高潜力选题标为深度稿并继续扩展证据，而不是依赖人工预先标注。
- **整理与研究**：围绕候选选题补充背景、管理参考来源，把网络证据与 AI 知识分开处理。
- **事实驱动写作**：先生成结构化 `FactCard`，再写出口播稿，减少原始素材直接进入生成提示带来的失真。
- **可编辑成稿**：保留生成稿和人工编辑稿；后续 TTS 始终优先使用已编辑版本。
- **可导演配音**：正式节目固定豆包“爽快思思多情感”，按 80 至 140 字、最多 2 句切分，并把情感、强度和分段语速真正传入 Provider；真人录音可替换任意片段。
- **自动成片**：片头与开场重叠、5 个快讯 sting、1 个深度 bridge、片尾与收束重叠；正文不持续铺底乐。成片固定 48 kHz、160 kbps、-16 LUFS ±1、真峰值不高于 -1 dBTP。
- **发布交付**：生成节目音频、`feed.xml`、节目元数据和运行报告，组装为可检查的发布包。
- **本地优先**：工作流和中间产物保存在本机；没有外部 API Key 也能运行完整离线 demo。
- **Agent 可验收**：内置会话隔离的 CLI、机器可读状态、CDP 端点、日志、截图与离线端到端验收。

## 安装

### Windows 安装包

从 [GitHub Releases](https://github.com/liuminxin45/podflow-studio/releases/tag/0.2.0) 下载 0.2.0 的 `.exe` 安装程序。当前安装包尚未进行商业代码签名，Windows SmartScreen 可能显示发布者提示。

### 从源码运行

#### 环境要求

- Node.js 22
- Python 3.13
- Windows 10 / 11（当前主要桌面开发与验证环境）

`npm install` 会按当前平台安装 PodFlow 使用的 FFmpeg，无需另外配置系统 FFmpeg。Python 依赖仍由 `npm run setup:python` 安装到项目 `.venv`。

```bash
git clone https://github.com/liuminxin45/podflow-studio.git
cd podflow-studio
npm install
npm run setup:python
npm run cli -- doctor
npm run dev
```

首次启动后，在「设置」中配置实际要使用的模型、搜索和语音服务。你不需要一次配置所有 Provider；只配置当前工作流需要的服务即可。

## 最快上手

如果想先确认完整链路是否可用，运行离线 demo：

```bash
npm install
npm run setup:python
npm run demo:news
```

这条路径不依赖外网、LLM Key 或 TTS Key。没有真实 TTS 时会生成 mock WAV，再由 npm 安装的 FFmpeg 完成音频处理并输出 `final.mp3`。若 npm 安装不完整，流程会明确失败并报告缺失的运行时依赖。

运行完成后，主要结果位于 `examples/demo-news/output/`：

```text
facts.json                 # 结构化事实卡片
script.generated.json      # AI / deterministic 生成稿
script.edited.json         # 可人工编辑的最终稿
final.mp3 或 final.wav      # 成片音频
feed.xml                   # RSS feed
run_report.json            # 运行结果、告警与降级信息
dist/episodes/<episode_id> # 完整发布包
```

## 使用方式

桌面端的每个区域只负责一类清晰任务：

1. **发现**：选择内容源和时间范围，查看来源级采集进度，由 AI 与网络研究先识别值得继续追踪的素材。
2. **整理**：收敛选题，将高潜力事件提升为深度稿，继续补充证据、背景和分析角度。
3. **成稿**：检查事实卡片和节目结构，编辑真正要播出的口播稿。
4. **制作**：为稿件分段生成语音，或替换为真人录音，然后自动装配最终音频。
5. **发布**：检查节目元数据、音频和警告，导出 RSS 与发布包。

默认 preset 为 `morning_news_brief`，公开节目固定“6 条快讯 + 1 条重点解读”，目标 14 分钟、允许范围 12 至 15 分钟。素材或独立来源不足时必须先补齐，不通过调整默认数量绕过公开门禁。

## CLI 与 AI Agent

PodFlow CLI 为人工操作和 AI Agent 提供同一套进程控制与验收入口。每个会话拥有隔离的数据、Electron profile、日志和验收产物；CDP 只绑定本机回环地址。

```bash
npm run cli -- doctor --json
npm run cli -- start --mode dev --session agent-demo --window hidden --cdp auto --json
npm run cli -- status --session agent-demo --json
npm run cli -- stop --session agent-demo --json
npm run acceptance:cdp
```

正式制作统一使用 v3 三阶段命令，`--workflow` 必须明确指定一期工作流，不会自动选择“最新一期”：

```powershell
npm run cli -- produce --workflow <id或绝对路径> --stage render --allow-paid-tts --json
npm run cli -- produce --workflow <id或绝对路径> --stage approve --audio-sha256 <sha256> --reviewer <name> --json
npm run cli -- produce --workflow <id或绝对路径> --stage package --output <showcase目录> --json
```

`render` 会先报告总字符、未缓存字符和调用片段数；存在未缓存的豆包片段时，缺少 `--allow-paid-tts` 会在首次外部调用前失败。`approve` 与 `package` 均绑定最终 MP3 SHA256，重新渲染会自动使旧审批失效。

### 音乐与授权

正式品牌 cue 派生自 Ondrosik 的 [Quick Spark](https://freemusicarchive.org/music/Ondrosik/no-words/quick-spark/)。[作者曲库](https://ondrosik.sk/music/)将曲目声明为 CC0；项目保存原始 SHA256、取得日期、裁剪区间与派生文件指纹。素材经裁剪、淡入淡出和响度处理，第三方音乐仍为 CC0，不改写为 LGPL。完整记录见 [音频权利文件](assets/audio/RIGHTS.md)。

命令、退出码、会话目录和 Agent 安全调用模式见 [CLI 文档](docs/cli.md)。

## 关键设计

### 事实卡片，而不是素材拼接

`FactCard` 是来源与稿件之间的事实层。写作节点消费经过整理的事实，而不是把网页原文直接拼进 Prompt。这样更容易检查每个结论来自哪里，也便于在成稿前修正。

### 人工编辑稿优先

系统同时保留生成稿和 `edited_script`。一旦存在人工编辑稿，TTS 和后续制作链路会优先使用它，避免重新生成覆盖已经确认的表达。

### 可解释的降级

外部模型或 TTS 不可用时，流程会尽可能产生可检查的替代结果，并把降级写入 `run_report.json`。FFmpeg 是由 npm 管理的必需运行时；缺失时会明确失败，不会把不完整发布包伪装成成功。

### 本地预览与公网发布分离

当 `publish.public_base_url` 为空时，生成的 RSS 仅供本地预览，并非公网可订阅 Feed。运行报告会明确给出这一警告。

### 导出公开节目包

正式节目统一通过 `produce` 三阶段命令渲染、指纹审批并导出站点包：

```bash
npm run cli -- produce --workflow <workflow> --stage render --allow-paid-tts --json
npm run cli -- produce --workflow <workflow> --stage approve --audio-sha256 <sha256> --reviewer <name> --json
npm run cli -- produce --workflow <workflow> --stage package --output <showcase-directory> --json
```

`package` 会生成 `episode.json`、`show-notes.md`、`transcript.vtt`、`chapters.json`、封面和质量报告。它只接受 `production_plan v3`、自动终审通过、最终 MP3 指纹一致的人工审批、非 mock 豆包音频、12 至 15 分钟黄金时长及完整来源。

官方样片只接受 `www.liuminxin.cn` 同域的静态音频。页面内使用浏览器原生播放器，不跳转 GitHub 或第三方播放器。

如果选择 GitHub Releases 托管音频，仓库仍提供显式发布脚本。脚本默认只打印计划；必须同时提供原始 `episode.json` 作为非 mock 音频证明，并添加 `--publish` 才会写入远端：

```bash
npm run showcase:publish -- --episode-id 2026-08-11 --audio <final.mp3> --notes <show-notes.md> --episode-json <episode.json>
```

已存在的日期型 Release 与站点节目目录都不会被覆盖。

## 配置

桌面端「设置」可以管理常用配置；仓库中的 `config.example.yaml` 展示了完整配置结构。密钥请放在本地环境或桌面端配置中，不要写入仓库。

当前可接入的能力包括：

- OpenAI-compatible LLM
- Edge TTS 与 OpenAI-compatible TTS
- RSS / 网页内容源
- AI News Daily 与 NewsNow 聚合源
- 可选搜索服务与人工笔记

## 开发与验证

```bash
npm run dev             # 启动 Vite + Electron 开发环境
npm run lint            # 检查 TypeScript、React 与脚本
npm run lint:py         # 检查 Python
npm run build           # TypeScript 检查并构建前端
npm run test:run        # 运行前端测试
npm run verify:offline  # 运行无需外部服务的校验
npm run demo:news       # 运行端到端离线示例
npm run acceptance:cdp # 运行隔离的 Electron/CDP 主路径验收
```

README 主图来自 Electron/CDP 离线验收捕获的真实素材发现界面，产品界面没有经过重绘。

项目主要由 Electron、React、TypeScript 和 Python 组成。Electron 负责桌面编排与 IPC，React 提供编辑工作台，Python 节点负责采集、研究、写作、语音、音频和发布流水线。

## Roadmap：0.3 → 1.0 收官计划

### 1. 项目最终定位

PodFlow Studio 不以成为 Descript、Adobe Audition 或通用 Podcast Studio 为目标。

项目定位固定为：

> **Local-first、Auditable、Human-in-the-loop 的 AI 新闻内容生产系统。**

核心场景：

> 一个普通用户能够使用 PodFlow，从当天新闻发现开始，在可追踪事实与人工终审约束下，稳定完成一档 12–15 分钟新闻播客并发布。

当前产品已经形成：

```text
Discovery
    ↓
Research
    ↓
Fact / Evidence / Claim
    ↓
Editorial Script
    ↓
Human Editing
    ↓
TTS / Recording
    ↓
Audio Assembly
    ↓
Quality Gate
    ↓
Human Approval
    ↓
Immutable Publish
```

因此后续版本不再以“功能数量”为主要目标。

---

### 2. North Star

PodFlow 1.0 是否成功，只看三个问题：

##### A. 能不能真的用？

非作者本人能否：

```text
安装
→ 配置
→ 获取新闻
→ 生成一期
→ 审核
→ 发布
```

而不需要理解源码。

##### B. 能不能长期用？

连续运行几十期后：

* 不因为一次 API 超时毁掉 Workflow；
* 不因为程序退出丢失进度；
* 不重复调用昂贵 Provider；
* 能知道哪里失败；
* 能恢复；
* 能追踪每一期生产情况。

##### C. 能不能证明它真的有效？

项目最终必须能够拿出：

```text
真实节目数量
生产成功率
平均生产时间
LLM / TTS 成本
失败率
人工修改量
Claim / Evidence 覆盖率
长期运行记录
真实用户反馈
```

---

### 3. Roadmap 总览

| 版本      | 核心目标    | 本质                              |
| ------- | ------- | ------------------------------- |
| **0.3** | 真正可用    | 从“作者能用”变成“用户能用”                 |
| **0.4** | 长期可靠    | 从 Workflow 变成 Production System |
| **0.5** | 内容质量可度量 | 从“感觉不错”变成“可以验证”                 |
| **0.6** | 外部用户验证  | 从个人项目变成真实开源产品                   |
| **0.9** | 工程证据化   | 把运行结果沉淀成作品证明                    |
| **1.0** | 收官      | 稳定、可复现、可展示，停止扩张                 |

---

### 4. v0.3 —— Daily Usable

#### 目标

> **让一个不是 PodFlow 开发者的人真正生产一期节目。**

这是当前最高优先级。

不是增加新能力，而是把现有能力真正串成用户产品。

---

#### P0：首次使用体验

目标：

```text
下载安装
    ↓
首次启动
    ↓
环境检测
    ↓
Provider 配置
    ↓
测试连接
    ↓
创建第一期
```

需要重点解决：

##### First Run Wizard

第一次启动明确告诉用户：

```text
① 选择 LLM
② 配置 Search Provider
③ 配置 TTS
④ 测试连接
⑤ 选择新闻源
⑥ 创建第一期
```

而不是让用户阅读 README 后自己理解整个系统。

---

##### Provider Doctor

每个 Provider 必须具有：

```text
Configured
Available
Authenticated
Model Available
Rate Limited
Failed
```

明确状态。

错误不能只显示：

```text
Request failed
```

而应该类似：

```text
DeepSeek
Authentication Failed

HTTP 401
API Key 无效或已失效

[重新配置]
```

---

#### P0：Workflow 状态可理解

用户必须随时能知道：

```text
这一期做到哪里了？
为什么停了？
接下来该干什么？
```

建议形成统一状态：

```text
DISCOVERING
RESEARCHING
FACT_CHECKING
WRITING
EDITING_REQUIRED
RENDERING
QC_FAILED
REVIEW_REQUIRED
READY_TO_PUBLISH
PUBLISHED
FAILED
```

UI、CLI 和内部 Workflow 使用同一事实源。

---

#### P1：降低配置成本

继续保持现在的 Local-first 和“无需全部配置 Provider”的设计。

仓库目前已经支持无需 API Key 的离线完整 Demo，并且真实工作流只要求配置当前需要使用的 Provider。

0.3 应强化这个优势。

最终应该做到：

```text
Demo Mode
      │
      ├── 无 Key
      └── 5 分钟理解 PodFlow

Production Mode
      │
      └── 配置真实 Provider
```

---

#### 0.3 验收条件

至少找 **1 个完全没有参与 PodFlow 开发的人**。

不给源码解释。

只提供：

```text
安装包
+
README / 用户指南
```

要求他完成：

> 从安装到生成一期 Preview。

记录所有：

* 卡住的位置；
* 看不懂的位置；
* 配置错误；
* UI 错误；
* 错误信息不足；
* 操作路径不明确。

##### 0.3 Definition of Done

```text
□ Windows 安装完成
□ 首次启动无开发环境要求
□ 10~15 分钟内理解核心流程
□ Provider 可以独立完成配置
□ 可以生成完整 Demo
□ 可以创建真实 Workflow
□ 用户知道每一步为什么失败
□ 非作者完成至少一期 Preview
```

---

### 5. v0.4 —— Production Reliability

这是整个 Roadmap 中**技术含金量最高的一版**。

目标：

> PodFlow 不只是“能跑通”，而是能够持续运行。

---

#### P0：Workflow Persistence

Workflow 必须成为真正的持久化状态机。

例如：

```text
Episode #20260824

Discovery       DONE
Research        DONE
FactCard        DONE
Script          DONE
TTS             4 / 7
Audio           WAITING
Review          WAITING
Publish         WAITING
```

软件关闭以后重新打开：

> 继续从 TTS 4/7 开始。

而不是重新生产一期。

---

#### P0：幂等

这是非常值得在简历中体现的工程能力。

例如：

```text
FactCard 已生成
→ 不重复调用 LLM

Segment 3 TTS 已生成
→ 不重复调用 TTS

Final MP3 SHA 未发生变化
→ Review 状态仍有效

Final MP3 改变
→ 自动 invalidate Review
```

你现在其实已经实现了最后这一点：审批绑定当前 MP3 SHA256，重新渲染后旧审批失效。

应该把这个原则推广到整个 Workflow。

---

#### P0：Retry

定义统一 Provider Retry Policy：

```text
429
5xx
Timeout
Connection Reset
```

例如：

```text
1s
↓
3s
↓
10s
↓
30s
```

然后 FAILED。

必须区分：

```text
RETRYABLE
NON_RETRYABLE
USER_ACTION_REQUIRED
```

---

#### P1：Cache

缓存：

```text
Web Fetch
Search
LLM Research
Fact Verification
Script
TTS Segment
```

Cache Key 至少考虑：

```text
input hash
provider
model
prompt version
config version
```

否则模型或 Prompt 更新以后会错误复用旧结果。

---

#### P1：Observability

每一期生成：

```text
RunReport
```

建议包含：

| 指标             |     示例 |
| -------------- | -----: |
| 总耗时            | 18m32s |
| Discovery      |    43s |
| Research       |  3m21s |
| LLM Calls      |     21 |
| Search Calls   |     17 |
| TTS Calls      |      7 |
| Retry          |      3 |
| Cache Hit      |    48% |
| Token          |    83K |
| Estimated Cost |  ¥2.31 |
| Final Duration | 13m42s |

---

#### P1：故障注入

不要只写 Happy Path Test。

主动测试：

```text
LLM Timeout
Search 429
RSS 无响应
TTS 第 4 段失败
FFmpeg Exit != 0
磁盘空间不足
程序强制退出
Workflow JSON 损坏
网络中断
```

确认：

> Workflow 可以进入合理状态，并且恢复。

---

#### 0.4 Definition of Done

```text
□ 任意节点可以失败
□ 已完成节点不会无意义重复执行
□ Workflow 可以重新加载
□ 程序退出后可以 Resume
□ Retry 有统一规则
□ Cache 有版本化 Key
□ Provider Failure 有明确分类
□ 每一期都有完整运行报告
□ 支持故障注入测试
```

---

### 6. v0.5 —— Measurable Quality

这一版停止继续“凭感觉调 Prompt”。

目标：

> **建立 PodFlow 自己的 AI 内容质量评价体系。**

---

#### 建立 Regression Dataset

例如保留 20–50 个历史新闻事件。

固定：

```text
source
evidence
fact card
claims
script
pronunciation
final audio
```

每次修改：

```text
Prompt
Model
Research Engine
FactCard
Editorial Rules
TTS
```

全部能够重放。

---

#### 重点指标

##### Evidence Coverage

例如：

```text
12 Claims
11 Supported
1 Unsupported

Coverage = 91.7%
```

---

##### Source Independence

不能：

```text
新华网
新浪转载新华网
网易转载新华网
```

然后认为存在三个独立来源。

需要识别：

```text
Independent Source Count
```

---

##### Editorial Drift

检查：

> Script 有没有超出 FactCard。

结构：

```text
Claim
↓
Fact
↓
Evidence
↓
Source
```

最终应该可以追踪。

这会成为 PodFlow 最有辨识度的能力之一。

---

#### TTS Regression

固定一批困难文本：

```text
英伟达
OpenAI
GPT-5
3.7%
2026 年 Q2
1.25 亿美元
API
GPU
英伟达 H200
```

Provider 或语音模型改变以后自动测试。

---

#### 0.5 Definition of Done

```text
□ 有固定 Regression Dataset
□ Claim Coverage 可统计
□ Source Independence 可统计
□ Editorial Drift 可检测
□ Prompt 变更可回归
□ Model 变更可对比
□ TTS 有 Pronunciation Regression
```

---

### 7. v0.6 —— External Validation

到这里开始**减少写代码，增加找用户**。

这是非常重要的边界。

---

#### 目标不是 Stars

Stars 可以看，但不是核心 KPI。

最重要的数据是：

```text
有多少人真的安装？
有多少人完成 Demo？
有多少人生产过一期？
有多少人生产第二期？
```

---

#### 建议目标

找到：

```text
5–10 个真实试用者
```

不需要几百人。

其中至少：

```text
3 人完成一期
1 人至少生产 3 期
```

这就已经非常有价值。

---

#### GitHub Issues 正式开放成产品反馈入口

目前仓库没有 Open Issue。

这说明现在代码已经公开，但**还没有形成公开用户反馈循环**。

0.6 要主动建立：

```text
Bug
Feature Request
Provider Problem
Content Quality
Installation Problem
```

Issue Templates。

---

#### 这一阶段才决定哪些 UX 功能值得加

例如用户连续抱怨：

> Provider 设置太麻烦。

那就做 Provider UX。

如果连续抱怨：

> 每天还得手动创建 Episode。

才考虑 Schedule。

如果没人需要多主播：

> 不做。

---

### 8. v0.9 —— Engineering Evidence

这一版基本不增加产品能力。

目标：

> **把整个项目转化成可以被面试官、GitHub 用户和潜在客户迅速理解的工程证据。**

---

#### Architecture Document

不要只是画：

```text
React → Electron → Python
```

要讲真正的问题。

例如：

##### Workflow

```text
              ┌── Discovery
              │
              ▼
Sources → Evidence → FactCard → Claims
                            │
                            ▼
                         Script
                            │
                       Human Edit
                            │
                            ▼
                           TTS
                            │
                       Audio QC
                            │
                            ▼
                         Review
                            │
                            ▼
                        Publish
```

---

#### Reliability Case Study

写一篇：

> **Building a Recoverable AI Production Workflow**

介绍：

```text
Retry
Idempotency
Caching
Persistence
Human Gate
Immutable Artifact
```

---

#### AI Engineering Case Study

再写：

> **Preventing Hallucination in AI News Production**

讲：

```text
Source
→ Evidence
→ Fact
→ Claim
→ Script
```

而不是宣传：

> “我们使用先进 AI。”

---

#### Benchmark

README 直接公开：

```text
30-Day Production Report
```

例如：

| Metric              | Result |
| ------------------- | -----: |
| Episodes            |     30 |
| Success             |     29 |
| Recovery            |      5 |
| Avg duration        | 14m13s |
| Avg generation time | 16m42s |
| Avg cost            |     ¥X |
| Claim coverage      |  97.2% |
| Manual script edits |   8.3% |
| Publish failures    |      0 |

数字必须来源于真实运行。

---

### 9. v1.0 —— Final Product

#### 1.0 不意味着功能很多

1.0 定义为：

> **核心目标已经经过真实运行验证，架构稳定，不再需要通过新增功能证明项目价值。**

---

#### 1.0 Release Gate

必须满足：

##### 产品

```text
□ 非作者可以安装
□ 非作者可以配置
□ 非作者可以完成一期
□ 有完整 Demo
□ 有清晰错误诊断
```

##### Reliability

```text
□ Workflow 可恢复
□ 节点执行幂等
□ Retry
□ Cache
□ Provider Failure Isolation
□ Production Report
```

##### Quality

```text
□ Fact / Evidence / Claim 可追踪
□ Regression Dataset
□ Content Quality Metrics
□ Audio QC
```

##### Reality

```text
□ 至少连续真实生产 30 期
□ 有真实 RSS
□ 有真实节目
□ 有外部用户实际运行
```

##### Engineering

```text
□ Architecture 文档
□ Testing Strategy
□ Reliability 文档
□ AI Quality 文档
□ Benchmark
□ CI/CD
□ Release Notes
```

---

### 10. Feature Freeze

以下功能原则上 **1.0 前禁止开发**。

除非真实用户数据证明必要。

```text
× 视频播客
× 多轨专业 DAW
× Podcast 播放器
× 手机 App
× Mac / Linux 大规模适配
× 多人实时协作
× 社交媒体运营系统
× 视频 Clip
× AI Avatar
× 多主播复杂编排
× Podcast Marketplace
× 云同步
× 用户账号系统
× 付费订阅
× SaaS Backend
```

理由：

这些东西都可以增加“功能数量”。

但不能明显增强：

```text
Reliability
Quality
Usability
Engineering Evidence
```

---

### 11. 新 Feature 的准入规则

以后任何新需求先问四个问题：

##### Q1

它是否解决真实生产中的问题？

##### Q2

是否有真实使用证据？

##### Q3

是否提升以下至少一个指标？

```text
Reliability
Quality
Usability
Observability
```

##### Q4

不做它，是否影响 1.0 North Star？

如果：

```text
NO
NO
NO
NO
```

直接拒绝。

---

### 12. 商业化 Gate

1.0 以前：

> **不建设 SaaS。**

只有出现以下信号之一才重新评估：

```text
≥ 20 个活跃真实用户

或

≥ 5 个用户主动询问 Hosted Version

或

≥ 3 个团队询问 Team / Private Deployment

或

有人明确愿意付钱解决某个重复问题
```

注意：

> “有人说这个项目不错”

不属于商业信号。

真正有效的是：

> “我愿意为这个功能付多少钱？”

---

### 13. 项目停止开发条件

这个条件非常重要。

当 PodFlow：

```text
完成 1.0
+
稳定运行 30~60 期
+
核心工程文档完成
+
真实用户完成验证
```

以后：

#### 进入 Maintenance Mode。

只做：

```text
Bug Fix
Dependency Update
Security
Provider Compatibility
重要用户问题
```

不再主动寻找功能。

---

### 14. 最终项目应该形成的资产

PodFlow 的最终价值不是代码仓库本身，而是五层资产：

```text
                         PodFlow
                           │
       ┌───────────────────┼──────────────────┐
       │                   │                  │
     Product            System            Evidence
       │                   │                  │
真实软件             AI Workflow        真实运行数据
真实节目             Reliability        Benchmark
真实用户             Human Gate         用户反馈
                           │
                       Engineering
                           │
                    Architecture
                    Testing
                    CI/CD
                    Observability
                           │
                        Career
                           │
                  简历 / 面试 / GitHub
```

最终简历价值来自最后两层。

---

### 15. 推荐实施优先级

现在不要同时做整个 Roadmap。

严格按照：

```text
现在
 │
 ▼
v0.3
真实用户完成一期
 │
 ▼
v0.4
连续生产可靠性
 │
 ▼
开始每天真实使用 PodFlow
 │
 ├──────────────┐
 ▼              ▼
v0.5           收集生产数据
质量评价
 │
 ▼
v0.6
外部用户
 │
 ▼
v0.9
工程证据整理
 │
 ▼
v1.0
收官
 │
 ▼
Maintenance
```

其中最关键的原则是：

> **从 0.3 开始，PodFlow 的 Roadmap 不再由“还能开发什么”决定，而由“真实生产暴露了什么问题”决定。**

## 当前边界

PodFlow Studio 当前优先保证“单人新闻早报”的完整闭环。以下方向仍属于次要或实验能力：

- 多主持人节目
- 长篇故事型播客
- 云端托管与一键发布到第三方平台
- 真实 TTS Provider 在所有网络环境下的生产级稳定性

它不是通用音频剪辑器、新闻 CMS 或海量数据源聚合平台。产品目标是让创作者用一条可检查、可编辑、可恢复的流程稳定完成节目。

## 开源协议

PodFlow Studio 采用 [GNU Lesser General Public License v3.0](LICENSE)，
对应 SPDX 标识为 `LGPL-3.0-only`。
