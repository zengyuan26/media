# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

An Electron desktop app called "自媒体创作助手" (Self-media Creator Assistant) — an AI-powered conversational content creation tool for short-video scripts, image-text posts, and long-form articles. v2.0.0.

## Commands

```bash
npm start          # Run the Electron app
npm run build:mac  # Build macOS DMG
npm run build:win  # Build Windows NSIS installer
npm run build      # Build both platforms
```

## Architecture

```
main.js          → Electron main process (trivial shell, ~30 lines)
index.html       → Entire app: CSS + HTML + JS (~1860 lines)
package.json     → Dependencies + electron-builder config
```

- **Single-file frontend**: All UI, styles, and app logic in `index.html`. No framework — vanilla JS.
- **No build step**: `index.html` is served directly. `main.js` just creates a BrowserWindow and loads it.
- **Main process**: window 1280x820, menu bar hidden, `nodeIntegration: false`, `contextIsolation: true`.

## Data flow

```
Sidebar UI → syncSidebarToSettings() → settings object → localStorage ("zimeiti-v2-settings")
                                                      → buildSystemPrompt() → API call
```

- `settings` is the single source of truth. All sidebar inputs sync to it eagerly on change.
- `saveSettingsToStorage()` persists it; `loadSettings()` restores on startup.
- `buildSystemPrompt()` reads `settings` to assemble a detailed system prompt with platform-specific formatting rules.

## Content type system

Three content types, each with distinct output templates baked into `buildSystemPrompt()`:

| Type | Key | AI tools targeted |
|------|-----|-------------------|
| 短视频脚本 | `short-video` | 即梦 (Jimeng) / 可灵 (Keling) |
| 图文内容 | `image-text` | 小红书 / 公众号, 豆包 / Midjourney / DALL·E |
| 长文写作 | `long-article` | (generic markdown output) |

Each type has platform-specific format requirements, shot/storyboard templates, tag strategies, and example outputs — all hardcoded in the system prompt builder.

## Key data structures (in `<script>`)

- `PERSONAS` — 6 persona profiles (auto/teacher/companion/foil/admirer/comedian), used to frame the AI's narrative voice
- `TOPIC_SCENARIOS` — topic scenarios nested under each content type (short-video/image-text/long-article), mapping topic types → persona recommendations → label + description. Used to render scenario cards in chat and seed the conversation flow.
- `DEFAULT_SETTINGS` — all settings defaults including API config (default endpoint: `https://api.deepseek.com/v1`)

## AI & web search integration

- **LLM API**: OpenAI-compatible `/chat/completions` endpoint, streaming via `fetch()` + ReadableStream. SSE lines parsed as `data: {...}` with `[DONE]` sentinel.
- **Web search**: `performWebSearch()` hits DuckDuckGo's auto-complete API (`duckduckgo.com/ac/`) for real user search suggestions. Triggers automatically when user input matches topic-generation keywords (选题/推荐/趋势/热点/蓝海...). Runs 5-6 queries in parallel with 3.5s timeout, deduplicates results, injects into the LLM prompt as real search trend data.
- **Error handling**: `handleApiError()` matches error text to give targeted Chinese-language guidance (401→key check, 404→endpoint check, network→CORS hint).

## Key functions

- `sendMessage()` — entry point; optionally runs web search before calling `sendToLLM()`
- `sendToLLM(text)` — builds message array (system prompt + history), calls API with streaming
- `handleStream(response, msg)` — ReadableStream pump, feeds tokens to `appendStreamToken()`
- `renderMarkdown(text)` — renders AI output to HTML, adds copy buttons to code blocks
- `syncSidebarToSettings()` / `applyAllSettings()` — bidirectional UI↔settings sync
- `updateConditionalFields()` — shows/hides sidebar fields based on selected content type

## Build output

`dist/` — electron-builder output directory. Not committed.
