# Agent 工作约定

本文件适用于 PodFlow Studio 仓库中的所有开发、排障、评审、文档与发布任务。
仓库允许多个 Agent 在同一工作区并行工作，但必须明确边界、保护已有改动，并串行执行 Git 写操作。

## 项目定位与技术栈

PodFlow Studio 是本地优先的 AI 新闻播客桌面工作台，主链路为：

```text
发现素材 → 整理与研究 → 事实卡片 → 口播稿 → 配音 / 录音 → 音频成片 → RSS / 发布包
```

主要技术栈与职责：

- Electron：桌面生命周期、IPC、Python/LLM/搜索进程编排与本地文件访问。
- React + TypeScript + Vite：发现、整理、写作、制作、发布及设置界面。
- Python 3.13：采集、研究、事实卡片、脚本、TTS、音频、审核和发布节点。
- JSON 状态契约：连接 Python 节点、Electron 主进程和 React UI。

关键目录：

- `electron/`：Electron 主进程、preload、IPC 与桌面服务。
- `src/`：React UI、TypeScript 服务、设置与前端类型。
- `nodes/`：按流水线阶段组织的 Python 节点。
- `protocol/`：共享状态、schema、manifest 与 LLM runtime。
- `tests/`：Python 单元、契约和端到端测试。
- `scripts/`：开发启动、验收、demo 与发布校验脚本。
- `docs/`：并行开发、设计系统、编辑规范和验收报告。
- `examples/demo-news/`：无需外部密钥的离线完整链路。
- `out/`、`dist/`、`tmp/`：运行或构建产物，不作为源代码编辑。

## 开源协议与归属信息（强制）

本项目采用 GNU Lesser General Public License v3.0，SPDX 标识为
`LGPL-3.0-only`，以根目录 `LICENSE`、`package.json`、
`package-lock.json`、`pyproject.toml` 和 `README.md` 为准。

项目规范仓库地址为：

- `https://github.com/liuminxin45/podflow-studio`
- `https://github.com/liuminxin45/podflow-studio.git`
- `github.com/liuminxin45/podflow-studio`

必须遵守：

- 保留 `LICENSE` 全文及所有 LGPL-3.0-only 声明。
- 保留 README、包元数据、发布配置中的项目名称、仓库地址、主页、问题追踪和归属信息。
- 第三方依赖、图标、字体、模型或示例数据的许可证归其各自权利人所有，不得改写为本项目许可证。
- 打包和发布时确保许可证文件随源代码或发行物提供。

明确禁止：

- 未经用户明确授权，删除、替换、弱化或规避 LGPL 声明。
- 在重构、文档精简、脱敏、生成代码或更新包元数据时顺手删除归属信息。
- 将第三方许可证批量替换为 LGPL，或删除第三方 NOTICE/版权声明。
- 仅修改一处许可证字段，造成 README、Python 和 npm 元数据互相冲突。

若用户要求修改许可证或仓库归属，必须先说明当前许可证与受影响文件；只有在用户明确授权后才能统一修改，并检查全部声明面。

## 开始任务前（强制）

1. 执行 `git status --short --branch` 和 `git diff --name-only`。
2. 将已有未提交改动视为用户或其他任务的工作，禁止覆盖、回滚、移动或顺手提交。
3. 阅读本文件；跨模块或共享契约任务还必须阅读 `docs/parallel-development.md`。
4. 选择且只选择一个主 workstream，并声明预计修改的文件范围。
5. 检查目标文件的调用者、消费者和测试；编辑前再次读取该文件的最新内容。
6. 若目标文件已有并行改动或职责重叠，先缩小边界或协调，不得以覆盖方式解决冲突。

`package.json`、lockfile、共享 schema、公共类型、Electron IPC 和全局配置均属于高冲突面，默认串行修改。

## Workstream 与所有权

### Contract / Protocol

