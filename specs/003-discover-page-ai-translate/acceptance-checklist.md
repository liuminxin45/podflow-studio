# Acceptance Checklist: Discover Page Fixed-Version Workflow and AI Translation

## 人类审核摘要

- **用途**: 用户最终验收发现页 5 项请求。
- **AI 已完成验证**: `tsc`, `py_compile`, `npm run build`, `npm install`。
- **人工重点**: 实际 Electron UI 可见按钮、清空交互、失败来源弹窗、AI 翻译结果。

## Checklist

- [ ] 发现页顶部不再显示 TrendRadar 更新检查按钮。
- [ ] 发现页顶部不再显示返回按钮。
- [ ] 有采集条目时，`清空当前采集` 能清空当前列表、选择状态、过滤条件和失败来源摘要。
- [ ] 没有采集条目时，清空操作不可用或不会造成异常。
- [ ] 有失败来源时，`查看明细` 可以打开明细弹窗。
- [ ] 失败来源弹窗展示来源 ID、名称/类型；没有具体错误原因时明确说明 TrendRadar v6.10 未提供。
- [ ] `翻译英文` 只处理纯英文且未翻译条目。
- [ ] 翻译成功后条目显示中文内容和 `已翻译` 标识。
- [ ] 已翻译条目仍能进入整理流程，URL、来源、标题、摘要字段可用。
- [x] 用户确认验收通过。

## Failure Path

任一项失败时，返回 `speckit-implement` 修复，再重新运行 validation 和本 checklist。
