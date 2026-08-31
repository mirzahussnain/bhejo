# AGENTS.md — Bhejo Engineering Instructions

These instructions apply to AI coding agents working in this repository.

Read `PROJECT.md` before making architectural or scanner-related changes.

---

# 1. Core Rule

Do not implement functionality from future phases unless explicitly requested.

If the task is Phase 1.1, do not opportunistically implement Phase 1.2, document detection, OpenCV, Supabase, AI, authentication, storage, or dashboard functionality.

Keep scope disciplined.

---

# 2. Before Writing Code

For every implementation task:

1. Read relevant existing code.
2. Read `PROJECT.md`.
3. Understand the requested phase/sub-phase.
4. Identify the smallest set of files that needs modification.
5. Reuse existing architecture where reasonable.
6. Do not perform unrelated refactors.

If an architectural decision conflicts with `PROJECT.md`, preserve the project specification unless the user explicitly asks to change it.

---

# 3. Dependency Policy

Do not install a dependency simply because it makes implementation convenient.

Before adding a package, determine whether:

* the browser/platform already provides the capability
* the package materially improves correctness or maintainability
* the package is actively maintained
* the package has reasonable bundle/runtime cost
* it introduces privacy/security implications

Do not add:

* state-management libraries without clear justification
* UI frameworks without clear justification
* AI SDKs during scanner implementation
* backend SDKs before their phase
* CV libraries before the relevant CV phase

When adding a dependency, explain why it is required.

---

# 4. TypeScript

Use strict TypeScript.

Avoid:

```ts
any
```

unless interaction with an unavoidable third-party API genuinely requires it and the boundary is documented.

Prefer:

* explicit domain types
* discriminated unions where helpful
* narrow function interfaces
* readonly values where appropriate
* typed error handling

Avoid giant shared type files when types belong near a specific module.

---

# 5. React / Next.js

Use Server Components by default.

Use Client Components only where browser APIs or interactive state require them.

Scanner components will necessarily use Client Components.

Do not move unrelated server-renderable content into client components.

Avoid:

* unnecessary context providers
* giant components
* deeply coupled effects
* duplicate state
* effects that mix several responsibilities

Camera lifecycle logic should not be mixed with image-processing algorithms.

---

# 6. Scanner Separation of Concerns

Keep these concerns separated:

```text
camera acquisition
frame sampling
document detection
geometry
quality scoring
stability tracking
capture control
perspective processing
image enhancement
scanner UI
```

Do not create a single monolithic `DocumentScanner.tsx` containing the entire scanner implementation.

React components should orchestrate behavior and rendering.

Image/geometry algorithms should live in testable modules outside React wherever practical.

---

# 7. Camera Privacy

Never:

* upload live camera frames
* send frames to analytics
* send frames to AI
* log image data
* serialize camera frames into debug logs
* store captures unintentionally

Camera processing should remain local unless an explicit future feature says otherwise.

---

# 8. AI Rules

Generative AI must not be introduced into the scanning pipeline.

Do not call:

* Gemini
* OpenAI
* Claude
* GLM
* remote vision APIs
* OCR APIs

unless the user explicitly requests work belonging to an AI-related future phase.

Bhejo's scanner must function completely without AI.

---

# 9. Camera Lifecycle Requirements

Whenever working with camera access:

* prefer the environment-facing/rear camera
* support fallback when exact constraints fail
* use `playsInline`
* avoid accidental autoplay assumptions
* handle permission denial
* handle no-camera devices
* stop all MediaStream tracks during cleanup
* prevent duplicate streams
* clean up on component unmount
* handle retry gracefully
* consider page visibility/backgrounding
* consider orientation changes
* do not leak event listeners
* do not leave processing loops running after camera shutdown

---

# 10. Frame Processing Requirements

When frame analysis is introduced:

Do not process the full-resolution stream continuously.

Use:

* lower-resolution analysis frames
* controlled sampling rate
* configurable analysis dimensions
* configurable analysis FPS

Target direction:

```text
analysis width: ~480–640 px
analysis FPS: ~8–12
```

Do not hard-code assumptions that prevent future tuning.

---

# 11. Computer Vision Resource Management

When OpenCV/WASM or equivalent is introduced:

* explicitly release allocated resources
* avoid allocating large objects every frame
* reuse buffers where appropriate
* prevent memory accumulation
* stop processing when scanner is not active
* make initialization state explicit
* handle library load failure gracefully

Resource cleanup is part of correctness.

---

# 12. Detection Philosophy

The scanner must prioritize avoiding bad automatic captures over capturing aggressively.

Do not auto-capture from:

* partial documents
* weak corners
* unstable frames
* documents touching unsafe boundaries
* severe blur
* unacceptable lighting
* transient false detections

Manual capture should remain a fallback.

---

# 13. Geometry

Geometry utilities should be pure and independently testable where practical.

Examples:

* point distance
* polygon area
* corner ordering
* quadrilateral validation
* coordinate scaling
* stability calculations

