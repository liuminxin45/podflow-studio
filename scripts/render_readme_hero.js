const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const CANVAS = { width: 1920, height: 1032 }

function readOption(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? '' : process.argv[index + 1] || ''
}

function requiredFile(name) {
  const value = readOption(name)
  if (!value) throw new Error(`Missing ${name} <path>`)
  const resolved = path.resolve(value)
  if (!fs.existsSync(resolved)) throw new Error(`${name} file does not exist: ${resolved}`)
  return resolved
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildHtml(inputPath) {
  const screenshot = fs.readFileSync(inputPath).toString('base64')
  const sourceLabel = escapeHtml(path.basename(inputPath))
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body {
      font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
      background: #d8d3ca;
      color: #20201e;
    }
    .desktop {
      position: relative;
      width: 2400px;
      height: 1290px;
      overflow: hidden;
      transform: scale(.8);
      transform-origin: top left;
      background:
        radial-gradient(circle at 22% 12%, rgba(255,255,255,.78), transparent 31%),
        radial-gradient(circle at 78% 82%, rgba(255,255,255,.48), transparent 30%),
        linear-gradient(132deg, #bcb6ad 0%, #ded9d1 32%, #efebe5 58%, #c9c3b9 100%);
    }
    .desktop::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: .22;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.16'/%3E%3C/svg%3E");
      mix-blend-mode: multiply;
    }
    .desk-mat {
      position: absolute;
      left: -150px;
      bottom: -170px;
      width: 840px;
      height: 560px;
      border-radius: 86px;
      transform: rotate(7deg);
      background: #282826;
      box-shadow: 0 34px 80px rgba(35, 32, 28, .28);
    }
    .paper {
      position: absolute;
      right: -70px;
      top: -180px;
      width: 720px;
      height: 590px;
      border-radius: 18px;
      transform: rotate(14deg);
      background: #f4f1eb;
      box-shadow: 0 24px 70px rgba(72, 65, 56, .17);
    }
    .paper::before, .paper::after {
      content: "";
      position: absolute;
      left: 90px;
      right: 90px;
      height: 2px;
      background: rgba(55, 52, 48, .10);
      box-shadow: 0 34px 0 rgba(55,52,48,.08), 0 68px 0 rgba(55,52,48,.08), 0 102px 0 rgba(55,52,48,.08);
    }
    .paper::before { top: 280px; }
    .paper::after { top: 430px; right: 250px; }
    .keyboard {
      position: absolute;
      left: 84px;
      top: 78px;
      width: 470px;
      height: 170px;
      padding: 18px;
      border-radius: 24px;
      transform: rotate(-7deg);
      background: #dedad3;
      border: 1px solid rgba(55,52,48,.13);
      box-shadow: 0 22px 55px rgba(68,62,55,.16);
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 9px;
    }
    .key {
      border-radius: 7px;
      background: #f2efea;
      border: 1px solid rgba(55,52,48,.09);
      box-shadow: 0 2px 0 rgba(55,52,48,.08);
    }
    .cup {
      position: absolute;
      right: 94px;
      bottom: 54px;
      width: 250px;
      height: 250px;
      border-radius: 50%;
      background: #d7d1c7;
      border: 22px solid #efebe5;
      box-shadow: 0 26px 65px rgba(63,58,52,.22), inset 0 0 0 3px rgba(43,41,38,.07);
    }
    .cup::before {
      content: "";
      position: absolute;
      inset: 31px;
      border-radius: 50%;
      background: radial-gradient(circle at 42% 34%, #aaa49a 0 5%, #514d47 22%, #2e2c29 68%, #171715 100%);
    }
    .cup::after {
      content: "";
      position: absolute;
      right: -74px;
      top: 65px;
      width: 92px;
      height: 88px;
      border: 20px solid #efebe5;
      border-left: 0;
      border-radius: 0 58px 58px 0;
    }
    .light {
      position: absolute;
      left: 48%;
      top: -430px;
      width: 980px;
      height: 2200px;
      transform: rotate(24deg);
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
      filter: blur(12px);
    }
    .window {
      position: absolute;
      left: 280px;
      top: 70px;
      width: 1840px;
      border: 1px solid rgba(28,28,26,.18);
      border-radius: 28px;
      overflow: hidden;
      background: #fbfbfa;
      box-shadow:
        0 60px 120px rgba(47,43,38,.28),
        0 18px 44px rgba(47,43,38,.20),
        0 2px 0 rgba(255,255,255,.72) inset;
    }
    .titlebar {
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      background: rgba(249,249,247,.97);
      border-bottom: 1px solid #e2e1dd;
    }
    .brand { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 650; letter-spacing: -.01em; }
    .mark {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: #fff;
      background: #242421;
      font-size: 14px;
      font-weight: 750;
    }
    .controls { display: flex; align-items: center; gap: 20px; color: #6b6964; }
    .control { width: 14px; height: 14px; position: relative; }
    .control.min::before { content: ""; position: absolute; left: 1px; right: 1px; top: 7px; height: 1px; background: currentColor; }
    .control.max { border: 1px solid currentColor; }
    .control.close::before, .control.close::after { content: ""; position: absolute; left: 7px; top: 0; width: 1px; height: 15px; background: currentColor; }
    .control.close::before { transform: rotate(45deg); }
    .control.close::after { transform: rotate(-45deg); }
    .screen {
      display: block;
      width: 100%;
      height: auto;
      background: #fff;
    }
    .source {
      position: absolute;
      right: 50px;
      bottom: 34px;
      color: rgba(43,41,38,.35);
      font-size: 13px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <main class="desktop">
    <div class="desk-mat"></div>
    <div class="paper"></div>
    <div class="keyboard">${'<span class="key"></span>'.repeat(24)}</div>
    <div class="cup"></div>
    <div class="light"></div>
    <section class="window">
      <header class="titlebar">
        <div class="brand"><span class="mark">P</span><span>PodFlow Studio</span></div>
        <div class="controls"><span class="control min"></span><span class="control max"></span><span class="control close"></span></div>
      </header>
      <img class="screen" alt="PodFlow Studio application screenshot" src="data:image/png;base64,${screenshot}">
    </section>
    <div class="source">Rendered from ${sourceLabel}</div>
  </main>
</body>
</html>`
}

app.commandLine.appendSwitch('force-device-scale-factor', '1')

app.whenReady().then(async () => {
  const inputPath = requiredFile('--input')
  const outputPath = path.resolve(readOption('--output') || 'readme-hero.png')
  const htmlPath = path.join(path.dirname(outputPath), '.readme-hero-render.html')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(htmlPath, buildHtml(inputPath), 'utf8')
  const window = new BrowserWindow({
    width: CANVAS.width,
    height: CANVAS.height,
    useContentSize: true,
    show: false,
    backgroundColor: '#d8d3ca',
    webPreferences: { offscreen: true },
  })
  await window.loadFile(htmlPath)
  const dimensions = await window.webContents.executeJavaScript(`Promise.all([
    document.fonts.ready,
    ...Array.from(document.images).map((image) => image.complete && image.naturalWidth > 0 ? Promise.resolve() : new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
    }))
  ]).then(() => ({ width: document.images[0]?.naturalWidth || 0, height: document.images[0]?.naturalHeight || 0 }))`)
  if (!dimensions.width || !dimensions.height) throw new Error('The CDP screenshot did not load in the renderer.')
  const image = await window.webContents.capturePage({ x: 0, y: 0, ...CANVAS })
  fs.writeFileSync(outputPath, image.toPNG())
  fs.rmSync(htmlPath)
  process.stdout.write(`${outputPath}\n`)
  window.destroy()
  app.quit()
}).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  app.exit(1)
})
