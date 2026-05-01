# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **AI Costume Generator** web application built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS. The app generates structured JSON prompts for AI costume/character generation, with a focus on detailed costume design and cinematic photography specifications.

**Key Features**:
- Structured form for costume/character data entry
- Firebase/LocalStorage dual-mode persistence
- **Dual LLM provider support**: Ollama (local) and OpenRouter (cloud)
- **Image generation** via OpenRouter image-capable models
- Export to JSON or natural language prompt
- Minimalistic white/grey UI design

## Key Commands

```bash
npm run dev       # Start development server (default: http://localhost:3000)
npm run build     # Build and export static site to /out
npm run serve     # Serve the static /out directory
npm run deploy    # Build and deploy to GitHub Pages (gh-pages -d out)
npm run lint      # Run ESLint
```

### Build Output
- Configured for **static export** (`output: 'export'` in next.config.ts) — no SSR or API routes
- Artifacts exported to `/out` — must be served via HTTP server, not `file://`

## Architecture

### Single-Page Application Structure

Entire app logic lives in `app/page.tsx` (one large component). Supporting files:
- `app/layout.tsx` — root layout with font configuration
- `app/globals.css` — Tailwind CSS global styles
- `text_files/` — pre-built `.txt` dropdown lists (garments, accessories, pose, gender, age, etc.)

### Data Persistence Strategy

The application implements a **dual-mode persistence system**:

1. **Firestore Mode (Primary)**: Requires global variables `__firebase_config`, `__app_id`, `__initial_auth_token` injected externally. Stores at `/artifacts/${appId}/users/${userId}/app_data/costume_generator_state`.
2. **Local Storage Mode (Fallback)**: Activates when Firebase config is missing/invalid. Key: `flux_prompt_generator_state`.

The `saveToPersistence` function (`app/page.tsx:316`) persists `formData`, `dropdownOptions`, and `llmSettings` (provider, API key, model selections, image settings) in both modes.

**Debounced auto-save**: 500ms after user stops typing.

### LLM Provider Architecture

The app supports two LLM providers via a toggle (`llmProvider` state: `'ollama' | 'openrouter'`):

**Ollama (local)**:
- Calls `http://localhost:11434` — hardcoded endpoint
- `fetchAvailableModels()` → `GET /api/tags`
- `generatePromptWithOllama()` → `POST /api/generate` (non-streaming)
- Models must be pulled locally before appearing: `ollama pull llama3.2`

**OpenRouter (cloud)**:
- Requires user-provided API key (stored in state, persisted)
- `fetchOpenRouterModels()` → `GET https://openrouter.ai/api/v1/models`
- `generatePromptWithOpenRouter()` → `POST https://openrouter.ai/api/v1/chat/completions`
- Models loaded on-demand via "Fetch Models" button, or auto-fetched when API key changes

Both providers share the same `generatedPrompt` state and use the same system prompt strategy: convert JSON form data into a cohesive natural language description ready for ComfyUI/Stable Diffusion.

### Image Generation

Image generation uses OpenRouter (only available when OpenRouter provider is selected and API key is set):

- `fetchImageModels()` — filters OpenRouter models by `output_modalities.includes('image')` or model ID patterns (`flux`, `imagen`, `stable-diffusion`, `dall-e`, `gemini`+`image`)
- `generateImageWithOpenRouter()` — sends prompt via `/api/v1/chat/completions` with `modalities: ['image', 'text']`
- Gemini models get additional `image_config: { aspect_ratio, image_size }` in the request body
- If no `generatedPrompt` exists, `createPromptFromFormData()` builds a fallback prompt directly from form state
- Response image extracted from `data.choices[0].message.images`; supports both base64 data URLs and regular URLs

### Form Data Schema