Do not hide core geometry inside React effects.

---

# 14. UI/UX

Recipient UX is designed for non-technical users.

Use:

* large readable text
* clear contrast
* obvious actions
* short instructions
* mobile-first layouts
* minimal controls

Avoid:

* technical jargon
* tiny buttons
* unexplained icons
* unnecessary settings
* excessive animation
* clutter
* developer-facing error messages

A scanner error should explain what the recipient can do next.

---

# 15. Accessibility

Consider:

* readable text sizes
* touch target size
* colour-independent status cues
* clear focus states
* reduced-motion preferences where applicable
* semantic HTML
* accessible error messages

Do not rely solely on red/green colour changes.

---

# 16. Testing

Add tests where they provide meaningful value.

Pure logic is particularly suitable for testing:

* geometry
* quality thresholds
* stability calculations
* state transitions
* token logic in later phases

Browser camera behavior may require manual device validation.

Do not create meaningless snapshot tests simply to increase test count.

---

# 17. Validation Before Completion

For every implementation task:

Run the applicable checks, including:

```bash
npm run lint
npm run build
```

Run tests/type checks if scripts exist.

Fix errors introduced by the task.

Do not claim success if validation fails.

If a failure cannot reasonably be fixed within task scope, report it explicitly.

---

# 18. Mobile Testing

Desktop browser success is not sufficient for scanner features.

Scanner-related work must include clear manual test instructions for supported mobile devices.

Initial primary environment:

**Android Chrome**

Later:

**iPhone Safari**

When behavior cannot be verified automatically, state exactly what should be tested on the physical device.

---

# 19. Error Handling

Do not swallow errors silently.

User-facing errors should be useful and non-technical.

Developer-facing errors may be recorded conservatively, but never include:

* camera frames
* document images
* extracted sensitive contents
* secrets
* access tokens

---

# 20. Security

Never commit:

* API keys
* Supabase service keys
* secrets
* tokens
* production credentials

Use environment variables for future secrets.

Do not expose privileged backend credentials to browser code.

Future scan request tokens must use cryptographically secure randomness.

---

# 21. Scope Discipline

Do not:

* redesign the entire app during scanner work
* implement backend prematurely
* add speculative abstractions
* refactor unrelated routes
* replace working architecture without justification
* implement Phase 2+ while completing Phase 1
* add AI because it appears useful
* add analytics before privacy decisions are made

Build the requested capability well, validate it, and stop.

---

# 22. Completion Report

At the end of each coding task, report:

1. What was implemented.
2. Files added/changed.
3. Any dependency added and why.
4. Validation commands run.
5. Validation results.
6. Remaining limitations.
7. Manual testing instructions.
8. Whether the requested phase/sub-phase is complete.

Do not describe future functionality as implemented.

---

# 23. Current Development Target

Current repository status:

**Phase 0 complete**

Next target:

**Phase 1.1 — Camera Foundation**

Until explicitly instructed otherwise:

Do not implement document detection, OpenCV, auto-capture, cropping, perspective correction, multi-page scanning, backend, Supabase, authentication, storage, or AI.

---

# Code Simplicity and Clarity

Write code that is clean, efficient, easy to understand, and easy to maintain.

Prefer the simplest implementation that fully satisfies correctness, performance, privacy, and reliability requirements.

Do not introduce complexity unless it solves a real problem.

## Principles

Prefer:

- small focused functions
- clear naming
- straightforward control flow
- explicit behavior
- readable TypeScript
- minimal abstraction
- efficient algorithms
- predictable state transitions
- code that another engineer can understand quickly

Avoid:

- clever code that is difficult to follow
- unnecessary abstraction layers
- premature design patterns
- excessive indirection
- deeply nested conditionals
- unnecessary generic utilities
- over-engineered class hierarchies
- duplicated logic
- unnecessary dependencies

Simplicity must never be used as an excuse for:

- incorrect behavior
- weak error handling
- poor performance
- resource leaks
- insecure implementation
- fragile camera lifecycle behavior
- unreliable document detection
- reduced accessibility
- ignoring browser/device constraints

A simple implementation should still be production-quality.

When performance-sensitive code requires additional complexity, keep that complexity isolated, justified, and documented.

## Comments

Use comments only when they add useful context.

Good comments explain:

- why a non-obvious decision exists
- important browser-specific behavior
- performance-sensitive logic
- unusual edge cases
- privacy/security constraints
- mathematical or computer-vision logic that is not immediately obvious

Keep comments short and clear.

Do not comment obvious code.

Avoid comments such as:

```ts
// Set loading to true
setLoading(true);

// Stop tracks
tracks.forEach((track) => track.stop());
```

Prefer comments that explain intent:

```ts
// Some Android browsers keep the camera active after navigation unless every track is stopped.
stream.getTracks().forEach((track) => track.stop());
```

Do not use comments as a substitute for clear naming or clean structure.

If code needs a long explanation to be understandable, first consider whether the code itself can be simplified.
