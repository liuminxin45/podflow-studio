# Auto-Podcast Studio

Auto-Podcast Studio 是一个面向播客创作者的桌面端 AI 工作台。它把“找选题、整理素材、构思结构、撰写脚本、生成语音、发布节目”串成一条可视化流程，让一次播客制作可以从热点和资料开始，逐步落到可听、可检查、可发布的成品。

项目由 Electron 桌面应用、React/Vite 前端和 Python 节点工作流组成。前端负责创作体验和状态展示，Electron 负责桌面壳、配置持久化与进程编排，Python 节点负责抓取、清洗、研究、写作、TTS、音频后处理和发布产物生成。

![主流程画布](docs/images/PixPin_2026-06-09_10-32-23.png)

## 主要能力

- 可视化六阶段工作流：发现、整理、构思、写作、制作、发布。
- 支持热点抓取、RSS/网页素材、手动素材输入和素材合并。
- 支持多模型配置，可按信息获取、文本生成、推理、合规、音频等能力配置不同 API。
- 提供创作台，把素材组织成主题、延伸讨论、背景补充等节目结构。
- 提供多智能体写作空间，用于分段撰写、润色、改写和整体优化。
- 提供声音工作台，用于选择声音风格、情绪浓度、语速、停顿节奏并生成音频。
- 提供发布中心，支持发布前审查和快速发布路径。
- 集成 TrendRadar 作为热点来源，通过独立桥接层读取缓存或实时抓取。

## 界面预览

### 创作台

在创作台中，可以从素材池选择内容，组织节目主题、延伸讨论和背景补充，并形成节目结构。

![创作台](docs/images/PixPin_2026-06-09_10-32-56.png)

### 写作协作

写作阶段提供分段编辑和 AI 协作角色，适合按开场、主线、延伸讨论、结尾等结构逐段打磨。

![写作协作空间](docs/images/PixPin_2026-06-09_10-33-14.png)

### 声音工作台

声音工作台用于选择智能声音或自定义声音，并调整声音性格、情绪浓度、语速和停顿节奏。

![声音工作台](docs/images/PixPin_2026-06-09_10-32-43.png)

### 发布中心

节目制作完成后，可以进入发布中心进行智能发布审查，或在内容已确认时直接快速发布。

![发布中心](docs/images/PixPin_2026-06-09_10-33-27.png)

### 设置中心

设置页用于配置搜索深度、语言偏好、文本处理模式、AI 能力接口和发布策略。设置保存在本机 Electron 用户数据目录，不会上传到服务器。

![设置中心](docs/images/PixPin_2026-06-09_10-33-38.png)

## 快速开始

### 环境要求

- Node.js 18 或更高版本。
- Python 3.8 或更高版本，推荐 Python 3.11。
- Windows、macOS、Linux 均可运行 Electron 开发模式；当前项目主要在 Windows 环境下调试。

### 安装依赖

```bash
npm install
```

安装过程会执行 `postinstall`：

```bash
python scripts/sync_trendradar.py
python -m pip install -e . -i https://pypi.tuna.tsinghua.edu.cn/simple
```

第一步会同步 `engine/trendradar`，第二步会以可编辑模式安装 Python 节点包。

### 启动应用

```bash
npm start
```

该命令等价于：

```bash
npm run dev
```

它会同时启动：

- `npm run dev:react`：启动 Vite 前端，默认地址为 `http://localhost:5173`。
- `npm run dev:electron`：等待 Vite 就绪后启动 Electron 桌面应用。

### CDP AI 调试与自验收

默认 `npm start` 不开启外部 CDP 调试端口。需要让 AI 或 Chrome DevTools 接入真实 Electron 页面时，使用：

```bash
npm run dev:cdp
```

该命令会启动 Vite 和 Electron，并让 Electron 在 `http://127.0.0.1:9222` 暴露 Chrome DevTools Protocol。它同时开启 fake media，便于调试录音链路：

```text
CDP_DEBUG=1
CDP_PORT=9222
CDP_FAKE_MEDIA=1
```

如果只想启动 Electron 侧 CDP，需要先保证 Vite 已运行，再执行：

```bash
npm run dev:electron:cdp
```

项目还提供内置 CDP AI 自验收入口：

```bash
npm run acceptance:cdp
```

该命令会先检查 `http://localhost:5173` 是否已有 Vite 服务：如果已有则复用，如果没有则自动启动 Vite。随后它会启动真实 Electron 应用，通过 `electron/acceptanceRunner.js` 接入 `webContents.debugger`，自动创建节目、写入脚本、模拟录音、运行音频处理和发布节点，并生成：

```text
docs/acceptance/CDP_ACCEPTANCE_REPORT.md
docs/acceptance/screenshots/<timestamp>/
```

常用环境变量：

