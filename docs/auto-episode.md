# PodFlow 正式自动化（CLI / GitHub Actions）

无桌面环境只维护一条正式生产路径：`podflow produce`。自动化负责生成和机器门禁，正式发布始终保留与当前 MP3 SHA256 绑定的人工终审。

## 本机三阶段

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1

npm run cli -- produce --stage generate --episode-id 2026-08-17 --topic "可选主题" --output out/episodes --allow-paid-tts --json
npm run cli -- produce --stage package --workflow out/episodes/2026-08-17/workflow.json --preview-only --output out --json
npm run cli -- produce --stage approve --workflow out/episodes/2026-08-17/workflow.json --audio-sha256 <sha256> --reviewer <name> --full-listen-confirmed --pronunciation-confirmed --editorial-final-confirmed --json
npm run cli -- produce --stage publish --workflow out/episodes/2026-08-17/workflow.json --release-repo liuminxin45/podflow-morning-feed --site-repo liuminxin45/liuminxin45.github.io --confirm-publish --json
```

`generate` 从 RSS 发现开始，经博查研究、逐主张模型核验、LLM 选题与写作、`editorial_quality_v1`、TTS、音频装配和机器审核生成候选成片。任一正式 Provider 缺失、返回降级结果或质量门禁失败都会停止。`--preview-only` 只豁免人工终审，输出无 RSS、无公开 URL 的内部预览；正式发布仍要求当前 MP3 的三项人工确认。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `PODFLOW_BOCHA_API_KEY` | 博查搜索密钥；只在进程环境读取 |
| `PODFLOW_BOCHA_API_BASE` | 可选博查兼容端点 |
| `PODFLOW_LLM_API_KEY` | LLM 密钥；只在进程环境读取 |
| `PODFLOW_LLM_PROVIDER` | `openai_compatible`、`deepseek` 等 |
| `PODFLOW_LLM_API_BASE` | OpenAI-compatible base URL |
| `PODFLOW_LLM_MODEL` | 正式写作模型名 |
| `PODFLOW_DOUBAO_APP_ID` | 豆包 BigTTS App ID |
| `PODFLOW_DOUBAO_ACCESS_TOKEN` | 豆包 BigTTS Access Token |
| `PODFLOW_FETCH_SOURCES` | 逗号分隔的数据源；默认 `rss` |
| `PODFLOW_RSS_URLS` | 逗号分隔的 RSS/Atom 地址 |
| `PODFLOW_PUBLISH_TOKEN` | 跨仓库创建 Release 和触发主页部署的细粒度 Token |

上述密钥不会写入 workflow、运行报告、日志或 Artifact。正式模式拒绝 deterministic 稿件、Edge/mock 音频和无来源结果。

## GitHub Actions

`Generate and Publish Episode` 仅支持 `workflow_dispatch`，输入节目 ID、可选主题和模型覆盖：

1. `generate` 安装 Node 22、Python 3.13、FFmpeg 和中文字体，运行正式 CLI。
2. 候选目录作为七天 Artifact 上传，run summary 显示当前音频 SHA256。
3. `publish` 等待受保护的 `podflow-production` Environment 人工批准。
4. 批准后记录该 SHA 的终审，上传并核验不可变 `podflow-morning-feed` Release。
5. Release 正式发布后发送 `podflow_release_published`，个人主页重新构建 RSS 与播放器。

仓库 Secrets：`PODFLOW_BOCHA_API_KEY`、`PODFLOW_LLM_API_KEY`、`PODFLOW_DOUBAO_APP_ID`、`PODFLOW_DOUBAO_ACCESS_TOKEN`、`PODFLOW_PUBLISH_TOKEN`。非敏感 Provider、模型、端点和 RSS 地址使用 Actions Variables。

`PODFLOW_PUBLISH_TOKEN` 只授予 `podflow-morning-feed` Contents 写权限和 `liuminxin45.github.io` dispatch 所需权限。上传先进入 draft；8 个固定资产的大小和 GitHub SHA256 digest 全部匹配后才转为正式 Release。失败的 draft 保留真实诊断，不触发主页。
