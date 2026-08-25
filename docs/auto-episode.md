# PodFlow 正式自动化（CLI / GitHub Actions）

无桌面环境只维护一条正式生产路径：`podflow produce`。自动化负责生成和机器门禁，
正式发布始终保留与当前 MP3 SHA256 绑定的人工终审。完整命令参数、退出码和固定发布
资产以 [CLI 参考](cli.md) 为准；本文只说明自动化部署和权限边界。

## 本机阶段

正式生产按 `generate`、可选的 `render`、`approve`、`package` 和 `publish` 顺序执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1
npm run cli -- produce --stage generate --episode-id <yyyy-mm-dd> --output out/episodes --allow-paid-tts --json
npm run cli -- produce --stage approve --workflow <workflow.json> --audio-sha256 <sha256> --reviewer <name> --full-listen-confirmed --pronunciation-confirmed --editorial-final-confirmed --json
npm run cli -- produce --stage publish --workflow <workflow.json> --release-repo liuminxin45/podflow-morning-feed --site-repo liuminxin45/liuminxin45.github.io --confirm-publish --json
```

`generate` 从 RSS 发现开始，经博查研究、逐主张模型核验、LLM 选题与写作、
`editorial_quality_v1`、TTS、音频装配和机器审核生成候选成片。任一正式 Provider 缺失、
返回降级结果或质量门禁失败都会停止。`package --preview-only` 只豁免人工终审，输出无
RSS、无公开 URL 的内部预览；正式发布仍要求当前 MP3 的三项人工确认。

## 配置边界

正式自动化从进程环境读取以下配置，不得将值写入 workflow、运行报告、日志或 Artifact：

- 搜索：`PODFLOW_BOCHA_API_KEY`，以及可选的 `PODFLOW_BOCHA_API_BASE`。
- 写作：`PODFLOW_LLM_API_KEY`、`PODFLOW_LLM_PROVIDER`、`PODFLOW_LLM_MODEL`；
  `PODFLOW_LLM_API_BASE` 只允许配置 Ollama 本地服务。
- 语音：`PODFLOW_DOUBAO_APP_ID`、`PODFLOW_DOUBAO_ACCESS_TOKEN`。
- 来源：`PODFLOW_FETCH_SOURCES`、`PODFLOW_RSS_URLS`。
- 发布：`PODFLOW_PUBLISH_TOKEN`。

正式模式拒绝 deterministic 稿件、Edge/mock 音频和无来源结果。运行前还必须满足
[晨报音频生产规范](morning-news-audio-spec.md)中的机器门禁和人工终审要求。

## GitHub Actions

`Generate and Publish Episode` 仅支持 `workflow_dispatch`：

1. `generate` 安装 Node 22、Python 3.13、FFmpeg 和中文字体，运行正式 CLI。
2. 候选目录作为七天 Artifact 上传，run summary 显示当前音频 SHA256。
3. `publish` 等待受保护的 `podflow-production` Environment 人工批准。
4. 批准后记录该 SHA 的终审，上传并核验不可变 `podflow-morning-feed` Release。
5. Release 正式发布后发送 `podflow_release_published`，个人主页重新构建 RSS 与播放器。

密钥放入 Actions Secrets：`PODFLOW_BOCHA_API_KEY`、`PODFLOW_LLM_API_KEY`、
`PODFLOW_DOUBAO_APP_ID`、`PODFLOW_DOUBAO_ACCESS_TOKEN`、`PODFLOW_PUBLISH_TOKEN`。
非敏感 Provider、模型和来源配置使用 Actions Variables。

`PODFLOW_PUBLISH_TOKEN` 只授予 `podflow-morning-feed` Contents 写权限和触发
`liuminxin45.github.io` 部署所需权限。上传先进入 draft；8 个固定资产的大小和 GitHub
SHA256 digest 全部匹配后才转为正式 Release。失败的 draft 保留真实诊断，不触发主页。
