# Quality Vision

## Scope

- Feature: 发现页采集列表管理与 AI 翻译
- Applies to: `src/components/DiscoverPanel.tsx` 及相关发现页状态、文案、按钮和列表标识
- Quality tier: `polished`
- Review state: `ready`

## Positive References

| Reference | What Is Good | Must Preserve |
|-----------|--------------|---------------|
| `src/components/DiscoverPanel.tsx` 现有 Ant Design 工具页 | 操作区、列表区、状态区已经是高密度工作流界面 | 保留 Ant Design 组件、紧凑信息密度和工作流优先结构 |
| 用户当前明确请求 | 明确指定删除、清空、失败明细和 AI 翻译行为 | 不扩展为整页视觉重设计，不新增无关入口 |
| `src/icons/antdCompat.tsx` | 项目已有 Ant Design icon 兼容层 | 新标识优先复用现有图标，不新增图标库 |

## Negative References

| Reference | Why Avoid |
|-----------|-----------|
| 营销页式 hero/card 重排 | 发现页是生产工具界面，重视觉改版会降低扫描效率 |
| AI-purple / decorative badges | 与现有产品语境无关，且会制造视觉噪声 |
| 对失败来源的臆造明细 | 会误导用户判断源站或网络问题，必须来自真实返回或接入层事实 |

## UI Baseline

Required for visual/UI parity unless explicitly owner-approved `N/A`.

| Baseline | Path / URL / Qt Source / Design Source | Required For | Status |
|----------|-----------------------------------------|--------------|--------|
| Existing DiscoverPanel source | `src/components/DiscoverPanel.tsx` | 操作区、列表、状态提示、按钮密度 | ready |
| Existing CSS tokens | `src/index.css` | 发现页状态区和操作按钮布局 | ready |
| Owner decision | 用户当前请求 | 删除和新增的 UI 行为、文案方向 | ready |

## Design Intent

- Style keywords: 工具化、紧凑、清晰、可追溯
- Color direction: 沿用现有 Ant Design 和项目 CSS 变量，不新增强烈色系
- Information density: 高密度，优先让采集结果和状态可扫描
- Interaction pattern: 显式按钮、Popover/Modal 明细、批量操作 loading/error、空状态禁用
- Copy/tone: 直接说明动作和状态，避免营销化表达

## Acceptance Notes

- Visual comparison method: 对照当前 DiscoverPanel 操作区，确认删除两个入口后布局不塌陷，新增按钮不换行，失败明细和翻译标识不遮挡主要内容。
- Runtime states to verify: 空列表、有列表、存在失败来源、有英文条目、无英文条目、AI 翻译 loading、AI 翻译失败、已翻译条目。
- Known gaps: 当前仓库未配置确定 E2E runner，UI 自动化如无法启动将记录人工验收路径。