`FormDataType` interface (`app/page.tsx:43`). Key sections:
- **subject**: age_range, gender, ethnicity, body_type, pose, character_description (textarea)
- **costume**: period, style, color_palette (array), upper_body/lower_body (garment+material+details), footwear, accessories (comma-separated string), hair_makeup
- **technical_specs**: camera_type, camera_model, lens (focal_length/aperture/type), lighting_setup, background
- **cinematic_style**: genre, mood, color_grading, reference_style, composition, angle
- **quality_settings**: resolution, detail_level, negative_prompts (array)

### Dynamic Form Rendering System

The `renderField` function (`app/page.tsx:1185`) recursively renders all form fields:
1. **Array fields** → newline-separated textarea
2. **Object fields** → nested section with header
3. **String fields** → input with "Load List" button; switches to `<select>` when a `.txt` file is loaded for that path
4. **Special cases**: `character_description` (editable textarea), `costume.accessories` (add/remove UI with dropdown or text input)

### State Management

Key state (all in the single `App` component):
- `formData` / `dropdownOptions` — main form data and loaded dropdown lists
- `persistenceMode` / `authReady` / `userId` — persistence tracking
- `llmProvider` — `'ollama' | 'openrouter'` toggle
- `ollamaModel` / `availableModels` / `generatedPrompt` / `isGenerating` / `ollamaError`
- `openrouterApiKey` / `openrouterModels` / `openrouterSelectedModel` / `openrouterError`
- `imageModels` / `selectedImageModel` / `generatedImageUrl` / `isGeneratingImage` / `imageError`
- `imageAspectRatio` (`'1:1'|'16:9'|'9:16'|'4:3'|'3:4'`) / `imageSize` (`'1K'|'2K'`) — Gemini-specific

### Helper Functions

- `getPath(obj, path)` (`app/page.tsx:192`) — reads deeply nested value by dot-notation path
- `setPath(obj, path, value)` (`app/page.tsx:202`) — immutably updates nested value, returns new object
- `createPromptFromFormData()` (`app/page.tsx:928`) — builds fallback text prompt from form state when no LLM prompt exists

## UI Layout

Three-column responsive grid (`lg:grid-cols-3`):
- **Left (col-span-1)**: Configuration Form — all costume/character fields
- **Right (col-span-2)**: AI Prompt Generation — stacked sections:
  1. LLM Provider toggle (Ollama / OpenRouter)
  2. Provider-specific controls (model dropdown, API key for OpenRouter)
  3. Generated natural language prompt textarea (editable, word count)
  4. Structured JSON output (copy/download buttons)
  5. Image generation panel (OpenRouter only, when API key is set)

## Tailwind CSS v4

Uses Tailwind v4 (configuration in `postcss.config.mjs`). Design tokens:
- Background: `bg-white` (page), `bg-gray-50` (cards), `bg-white` (inputs)
- Buttons: `bg-gray-800` (primary), `bg-gray-700` (secondary), `bg-gray-600` (tertiary)
- Borders: `border-gray-200` (cards), `border-gray-300` (inputs)
- Focus: `ring-gray-400`

## Global Variables (Firebase Integration)

Injected externally (by embedding environment):
```typescript
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | null | undefined;
```
App must handle their absence — always falls back to localStorage.

## Development Notes

### Adding New Form Fields
1. Update `FormDataType` interface
2. Update `initialFormData` with default values
3. `renderField` handles rendering automatically
4. Add special-case handling in `renderField` if needed (like `accessories`)

### Modifying LLM Prompt Format
Both Ollama and OpenRouter use the same system prompt template embedded directly in their respective generate functions. Edit the template string in `generatePromptWithOllama()` or `generatePromptWithOpenRouter()`.

### File Upload Workflow
1. "Load List" button stores field path in `currentFieldPathRef`, triggers hidden `<input type="file">`
2. File read as text → split by newlines → stored in `dropdownOptions[fieldPath]`
3. First option auto-selected; state saved to persistence

### Static Export Constraints
- No API routes — all external calls are client-side fetches
- Ollama features only work from `localhost` (CORS)
- OpenRouter works from any deployment origin
