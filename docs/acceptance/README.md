# 验收产物

`npm run acceptance:cdp` 会在本目录生成 CDP 验收报告、运行结果和页面截图。这些文件用于本地排障和当次验收，不是长期维护的项目文档。

默认生成内容包括：

- `CDP_ACCEPTANCE_REPORT.md`
- `result.json`
- `acceptance-run.*.log`
- `screenshots/<timestamp>/*.png`

上述产物已由 `.gitignore` 排除。它们可能包含绝对本机路径、工作流标识、节目内容、录音路径或设置页面，因此不得直接提交到公开仓库。

需要公开验收结果时，应优先引用 CI 运行记录；确需发布截图或报告时，必须先删除本机路径、私人工作流、录音信息、凭据和无授权的第三方内容，并确认材料与当前版本一致。