| 变量 | 作用 |
| --- | --- |
| `CDP_DEBUG=1` | 开启外部 CDP 调试端口。 |
| `CDP_PORT=9222` | 指定 CDP 端口，默认 `9222`。 |
| `CDP_HOST=127.0.0.1` | 指定 CDP 监听地址，默认仅本机。 |
| `CDP_FAKE_MEDIA=1` | 使用 fake microphone 和自动授权，适合录音链路验收。 |
| `CDP_ACCEPTANCE=1` | 启动后自动运行内置 CDP 自验收。 |
| `CDP_ACCEPTANCE_QUIT=0` | 自验收结束后不自动退出 Electron。 |

## AI 项目知识包

仓库已挂载面向 AI 协作的项目知识包，用于让后续开发任务能快速理解架构边界、工作流状态、Electron/CDP 调试路径和常见工程约束。

主要入口：

| 路径 | 作用 |
| --- | --- |
| `AGENTS.md` | 仓库级 AI 协作入口，说明默认上下文和任务路由。 |
| `ai/knowledge/` | 已挂载的项目知识库，包含项目概览、模块图、接口约束、CDP 调试、动态配置和工作流运行时说明。 |
| `ai/rules/` | AI 编码规则、架构约束和工程原则。 |
| `ai/workflows/` | 任务路由和验收门禁配置，例如 `host-cdp`、`frontend-runtime-sync`。 |
| `.specify/` | spec-kit 工作区配置、模板、脚本、知识包生成记录和可复用能力。 |
| `.agents/` | 当前仓库内可直接调用的 spec-kit 技能入口。 |

知识包的当前挂载结果位于：

```text
ai/knowledge/index.yml
.specify/knowledge/materialized/ai/knowledge/index.yml
.specify/knowledge/packs/auto-podcast/knowledge-pack.yml
```

需要检查知识索引或重新验证知识包时，可以使用：

```powershell
powershell -ExecutionPolicy Bypass -File .specify/scripts/powershell/validate-knowledge-index.ps1
powershell -ExecutionPolicy Bypass -File .specify/scripts/powershell/validate-knowledge-pack.ps1
```

其中 `ai/knowledge/` 是给日常 AI 任务读取的“已挂载视图”，`.specify/knowledge/` 保留生成、备份、质量评估和包化记录。

### 构建

```bash
npm run build
npm run build:electron
```

`npm run build` 会执行 TypeScript 和 Vite 构建；`npm run build:electron` 会在前端构建完成后通过 Electron Builder 打包桌面应用。

## 配置方式

### 在应用内配置

推荐优先通过设置页配置 AI 能力、搜索策略、创作偏好和发布参数。Electron 会把节点配置保存到本机用户数据目录下的 `node-configs` 文件夹。

配置由 `electron/configManager.js` 管理，每个节点保存为独立 JSON 文件，例如：

```text
<Electron userData>/node-configs/fetch.json
<Electron userData>/node-configs/script.json
<Electron userData>/node-configs/tts.json
```

### 使用环境变量

需要接入 LLM 或兼容 OpenAI API 的模型服务时，可以在系统环境变量或本地 `.env` 中准备：

```env
OPENAI_API_KEY=your-api-key
OPENAI_API_BASE=https://api.openai.com/v1
```

各节点也支持在配置中单独设置 `api_key`、`api_base`、`llm_model` 等字段。字段留空时，Python 节点会回退读取环境变量。

### 使用 YAML 示例

仓库提供 `config.example.yaml` 作为节点配置示例，覆盖抓取、预处理、研究、选题、脚本、TTS、音频后处理、封面、存储和发布等环节。

```bash
copy config.example.yaml config.yaml
```

再按需调整 RSS 源、模型、声音、输出目录和播客元信息。

## 工作流说明

一次节目生成按六个阶段执行：

| 阶段 | 内部节点 | 作用 |
| --- | --- | --- |
| 发现 | `fetch`、`manual`、`merge` | 抓取热点/RSS/网页内容，接收手动素材，并合并为统一素材池。 |
| 整理 | `preprocess` | 清洗内容、去重、过滤低质量素材。 |
| 构思 | `research`、`topic_selection` | 补充研究信息，聚类和选择节目主题。 |
| 写作 | `script` | 生成或辅助编辑播客对话脚本。 |
| 制作 | `tts`、`audio_postprocess`、`assets` | 合成语音、拼接和响度标准化音频、生成封面等资产。 |
| 发布 | `review`、`publish` | 发布前审查，生成发布状态、RSS 或本地发布产物。 |

Electron 主进程通过 `runPythonNode()` 逐个启动 Python 子进程：

```text
Electron IPC
  -> python -m nodes.<node_name>
  -> 节点从 stdin 读取完整 state
  -> 节点向 stdout 输出 JSON state
  -> Electron 更新前端工作流状态
```

每个节点只通过共享的 `state` 交换数据，不直接依赖其他节点实现。这样可以保持节点独立，便于单独测试、替换或扩展。

## 实现原理

### 前端层

前端位于 `src/`，使用 React、TypeScript、Vite、Ant Design、React Flow 和 Zustand。核心职责包括：

- 展示六阶段流程画布和执行状态。
- 提供发现、整理、创作、写作、声音、发布等工作台界面。
- 通过 `electron/preload.js` 暴露的安全 IPC 与 Electron 主进程通信。
- 在设置页管理模型、搜索、音频、发布等能力配置。

