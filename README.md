# face-landmarker-bench

Cross-platform browser benchmark for MediaPipe Face Landmarker. It measures all four execution combinations:

- Worker + GPU
- Worker + CPU
- Main thread + GPU
- Main thread + CPU

The benchmark uses `@mediapipe/tasks-vision@1.0.1` and Google's official Face Landmarker model. Runtime assets are downloaded from official Google endpoints and verified with pinned SHA-256 hashes before every build.

## Run locally

```bash
pnpm install
pnpm dev
```

For the Playwright smoke benchmark:

```bash
pnpm exec playwright install chromium
pnpm test -- --project=chromium
```

Run the full suite:

```bash
BENCHMARK_SUITE=full BENCHMARK_ITERATIONS=30 pnpm test:benchmark -- --project=chromium
```

## Scenarios

The smoke suite covers a 640×360 portrait and a synthetic no-face frame. The full suite adds:

- 320×180, 640×360, and 1280×720 inputs
- rotated and occluded portraits
- a synthetic two-face composite
- synthetic motion using the `VIDEO` API

Every run records initialization time, inference and end-to-end P50/P95/P99, observed face counts, landmark counts, browser details, and the WebGL renderer.

## CI reports

Pull requests run Chromium on Ubuntu, Windows, and macOS. Pushes, scheduled runs, and manual runs expand the matrix to Chromium, Firefox, and WebKit across all three operating systems.

Each matrix job uploads raw JSON. The report job combines those files into the `benchmark-report` artifact:

- `summary.md` — compact compatibility and performance tables
- `index.html` — standalone report for local viewing
- `results.json` — complete machine-readable aggregate

The Markdown summary is also written to the GitHub Actions Job Summary.

GPU timing is considered trustworthy only when the reported renderer is hardware-backed. SwiftShader, llvmpipe, and other software renderers remain useful for compatibility testing but are marked clearly in the report.

## Assets and licensing

MediaPipe is an Apache-2.0 project. The benchmark code is MIT licensed. Model and fixture files are not committed; the preparation script downloads them from Google at build time.

- [MediaPipe](https://github.com/google-ai-edge/mediapipe)
- [Face Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [Face Mesh V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf)