- 范围：`protocol/state.py`、`protocol/manifest.py`、
  `protocol/episode_models.py`、`protocol/schemas/**`、
  `src/types/workflow.ts`、流水线顺序与跨语言状态。
- 输出：唯一且可验证的当前状态契约。
- 最低验证：`npm run verify:config`、相关 schema 测试、`npm run build`。

### Discover / Organize

- 范围：`nodes/fetch/**`、`nodes/preprocess/**`、来源适配器、去重与来源归一化。
- 输出：`fetch_contents`、`cleaned_contents` 及可追踪来源信息。
- 最低验证：来源/节点定向测试、`npm run verify:nodes`。

### Ideation / Writing

- 范围：`nodes/research/**`、`nodes/topic_selection/**`、
  `nodes/facts/**`、`nodes/script/**`、`src/services/writing/**`、
  `src/components/writing/**` 及整理研究服务。
- 输出：`researched_contents`、选题、`FactCard`、`script` 和 `edited_script`。
- 最低验证：相关 Vitest/Pytest、`tests/test_morning_news_pipeline.py`。

### Produce

- 范围：`nodes/tts/**`、`nodes/audio_postprocess/**`、
  `nodes/assets/**`、`src/components/SoundStudio.tsx`、
  `src/components/soundStudio/**`。
- 输出：语音片段、录音片段、`audio_outputs`、封面与最终音频。
- 最低验证：音频节点测试、离线 mock TTS、晨间新闻流水线测试。

### Review / Publish

- 范围：`nodes/review/**`、`nodes/publish/**`、RSS 校验、发布包和运行报告。
- 输出：`review_summary`、`publish_outputs`、`run_report`。
- 最低验证：review/publish/RSS 定向测试；发布变更运行 `npm run demo:news`。

### Desktop / Frontend Integration

- 范围：`electron/**`、`src/components/**`、设置仓库、IPC 和工作流 UI 状态。
- 输出：可靠的桌面编排、持久化、错误反馈和交互状态。
- 最低验证：相关 Vitest、`npm run build`；跨页面流程视风险运行 `npm run acceptance:cdp`。

### QA / Release

- 范围：`tests/**`、`scripts/**`、`docs/acceptance/**`、CI、版本和发行元数据。
- 输出：回归测试、验收证据、构建与发布门禁。
- 最低验证：与改动相称的最高可行门禁，不能用局部成功冒充全链路成功。

跨 workstream 修改必须有明确理由。若必须修改共享契约，Contract / Protocol 为主 workstream，并在交接中列出全部受影响消费者。

## 当前契约优先（强制）

本项目只维护一个明确的当前实现。除非用户明确要求迁移旧数据，否则不得引入：

- 旧字段别名、双字段读写或新旧分支并存。
- 静默迁移、静默补默认值或吞掉未知状态字段。
- “临时兼容” fallback、旧节点名称、旧产物路径或已废弃配置。
- 解析失败后把不完整结果伪装为成功。

替换契约时必须一次完成：

1. 更新 Python schema、模型和生产者。
2. 更新 Electron runner、IPC 与持久化边界。
3. 更新 TypeScript 类型、guards、React 消费者。
4. 更新配置示例、测试、demo 和必要文档。
5. 在边界明确拒绝旧 shape，并给用户可理解的错误原因。
6. 扫描旧字段、旧常量、旧路径和旧测试夹具，确认无生产残留。

共享契约高风险文件：

- `protocol/state.py`
- `protocol/manifest.py`
- `protocol/episode_models.py`
- `protocol/schemas/**`
- `src/types/workflow.ts`
- `electron/workflowRunner.js`
- `electron/main.js`
- `electron/preload.js`
- `config.example.yaml`
- `constitution.md`

禁止在没有契约级任务时重命名或删除状态键、节点、配置字段、IPC payload 或输出产物。

## 开发与文件操作规则

