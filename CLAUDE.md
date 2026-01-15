# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Flux Prompt Generator** web application built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS. The app generates structured JSON prompts for AI costume/character generation, with a focus on detailed costume design and cinematic photography specifications.

**Key Features**:
- Structured form for costume/character data entry
- Firebase/LocalStorage dual-mode persistence
- **Ollama LLM integration** for natural language prompt generation
- Export to JSON or natural language prompt
- Minimalistic white/grey UI design

## Key Commands

### Development
```bash
npm run dev       # Start development server (default: http://localhost:3000)
npm run build     # Build and export static site
npm start         # Start production server (not typically used with static export)
npm run serve     # Serve the static /out directory (uses npx serve)
npm run lint      # Run ESLint
```

### Build Output
- The project is configured for **static export** (`output: 'export'` in next.config.ts)
- Build artifacts are exported to the `/out` directory
- **Must be served via HTTP server** (not opened directly as file://) for proper asset loading
- Use `npm run serve` or `python -m http.server 8000` in the `/out` directory

### Serving the Static Build
The static export requires an HTTP server to load assets correctly:
```bash
# Option 1: Using npm script
npm run serve

# Option 2: Python HTTP server
cd out && python -m http.server 8000

# Option 3: Other servers
npx http-server out
npx serve out
```

## Architecture

### Single-Page Application Structure

This is a **client-side only** Next.js application with a simple file structure:
- `app/page.tsx` - Main application component (entire app logic)
- `app/layout.tsx` - Root layout with font configuration
- `app/globals.css` - Tailwind CSS global styles

### Data Persistence Strategy

The application implements a **dual-mode persistence system**:

1. **Firestore Mode (Primary)**:
   - Requires Firebase configuration via global variables (`__firebase_config`, `__app_id`, `__initial_auth_token`)
   - Stores data at path: `/artifacts/${appId}/users/${userId}/app_data/costume_generator_state`
   - Supports anonymous authentication or custom token authentication

2. **Local Storage Mode (Fallback)**:
   - Activates automatically when Firebase config is missing/invalid
   - Stores data in browser localStorage with key: `flux_prompt_generator_state`
   - Generates temporary UUID for user tracking

**Important**: The app gracefully degrades from Firestore to Local Storage without breaking functionality.

### Ollama LLM Integration

The application integrates with **Ollama** (local LLM server) to transform structured JSON costume data into natural language prompts optimized for generative AI applications like ComfyUI and Stable Diffusion.

**Architecture**:
- **Client-side API calls** to local Ollama server (default: `http://localhost:11434`)
- **Model discovery**: Fetches available models via `GET /api/tags`
- **Prompt generation**: Sends JSON + system prompt via `POST /api/generate`
- **Manual trigger**: User clicks "Generate Prompt" button (not automatic)
- **Error handling**: Graceful degradation when Ollama is unavailable

**State Variables** (app/page.tsx:235-241):
```typescript
const [ollamaModel, setOllamaModel] = useState<string>('llama3.2');
const [availableModels, setAvailableModels] = useState<string[]>([]);
const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
const [isGenerating, setIsGenerating] = useState<boolean>(false);
const [ollamaError, setOllamaError] = useState<string | null>(null);
const [ollamaEndpoint] = useState<string>('http://localhost:11434');
```

**Key Functions**:
- `fetchAvailableModels()`: Retrieves list of locally downloaded Ollama models
- `generatePromptWithOllama()`: Sends form data to Ollama with engineered system prompt
- `handleCopyPrompt()`: Copies generated natural language prompt to clipboard

**System Prompt Strategy**:
The prompt sent to Ollama instructs it to:
1. Convert JSON to cohesive natural language description
2. Maintain all technical details (camera, lighting, costume)
3. Create flowing, descriptive sentences (not bullet points)
4. Output format optimized for image generation AI (ComfyUI/Stable Diffusion)

**Model Management**:
- Dropdown shows **only locally downloaded models** (from `ollama list`)
- Models must be pulled before appearing: `ollama pull llama3.2`
- Model selection persists in application state
- If no models available, dropdown shows "No models available"

**Error Scenarios**:
- Ollama not running → "Ollama is not running. Please start Ollama and try again."
- Model not found → "Model '{name}' not found. Please select another model."
- Network timeout → "Request timeout. The model may be loading or unavailable."

### Global Variables (Firebase Integration)

The app expects these **optional** global variables for Firebase integration:
```typescript
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | null | undefined;
```

When modifying Firebase-related code, understand that these are injected externally (likely by an embedding environment) and the app must handle their absence.

### Form Data Schema

The application manages a deeply nested form structure defined in `FormDataType` interface (app/page.tsx:38-110). Key sections:

- **subject**: Character physical attributes (age, gender, ethnicity, body type, pose)
- **costume**: Detailed clothing specs including:
  - Period and style
  - Color palette (array)
  - Upper/lower body garments with materials
  - Footwear
  - Accessories (comma-separated string)
  - Hair and makeup
- **technical_specs**: Photography equipment (camera, lens, lighting setup, background)
- **cinematic_style**: Genre, mood, color grading, composition, angle
- **quality_settings**: Resolution, detail level, negative prompts (array)

### Dynamic Form Rendering System

The app uses a recursive rendering pattern (`renderField` function at app/page.tsx:525) that:

1. **Detects field types** (array, object, string) and renders appropriate inputs
2. **Supports custom dropdown lists** loaded from `.txt` files via `dropdownOptions` state
3. **Special handling** for:
   - `character_description`: Editable textarea
   - `costume.accessories`: Custom "add to list" UI
   - Array fields: Newline-separated textarea
   - String fields: Input or dropdown (if custom list loaded)

### State Management Pattern

Key state variables (app/page.tsx:224-236):
- `formData`: Main structured data (typed as `FormDataType`)
- `dropdownOptions`: Dynamic dropdown lists loaded from files (typed as `DropdownOptionsType`)
- `persistenceMode`: `'firestore'` or `'local'`
- `authReady`: Signals when authentication/initialization is complete
- `userId`: User identifier (Firebase UID or generated UUID)

**Debounced auto-save**: Form data automatically saves to persistence 500ms after user stops typing (app/page.tsx:390-397).

### Helper Functions for Nested Data

Two critical utility functions for immutable nested object updates:

- `getPath(obj, path)` (line 192): Retrieves deeply nested value using dot notation (e.g., `'costume.hair_makeup.hairstyle'`)
- `setPath(obj, path, value)` (line 202): Immutably updates nested value, returning new object

These functions enable dynamic form field updates without hardcoding paths.

## Firebase Configuration Notes

- Firebase SDK is initialized in the main component's `useEffect` (app/page.tsx:239-283)
- Authentication flow:
  1. Check for valid Firebase config
  2. Initialize Firebase app and Firestore
  3. Attempt custom token auth if `__initial_auth_token` provided
  4. Fall back to anonymous auth
  5. Fall back to local storage if any step fails
- Always wrap Firebase operations in try-catch blocks

## Tailwind CSS v4

This project uses **Tailwind CSS v4** (newer version with different configuration approach):
- Configuration in `postcss.config.mjs`
- Global styles in `app/globals.css`
- **Minimalistic white/grey design**:
  - Main background: `bg-white`
  - Cards/containers: `bg-gray-50` with `border-gray-200`
  - Text: `text-gray-900`, `text-gray-800`, `text-gray-600`
  - Buttons: `bg-gray-800`, `bg-gray-700`, `bg-gray-600` (various shades)
  - Inputs: White with `border-gray-300`, focus with `ring-gray-400`
  - Subtle shadows: `shadow-sm` (minimalistic approach)

## TypeScript Configuration

- **Target**: ES2017
- **Path alias**: `@/*` maps to project root
- **JSX**: `react-jsx` (new JSX transform)
- **Strict mode enabled**

## UI Layout

The application uses a **two-column responsive grid layout**:

### Left Column: Configuration Form
- Contains the entire costume/character form
- Nested sections for subject, costume, technical specs, cinematic style, quality settings
- Each field has a "Load List" button to import custom dropdown options from `.txt` files
- Special UI for accessories (add/remove interface)

### Right Column: AI Prompt Generation & Output
**Three sections stacked vertically**:

1. **Ollama LLM Settings** (top)
   - Model dropdown (populated from local Ollama models)
   - "Generate Prompt" button
   - Error/loading indicators

2. **Generated Natural Language Prompt** (middle)
   - Large editable textarea displaying AI-generated prompt
   - Word count indicator
   - "Copy Prompt to Clipboard" button
   - Placeholder text when no prompt generated

3. **Structured JSON Data** (bottom)
   - Read-only JSON preview
   - "Copy JSON" and "Download JSON" buttons
   - "Reset Local State" button (when in local storage mode)
   - Height limited to `max-h-[40vh]` to accommodate prompt section

## Important Development Notes

### When Adding New Form Fields

1. Update the `FormDataType` interface
2. Update `initialFormData` with default values
3. The `renderField` function will automatically handle rendering
4. Consider if the field needs special UI treatment (like `accessories` or `character_description`)

### When Modifying Persistence Logic

- Changes must work for **both** Firestore and Local Storage modes
- Test fallback behavior when Firebase is unavailable
- The `saveToPersistence` function (line 288) handles both modes

### When Working with Dropdowns

- Dropdown options are stored in `dropdownOptions` state (object with field paths as keys)
- Options are loaded from `.txt` files (one option per line)
- The "Load List" button triggers file selection for any field
- After loading, the field automatically switches from input to dropdown

### File Upload Workflow

1. User clicks "Load List" button
2. Hidden file input is triggered (`fileInputRef`)
3. Current field path is stored in `currentFieldPathRef`
4. File is read as text, split by newlines
5. Options are stored in `dropdownOptions[fieldPath]`
6. First option is auto-selected
7. State is saved to persistence

### When Modifying Ollama Integration

- **API endpoints are hardcoded** to `http://localhost:11434`
- Model fetching happens automatically when `authReady` becomes `true`
- Prompt generation is **synchronous** (waits for Ollama response)
- System prompt template is embedded in `generatePromptWithOllama()` function
- To modify prompt format: Edit the system prompt string (lines ~571-592)
- Error messages are user-friendly and stored in `ollamaError` state
- Generated prompt is **editable** by user after generation

**Testing Ollama Integration**:
1. Ensure Ollama is running locally: `ollama serve`
2. Pull a test model: `ollama pull llama3.2`
3. Refresh the app - model should appear in dropdown
4. Fill form with test data
5. Click "Generate Prompt"
6. Verify natural language output is coherent and includes all JSON details

## Common Patterns

### Updating Form Data
```typescript
// Simple field update
handleInputChange('costume.period', 'Victorian');

// Array field update (newline-separated)
handleArrayChange('quality_settings.negative_prompts', 'blurry\nlow quality');

// Add to accessories list
handleAddAccessory('costume.accessories', 'leather belt');
```

### Accessing Nested Values
```typescript
// Get nested value
const hairstyle = getPath(formData, 'costume.hair_makeup.hairstyle');

// Set nested value (immutably)
const updatedData = setPath(formData, 'costume.hair_makeup.hairstyle', 'ponytail');
```

### Using Ollama Integration
```typescript
// Fetch available models (called automatically on mount)
await fetchAvailableModels();

// Generate natural language prompt
await generatePromptWithOllama();
// This sends formData to Ollama with engineered system prompt
// Result stored in generatedPrompt state

// Copy generated prompt to clipboard
handleCopyPrompt();
```

**Ollama Requirements**:
1. Ollama must be running: `ollama serve`
2. At least one model must be downloaded: `ollama pull llama3.2`
3. Model appears in dropdown automatically after pull
4. User manually clicks "Generate Prompt" to trigger generation

## Static Export Considerations

- This app is configured for static export (`next.config.ts`: `output: 'export'`)
- No server-side rendering or API routes
- All logic runs client-side
- Firebase operations are client SDK calls only
- **Ollama integration**: Requires Ollama running locally on the same machine
  - The static export can be deployed anywhere (web server, CDN, etc.)
  - But Ollama LLM features only work when accessing from `localhost` or with CORS configured
  - Users must have Ollama installed and running locally
- The `/out` directory contains the deployable static site
- Must be served via HTTP server (not `file://` protocol) for assets to load correctly
