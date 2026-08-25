# PodFlow Studio 文档

本目录只维护与当前实现一致、对使用者或贡献者有长期价值的文档。一次性验收产物、
本机日志、截图和私人工作流不属于项目文档，不应提交到公开仓库。

## 使用与运行

- [CLI 参考](cli.md)：命令、退出码、会话目录、正式生产和 Agent 安全调用方式。
- [正式自动化](auto-episode.md)：本机生产阶段、GitHub Actions、凭据边界和发布权限。
- [验收产物](acceptance/README.md)：验收报告的默认位置、公开前的脱敏要求。

## 产品与质量规范

- [晨报音频生产规范](morning-news-audio-spec.md)：口播、时间线、混音、机器门禁和人工终审。
- [晨间新闻写作手册](editorial/morning-news-writing-playbook.md)：事实边界、节目结构和成稿门槛。
- [音乐风格发现规则](music-style-profiles.md)：候选音乐发现、授权核验和人工复核要求。
- [桌面端 UI 设计系统](desktop-ui-design-system.md)：当前视觉令牌、布局契约和防漂移验证。

## 协作与发布

- [并行开发手册](parallel-development.md)：多任务工作包、共享契约协调和集成门禁。
- [版本发布说明](releases/0.2.0.md)：与 Git tag 对应并由发布工作流直接消费的历史记录。

根目录的 `README.md` 负责产品概览和最短上手路径；本目录负责详细规则。代码、schema
和测试是可执行契约，文档不得另建与实现并存的旧版本或兼容分支。