- 只编辑当前任务负责的文件和代码区域，不做无关格式化、重命名或批量清理。
- 一个文件同一时间只由一个任务负责；冲突无法安全拆分时暂停并协调。
- 不执行 `git reset --hard`、`git checkout --`、`git restore`、`git clean` 或工作区级 `stash` 来处理并行改动。
- 不删除、覆盖 `out/` 中的用户工作流、录音、音频或发布产物，除非用户明确指定精确目标。
- 不手工编辑生成的验收报告、schema 产物、lockfile 派生区或构建输出来伪造通过。
- 不把 `.env`、API Key、Cookie、token、私人工作流、录音、媒体产物、缓存或大体积截图提交进仓库。
- 外部 LLM、搜索、TTS、RSS 发布等 live 测试可能消耗额度或改变外部状态；执行前确认任务授权和凭据条件。
- 错误、超时和降级必须保留真实原因，不得把失败包装成成功或仅用瞬时 toast 隐藏。

## 测试与验证

先运行最窄的相关测试，再按风险扩大验证面。常用命令：

```bash
npm run lint
npm run lint:py
npm run build
npm run test:run
npm run verify:build
npm run verify:offline
npm run demo:news
npm run acceptance:cdp
node scripts/python313.js -m pytest tests/<target>.py -q
```

验证要求：

- TypeScript/React 改动至少运行相关 Vitest 与 `npm run build`。
- Python 节点改动至少运行相关 Pytest、配置或节点校验。
- IPC/工作流持久化改动必须检查 Electron 主进程与 React 两端消费者。
- 状态契约改动必须运行 schema 测试，并检查 Python、Electron、TypeScript 消费闭包。
- 发布链路改动优先运行 `npm run demo:news`；公网与真实 Provider 测试需单独报告条件。
- UI 主路径变更视风险运行 CDP 验收，并区分启动成功、流程成功和外部凭据失败。
- 无法运行的检查必须在交接中写明原因，不能省略不报。

完整集成门禁：

```bash
npm run lint
npm run lint:py
npm run build
npm run test:run
npm run verify:offline
npm run demo:news
```

## Git 提交规范（强制）

阶段性任务完成、验证通过且无明显半成品后，默认创建一个独立提交；用户明确说“先别提交”或任务仅要求诊断/评审时除外。默认不 push，只有用户明确要求才推送。

提交前：

1. 重新检查 `git status --short --branch`、`git diff`、`git diff --cached` 和最新 `HEAD`。
2. 只暂存当前任务文件；使用 `git add <明确路径>` 或精确 hunk。
3. 禁止使用 `git add .`、`git add -A` 将并行改动整体收入提交。
4. 检查暂存差异中的密钥、个人数据、媒体、构建缓存与无关文件。
5. Git 写操作必须串行；同一时间只允许一个任务执行 add、commit、merge、rebase 或 push。

Commit subject 使用仓库现有风格：

```text
<Workstream>: <concise English summary>
```

例如：

```text
Produce: stabilize clip-based audio assembly
Desktop: persist organize progress diagnostics
Docs: align agent contribution rules
```

正文说明问题、方案、影响和验证，不堆砌文件列表。禁止：

- 修改用户 Git config。
- 使用 `--no-verify` 绕过钩子，除非用户明确授权并说明原因。
- force push 到 `main`/`master`。
- amend、rebase 或重写不属于当前任务的提交。
- 擅自提交、删除或回滚其他任务的改动。

提交后再次执行 `git status`，确认只剩已知的其他任务改动。推送后核验本地 HEAD 与目标远端分支一致。

## 交接要求

每次最终交接必须包含：

- 使用的 workstream。
- 修改的文件。
- 实际运行的验证命令与结果。
- 跳过的检查及原因。
- 是否触及共享契约，以及检查过的下游消费者。
- 仍存在的风险、外部依赖或待人工确认事项。
- 若已提交或推送，提供 commit SHA 与远端分支；若未提交，明确说明。

局部测试通过只能报告局部完成；只有来源、消费者和最高可行集成门禁都闭环后，才能报告完整完成。