### Electron 层

Electron 入口在 `electron/main.js`，核心职责包括：

- 创建桌面窗口并加载 Vite 或打包后的前端页面。
- 管理工作流生命周期和节点执行状态。
- 通过 IPC 提供 `workflow:create`、`workflow:get`、`workflow:approve`、`config:*`、`radar:*`、`trendradar:*` 等能力。
- 以子进程方式执行 Python 节点，避免前端阻塞。
- 在应用启动时根据配置启动 TrendRadar 守护进程。

### Python 节点层

Python 节点位于 `nodes/`，公共协议位于 `protocol/`。每个节点包含：

- `config.py`：节点配置，继承 `NodeConfigBase`。
- `node.py`：核心逻辑，导出 `run(state, config)`。
- `__main__.py`：命令行入口，负责 stdin/stdout JSON 协议。

节点通过 `PodcastState` 约定读写字段，例如 `raw_contents`、`cleaned_contents`、`selected_topic`、`script`、`stages`、`audio_segments`、`final_audio_path`、`rss_path` 等。

### TrendRadar 桥接层

TrendRadar 位于 `engine/trendradar`，作为外部热点引擎存在。Auto-Podcast 不直接改动 TrendRadar 代码，而是通过 `engine/bridge.py` 做隔离：

- 读取 TrendRadar 的平台配置。
- 调用 TrendRadar 的 `DataFetcher` 抓取热点。
- 优先读取 `engine/trendradar_data/latest.json` 缓存。
- 将热点结果转换成 Auto-Podcast `fetch` 节点可识别的统一素材格式。

这种设计让热点引擎和播客工作流保持边界清晰，后续也可以替换为其他数据源。

## 常用命令

```bash
npm start                 # 启动开发模式和 Electron
npm run dev:react         # 只启动 Vite 前端
npm run dev:electron      # 只启动 Electron，需 Vite 已就绪
npm run dev:cdp           # 启动 Vite + Electron，并开启 CDP 调试端口
npm run dev:electron:cdp  # 只启动带 CDP 调试端口的 Electron
npm run acceptance:cdp    # 启动真实 Electron 并执行 CDP AI 自验收
npm run build             # 构建前端
npm run build:electron    # 打包桌面应用
npm run verify            # 验证配置和节点
npm run test              # 运行节点与集成测试
npm run verify:nodes      # 验证所有节点结构
npm run verify:config     # 验证配置定义
npm run test:nodes        # 运行节点测试
npm run test:integration  # 运行集成测试
```

## 目录结构

```text
auto-podcast/
├── electron/              # Electron 主进程、预加载脚本、配置管理
├── engine/                # TrendRadar 桥接层、守护进程和缓存
├── nodes/                 # Python 工作流节点
├── protocol/              # 共享 state 和配置基类
├── scripts/               # 验证、同步和测试脚本
├── src/                   # React 前端
├── tests/                 # Python 测试
├── docs/                  # 架构文档和截图
├── config.example.yaml    # 节点配置示例
├── package.json           # Node/Electron 脚本和依赖
└── pyproject.toml         # Python 包和依赖
```

## 输出产物

默认输出路径由节点配置决定，常见目录包括：

- `out/audio_segments`：TTS 生成的分段音频。
- `out/episodes`：后处理后的节目音频。
- `out/assets`：封面等资产。
- `out/published`：本地发布目录。
- `out/rss`：RSS 输出目录。

这些目录通常属于运行产物，不建议提交到 Git。

## 开发约定

- 新增节点时，应在 `nodes/<name>/` 下提供 `config.py`、`node.py` 和 `__main__.py`。
- 节点之间不直接导入彼此代码，只通过 state 交换数据。
- 节点应捕获异常并写入 `state["errors"]`，同时把过程日志写入 `state["logs"]`。
- 配置字段应通过 Pydantic 描述默认值和校验规则，方便前端动态生成配置 UI。
- 敏感信息不要写入仓库，优先使用应用设置页、本机配置或环境变量。

## 常见问题

### 启动后没有窗口

先确认 Vite 是否启动成功：

```bash
npm run dev:react
```

浏览器打开 `http://localhost:5173`。如果前端正常，再单独启动 Electron：

```bash
npm run dev:electron
```

### Python 节点执行失败

先运行节点验证：

```bash
npm run verify:nodes
```

再确认 Python 版本和包安装：

```bash
python --version
python -m pip install -e .
```

### 模型列表拉取失败

检查设置页中的 API Base、API Key 和模型名称。兼容 OpenAI 的服务通常需要形如：

```text
https://api.example.com/v1
```

的 API Base，并且需要该服务支持 `/models` 或 `/chat/completions`。

### TrendRadar 没有数据

确认 `engine/trendradar` 已同步，应用启动日志中应看到 TrendRadar daemon 启动信息。也可以检查：

```text
engine/trendradar_data/latest.json
engine/trendradar_data/status.json
```

如果缓存不存在，`fetch` 节点会回退到实时抓取。

## License

MIT
