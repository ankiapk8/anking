# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI via Replit AI Integrations (`@workspace/integrations-openai-ai-server`)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

### Anki Card Generator (`artifacts/anki-generator`)

- React + Vite web app at `/`
- Upload files (PDF, TXT) or paste text to generate Anki flashcards via AI
- Browse and manage decks, edit cards inline, export `.apkg` for Anki import
- **Study mode** on deck detail page: flip cards, reveal answer, mark "Got It"/"Still Learning", shuffle, progress bar, completion screen with missed-card review
- PDF extraction in `src/lib/pdf-extraction.ts`: files >20MB skip client and go straight to server; smaller files try embedded text first, then server, then client OCR
- Server upload uses `FormData` multipart (avoids Replit proxy limits on raw binary bodies)
- Safari/iPad compatibility uses a `Promise.withResolvers` polyfill in `src/main.tsx` before loading the app and the legacy PDF.js build
- Direct API fetches use the Vite base path helper in `src/lib/utils.ts` so PDF extraction, explain, and `.apkg` export requests route correctly in the preview/deployed app

### API Server (`artifacts/api-server`)

- Express 5 backend at `/api`
- Routes: `/api/decks`, `/api/cards`, `/api/generate`, `/api/extract-pdf`, `/api/export-apkg`, `/api/healthz`
- AI generation uses `gpt-5.2` model via Replit AI Integrations (env vars: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`)
- The AI client is loaded lazily so missing AI configuration returns a 503 from `/api/generate` instead of crashing the server
- `/api/generate` retries transient AI rate-limit/server failures with backoff, and the frontend pauses briefly between multi-file generations while surfacing per-file error details
- Route `/api/extract-pdf` accepts both `multipart/form-data` (via multer, field name `file`) and raw `application/pdf` body; embedded text → server OCR fallback. Multer file size limit is **200 MB** to match the Express body limit so large PDFs don't get silently rejected.
- All long-running AI endpoints stream over SSE with 12 s heartbeat comments and `X-Accel-Buffering: no` to keep the Replit edge / Cloudflare proxy from buffering or closing the connection: `/api/generate/stream`, `/api/generate-qbank/stream`, and `/api/explain` (chunked text). The frontend always uses the streamed variants for these.
- The server runs a safe startup schema initializer from `@workspace/db` before listening, creating/updating `decks` and `cards` if needed for fresh databases
- System dependency `util-linux` (provides `libuuid.so.1`) is required by the `canvas` npm package; installed via Nix
- `canvas` and `tesseract.js` are listed in `pnpm.onlyBuiltDependencies` in the root `package.json` so their native build scripts run
- **APK builder requires the Android SDK at `/home/runner/android-sdk`** (cmdline-tools + `platforms/android-36` + `build-tools/36.0.0` + `platform-tools`) and JDK 21 from the Nix store. If `/home/runner/android-sdk/platforms` is missing, `buildSupported()` in `apk-builder.ts` returns false and the UI shows "APK download unavailable" / `unsupported`. Reinstall by:
  1. Download `commandlinetools-linux-*.zip` from `dl.google.com/android/repository`, extract to `/home/runner/android-sdk/cmdline-tools/latest`.
  2. With `JAVA_HOME` set to the JDK 21 in `/nix/store/*-openjdk-21*` and `PATH` including `cmdline-tools/latest/bin`, run `yes | sdkmanager --licenses` then `sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0"`.
  3. Restart the API server — `autoConfigureFromEnv()` will queue rebuilds for both dev and published slots automatically.

## Database Schema

- `decks` — Deck metadata (id, name, description, parentId FK self-ref, kind, timestamps)
  - `parentId` is nullable; if set, the deck is a sub-deck of the referenced deck
  - `kind`: `'deck'` (default, flashcard deck) or `'qbank'` (MCQ-only question bank). The Library page filters by kind into two tabs.
- `cards` — Flashcard data (id, deckId, front, back, tags, image, sourceImage, bbox, cardType, choices, correctIndex, pageNumber, timestamps)
  - `cardType`: `'basic'` (default) or `'mcq'`
  - `choices`: JSON-stringified array of MCQ option strings (only when cardType='mcq')
  - `correctIndex`: 0-based index into `choices` for the correct answer
  - `pageNumber`: original PDF page (1-indexed) the card was generated from; used to sort the merged deck in source order. Null for non-PDF inputs.

## AI Visual-Card Generation

- The visual prompt explicitly enumerates qualifying figure categories (charts, tables, radiology, flowcharts, diagrams, photomicrographs, traces, equations) and instructs the model to **skip pages with no real figure** instead of screenshotting them.
- The model must return a `figureType` tag and a TIGHT bbox (3–5% margin); it is forbidden from returning `{0,0,1,1}` or any near-full-page bbox.
- Server-side filter (`MAX_VISUAL_BBOX_AREA = 0.78`, `MAX_VISUAL_BBOX_DIM = 0.92`) drops any card whose bbox covers more than 78 % of the page area or spans >92 % in both width and height — the user does not want full-page screenshots, so those get logged and discarded.
- `cropImage` always crops to the bbox; `CROP_PADDING` is 4 % and `MIN_CROP_DIMENSION` is 12 %.

## AI Text-Card Generation

- Long text is split into ~6000-char chunks. When the client uploads a PDF, the frontend also sends `pageTexts[]` (one entry per page); the server then uses a page-aware chunker (`buildPagedChunks`) that packs whole pages into chunks (or splits oversize pages) and tags each chunk with its starting PDF page. Every text card produced from that chunk inherits that `pageNumber`. Plain (non-paged) text falls back to the old chunker with `pageNumber = null`. Concurrency is 3 with proportional card targets and a density floor.
- Text + visual cards from one PDF go into ONE merged deck (no `– Text` / `– Visual` split). Cards are returned ordered by `pageNumber ASC NULLS LAST, createdAt ASC` so the deck reads in source-document order.
- The system prompt instructs the model to (1) preserve any existing multiple-choice questions verbatim as MCQ cards (stem in `front`, options in `choices`, 0-based `correctIndex`, explanation in `back`) and (2) emit one atomic basic card per fact for the rest.
- `normalizeCard` validates and normalizes both `basic` and `mcq` card shapes; `serializeCard` parses the JSON `choices` column before sending to the client.
- Frontend Study mode renders MCQ cards as A/B/C/D options the learner can pre-select; on Show Answer the correct option turns green and a wrong selected option turns red. The card list shows an "MCQ" badge.

## Deck Hierarchy

- Decks can have a `parentId` pointing to another deck (one level deep)
- Library shows parent decks as main topics with expandable sub-decks nested below
- "New Deck" and Generate flows have a Main Topic selector to assign `parentId`
- Export uses Anki's `::` convention: sub-deck cards are tagged `Parent::Child`
- Deleting a parent nullifies `parentId` on children (they become standalone)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## .apkg Export (iOS-Compatible)

- `artifacts/api-server/src/routes/export-apkg.ts` builds the `.apkg` zip by hand with JSZip (`anki-apkg-export` is only used to bootstrap the SQLite template and `col` row).
- Notes/cards use monotonic IDs (`baseId + index*2`) and sort by `pageNumber ASC NULLS LAST, createdAt ASC` so the deck reads in source-document order.
- Card content runs through `toAnkiHtml` (HTML-escapes, then converts `\n` -> `<br>`). MCQs render as A/B/C/D with the correct option bolded; cards display a `p. N` page badge on the front when a `pageNumber` is present.
- Visual cards' image data URLs are decoded via `decodeDataUrlImage` and added through `apkg.addMedia(filename, buffer)` so AnkiMobile (iOS) can resolve them; the `media` JSON manifest and the corresponding numeric-named files are written explicitly into the zip.
- `jszip` is now an explicit dependency of `@workspace/api-server` (don't rely on it being a transitive of `anki-apkg-export`).

## Mobile Responsiveness

- Header/nav (`components/layout.tsx`): tighter gaps + larger touch targets on `<sm`; nav labels stay visible (icons get a small bump). Generate button also uses `py-2` on mobile for a 44px tap area.
- Library list (`pages/decks.tsx`): nested indents drop from `ml-6/ml-5` to `ml-3/ml-2` on `<sm`, and the per-row card-count badge collapses to just the number on phones to keep Edit/Delete reachable.
- Deck detail AI Tools (`pages/deck-detail.tsx`): switched from `grid-cols-3` to `grid-cols-1 sm:grid-cols-3` so the three AI buttons stack on phones instead of clipping their labels.

## Generate Tab (`pages/generate.tsx`)

- Mode toggle pill at the top (Flashcards / Question Bank) with a sliding gradient highlight (framer-motion `layoutId`). Hero title, subtitle, icon, and halo colors swap via `AnimatePresence` based on mode (emerald/green for decks, violet/fuchsia for qbank). The qbank mode also shows a big animated CTA card (rotating conic glow + pulsing sheen + bouncing stethoscope) above the form to make the new feature feel premium.
- The form section swaps between `<GenerateForm>` (decks, supports PDF text + page screenshots for visual cards) and `<GenerateQbankForm>` (question banks, text-only).
- `components/generate-qbank-form.tsx` mirrors the deck form's UX: drag-and-drop upload of PDF/TXT files, per-file editable name + question count + optional prompt, shared instructions, and a sequential generation loop that calls `/api/generate-qbank/stream` per file with progress bars and cancel buttons. PDF text is extracted via `extractPdf` from `lib/pdf-extraction` (OCR fallback for scanned PDFs); page screenshots are intentionally skipped because qbanks are MCQ-only and never render images.

## Transfer (Library Backup / Restore)

- `artifacts/api-server/src/routes/transfer.ts` exposes:
  - `GET /api/export-all-json` — every top-level deck (with sub-decks) in one `.ankigen.json` file.
  - `GET /api/decks/:id/export-json` — single top-level deck (with sub-decks).
  - `POST /api/import-deck-json` — accepts either `{ root }` or `{ roots: [...] }`.
- File format `version` is now **2**. Exported `ExportedCard` includes `cardType`, `choices`, `correctIndex`, and `pageNumber` (v1 dropped these, breaking MCQs and page-based sort on round-trip). `version > FORMAT_VERSION` is rejected, so old v1 files still import cleanly (the new fields are simply absent).
- The Library page Transfer dropdown now has three actions: import a `.ankigen.json` backup, export the whole library as a single `.apkg` (calls `/api/export-apkg` with every root deck ID), and back the library up as JSON. The button + items are animated with framer-motion (sweep highlight on the trigger, staggered slide-in for items, idle/loading micro-animations on each icon).
