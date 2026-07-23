# Demo News Expected Output

Run:

```bash
npm run demo:news
```

The demo should finish without external network access or API keys. The default
`mixed` pack preserves the original fictional regression material. Two
source-verified packs are also included:

- `lifestyle-consumer`: seven recent public-service and consumer news cards.
- `ai-technology`: seven recent AI product and infrastructure news cards.

Run a specific pack with:

```bash
npm run demo:news -- --pack lifestyle-consumer
npm run demo:news -- --pack ai-technology
```

The seven-card packs demonstrate the recommended quick 6 plus deep 1
morning-news structure. The demo writes generated artifacts to
`examples/demo-news/output/`, including:

- `facts.json`
- `script.generated.json`
- `script.edited.json`
- `voice_segments/*.wav`
- `final.mp3` when ffmpeg is available, otherwise `final.wav`
- `audio_report.json`
- `feed.xml`
- `episode.json`
- `run_report.json`
- `dist/episodes/demo_morning_news_001/`

When `publish.public_base_url` is not provided, RSS is local-preview only and the run report records that warning.

`run_report.json` should include the template variant, recommended news count, actual news count, quick/deep segment counts, and any above/below-recommended count warning.
