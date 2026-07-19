# PodFlow Studio 图标资源包

本资源包包含两套**透明背景**单色图标：

- `light-theme`：黑色线条，适用于浅色背景。
- `dark-theme`：白色线条，适用于深色背景。

## 目录

- `app/`：Windows 软件主图标。
  - PNG：16、20、24、32、40、48、64、96、128、256、512、1024 px。
  - ICO：多分辨率文件，包含 16、20、24、32、40、48、64、128、256 px。
- `favicon/`：网站 favicon。
  - `favicon.ico`：16、32、48 px。
  - PNG：16、32、48、180、192、512 px。
- `tray/`：Windows / Electron 托盘图标。
  - PNG：16、20、24、32、40、48、64 px。
  - ICO：16、20、24、32、40、48、64 px。
- `source/`：可继续编辑的 SVG 矢量源文件。
- `preview/`：仅用于预览的合成图。预览图有背景，生产图标没有背景。
- `validation.json`：透明度、颜色和文件校验结果。

## 推荐使用

### Windows / Electron 主程序

使用：

- 浅色主题：`app/light-theme/PodFlow_Studio_light-theme.ico`
- 深色主题：`app/dark-theme/PodFlow_Studio_dark-theme.ico`

Windows EXE 通常只配置一枚主图标。若不能随系统主题动态切换，建议使用黑色线条版本；白色透明图标在资源管理器白色背景中可能不可见。

### Electron 托盘

根据系统主题动态选择：

- 浅色任务栏：`tray/light-theme/podflow-tray-light-theme.ico`
- 深色任务栏：`tray/dark-theme/podflow-tray-dark-theme.ico`

托盘图标为小尺寸重新简化的版本，不是直接机械缩小主图标。

### 网站 favicon

在 HTML 中可按主题加载：

```html
<link rel="icon" href="/favicon/light-theme/favicon.ico" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon/dark-theme/favicon.ico" media="(prefers-color-scheme: dark)">
```

## 透明度说明

生产 PNG 使用 RGBA；图标外部 Alpha 为 0。线条边缘保留抗锯齿所需的部分透明像素，这些像素属于线条边缘，不是背景色残留。图标外部没有白色、灰色或棋盘格像素。
