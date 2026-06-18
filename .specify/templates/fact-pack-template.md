# Fact Pack

## 1. 触发原因
- Trigger:
- second same-class fix risk:
- 已失败尝试:
- 当前症状:
- 不能继续猜测的原因:

## 2. 自动采集结果
- collect command:
- collected at:
- SdkConsumer log directory: `<system-temp>/SDKLog`
- SdkConsumer log pattern: `SDK_*.log`
- CoreRuntime/Bridge log directory: `<system-temp>/ServiceBridgeLog`
- CoreRuntime/Bridge log pattern: `ServiceBridge_*.log`
- Chrome debugging URL:
- chrome-devtools target:
- chrome-devtools selected target:
- direct CDP fallback:

## 3. 运行态事实
- DevTools MCP available:
- Correct Electron/HostApplication target confirmed:
- Current route/page:
- DOM subtree:
- computed style:
- box metrics:
- AI UI/UX self-validation supported:
- Screenshot comparison evidence:
- Simulated interaction evidence:
- Console errors/warnings:
- Screenshot or visual evidence:

## 4. 日志事实
- Latest SdkConsumer log:
- Latest SdkConsumer LastWriteTime:
- Latest SdkConsumer key lines:
- Latest CoreRuntime/Bridge log:
- Latest CoreRuntime/Bridge LastWriteTime:
- Latest CoreRuntime/Bridge key lines:
- Whether logs were generated after HostApplication exit:
- Timeline mapping to user actions:

## 5. 源码与产物事实
- Repository source files:
- Installed runtime plugin path checked:
- Build artifact path checked:
- UI hot deploy source output:
- UI hot deploy runtime target:
- UI hot deploy refresh action:
- UI hot deploy result:
- Source/runtime/build/install consistency:
- Changed files:
- Relevant code path:

## 6. 已确认事实、推断与排除项
- Confirmed facts:
- Inferences:
- Excluded alternatives:
- Remaining unknowns:

## 7. 下一步
- Fix target:
- Validation command:
- validation.md update:
- evidence.md update:
- Risk:
- Stop condition:

## 8. L5 证据衔接
- `fact-pack.md` records bounded investigation facts.
- `evidence.md` stores concrete command/log/runtime evidence used later by
  validation and acceptance.
- `validation.md` summarizes validation interpretation and routing impact.
- No validation claim is complete without a cited evidence artifact.

## 9. 事实层规则
- Do not use MCP for log files; read `<system-temp>/SDKLog\SDK_*.log`
  and `<system-temp>/ServiceBridgeLog\ServiceBridge_*.log` directly.
- Use chrome-devtools only for runtime DOM, console, computed style, and box
  metrics.
- Before a second same-class fix, run `speckit.fact-layer` and create or update
  this `fact-pack.md`.
