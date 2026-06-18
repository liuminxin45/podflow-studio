# CDP Acceptance Report

- Status: PASS
- Started: 2026-06-18T08:46:10.291Z
- Ended: 2026-06-18T08:47:07.130Z
- Duration: 57s
- CDP transport: Electron webContents.debugger

## Steps

- PASS 读取首页 DOM: title=Auto-Podcast Studio
- PASS 创建 episode: workflowId=1781772387307, episodeId=ep_2026_06_18_08_46
- PASS 写作页保存脚本状态: stages=2
- PASS 真人录制与保存: path=E:\Neo\auto-podcast\out\recordings\ep_2026_06_18_08_46\cdp-stage-1_1781772398716.webm, blobSize=5197
- PASS 运行音频生成与 review: final_audio_path=out\episodes\ep_2026_06_18_08_46.mp3
- PASS 运行本地发布与 RSS 导出: rss=out/rss\feed.xml, dir=out/published\ep_2026_06_18_08_46

## Assertions

- PASS 首页 DOM 可读取: bodyLength=98
- PASS 未出现剪枝后的精简主路径: DOM 中不应包含剪枝标记
- PASS Electron API 已注入: window.electronAPI 必须存在
- PASS 媒体 API 可用: getUserMedia 与 MediaRecorder 必须存在
- PASS workflow:create 生成 episode_id: {"episodeId":"ep_2026_06_18_08_46","workflowId":"1781772387307"}
- PASS 写作状态已保存 script/stages: {"description":"通过 Electron CDP 自验收生成的测试节目","dialogue":[{"speaker":"Host A","text":"这是第一段 CDP 自验收脚本。"},{"speaker":"Host B","text":"这是第二段，用于确认 stages 与 script 会写入真实 workflow state。"}],"title":"CDP 验收节目"}
- PASS 真人录制 WebM 已保存: E:\Neo\auto-podcast\out\recordings\ep_2026_06_18_08_46\cdp-stage-1_1781772398716.webm size=5197
- PASS 录音段写入 workflow state: [{"duration_seconds":0.7,"id":"cdp-stage-1","mime_type":"audio/webm;codecs=opus","path":"E:\\Neo\\auto-podcast\\out\\recordings\\ep_2026_06_18_08_46\\cdp-stage-1_1781772398716.webm","segment_id":"cdp-stage-1","size":5197}]
- PASS final_audio_path 存在且文件大于 0: out\episodes\ep_2026_06_18_08_46.mp3 size=6764
- PASS review_summary 已生成: {"audio_metadata":{"duration_seconds":0.78,"file_size":6764,"format":"mp3","segments_count":1,"source_segments":["E:\\Neo\\auto-podcast\\out\\recordings\\ep_2026_06_18_08_46\\cdp-stage-1_1781772398716.webm"]},"checks":[{"level":"pass","message":"Audio file ready"},{"level":"pass","message":"Cover art ready"},{"level":"pass","message":"Title set"},{"level":"pass","message":"2 segments ready"}],"description":"通过 Electron CDP 自验收生成的测试节目","estimated_duration":7,"has_audio":true,"has_cover":true,"score":"4/4","segment_count":2,"title":"CDP 验收节目"}
- PASS rss_path 存在且文件大于 0: out/rss\feed.xml size=779
- PASS storage_info.base_dir 存在: out/published\ep_2026_06_18_08_46
- PASS publish_status 标记本地/RSS 成功: {"platforms":{"local":"success","rss":"success"},"published_at":"2026-06-18T08:47:03.434564+00:00","rss_generated":true,"rss_path":"out/rss\\feed.xml","storage_dir":"out/published\\ep_2026_06_18_08_46"}
- PASS 无前端 console error: - 无
- PASS 无 Runtime exception: - 无
- PASS 无 Network failure: - 无

## Screenshots

- E:/Neo/auto-podcast/docs/acceptance/screenshots/2026-06-18T08-46-10-291Z/01-home.png
- E:/Neo/auto-podcast/docs/acceptance/screenshots/2026-06-18T08-46-10-291Z/02-script-state.png
- E:/Neo/auto-podcast/docs/acceptance/screenshots/2026-06-18T08-46-10-291Z/03-recording-state.png
- E:/Neo/auto-podcast/docs/acceptance/screenshots/2026-06-18T08-46-10-291Z/04-publish-state.png

## Console Errors

- 无

## Runtime Exceptions

- 无

## Network Failures

- 无

## Failure Reasons

- 无
