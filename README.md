# PodFlow Studio

PodFlow Studio 是一个本地桌面端 AI 播客工作台，用来把素材发现、整理、构思、脚本写作、音频制作和发布串成一条可恢复的节目制作流程。

启动方式：先准备 Python 3.13，然后安装依赖 `npm install`，首次使用 Python 节点前执行 `npm run setup:python` 创建本地 `.venv` 并安装 Python 依赖，再运行 `npm run dev` 启动 Vite 和 Electron；如需只启动前端或单独启动 Electron，可分别使用 `npm run dev:react` 和 `npm run dev:electron`。
