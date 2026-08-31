# Bhejo — Project Specification

## 1. Product Summary

Bhejo is a privacy-first, link-based document scanning product.

The core experience is:

1. A sender creates a secure scan request.
2. Bhejo generates a private shareable link.
3. The sender shares the link through WhatsApp, SMS, email, or another channel.
4. The recipient opens the link in a mobile browser.
5. No app installation is required.
6. No recipient account is required.
7. The recipient grants camera permission.
8. They simply hold the phone over a document.
9. Bhejo detects the document, guides positioning, captures automatically when conditions are good, corrects perspective, crops the document, and prepares a clean scan.
10. Multiple pages/documents can be scanned in one session.
11. The recipient finishes.
12. The sender securely receives the scanned documents.

The product should make document scanning possible for people who are not comfortable using conventional scanner applications.

---

# 2. Product Principle

The recipient experience should require as little technical understanding as possible.

Target interaction:

**Open link → allow camera → hold document → done.**

Avoid unnecessary buttons, forms, menus, settings, file pickers, accounts, PDF export screens, and technical terminology.

---

# 3. Primary Users

## Sender

A person who needs documents from someone remotely.

The sender:

* creates scan requests
* shares secure links
* tracks request status
* receives completed scans
* downloads documents
* deletes documents

## Recipient

The person scanning the documents.

Recipients may:

* be older
* have limited technical experience
* have limited English
* have never used a scanner application
* primarily use WhatsApp and a mobile browser

The recipient UX must therefore be extremely clear and forgiving.

---

# 4. Technology Direction

Current application foundation:

* Next.js
* App Router
* React
* TypeScript
* Tailwind CSS
* npm
* `src/` project structure

Future infrastructure may include:

* Supabase Postgres
* Supabase Storage
* Supabase Auth for sender accounts
* secure token-based recipient access

Computer vision technology should be evaluated before locking into a specific implementation.

Possible approaches include:

* OpenCV.js
* OpenCV WebAssembly
* custom lightweight WebAssembly/image-processing pipeline

Do not assume a dependency until the corresponding implementation phase justifies it.

---

# 5. Privacy Architecture

Privacy is a first-class architectural requirement.

## Non-negotiable rules

1. Live camera streams must never be uploaded.
2. Live camera frame analysis should happen locally on the recipient's device.
3. Document edge detection should run locally.
4. Blur, brightness, framing, and stability analysis should run locally.
5. Perspective correction and cropping should run locally where practical.
6. Only intentionally captured document images may be uploaded.
7. Captured document contents must not appear in application logs.
8. Sensitive extracted data must not appear in analytics or telemetry.
9. Sensitive documents must not automatically be sent to external AI providers.
10. AI must never be required for the fundamental scanning workflow.
11. Any future external AI functionality must be explicitly separated and opt-in where sensitive documents could be involved.
12. Recipient scan links must be secure, unguessable, and expirable.
13. Recipient access must not require creating an account.
14. Sender documents must be access-controlled.
15. Document retention and deletion must be explicit product capabilities.

---

# 6. AI Policy

Bhejo must work completely without generative AI.

The scanner engine must not rely on an LLM or remote vision model for:

* edge detection
* camera positioning
* framing
* blur detection
* brightness detection
* stability detection
* auto-capture
* perspective correction
* cropping

Future optional AI may provide:

* document classification
* document naming
* requested-document validation
* OCR interpretation
* organisation
* non-sensitive assistance

Sensitive documents such as passports, national identity cards, bank statements, medical documents, immigration documents, legal records, tax records, and similar information must not automatically be transmitted to an external AI provider.

---

# 7. Scanner Architecture

The scanner should separate camera acquisition, low-resolution analysis, capture, and full-resolution processing.

Target architecture:

```text
Mobile Browser Camera
        |
        v
MediaStream
        |
        +----------------------+
        |                      |
        v                      v
Detection Frames        Full Resolution Capture
~480–640 px width              |
8–12 FPS                       |
        |                      |
        v                      |
Document Detection             |
        |                      |
        v                      |
Four Corners                   |
        |                      |
        +----> Live Overlay     |
        |                      |
        v                      |
Quality Engine                 |
- framing                      |
- blur                         |
- brightness                   |
- stability                    |
        |                      |
        v                      |
Capture Controller ------------+
        |
        v
Perspective Correction
        |
        v
Crop
        |
        v
Optional Enhancement
        |
        v
Scan Preview
```

Do not continuously process full-resolution frames.

The live detection pipeline must be deliberately lower-resolution and lower-FPS than the camera preview.

---

# 8. Scanner State Model

The scanner should be implemented around a clear state model.

Possible states:

```ts
type ScannerState =
  | "idle"
  | "requesting-camera"
  | "camera-ready"
  | "searching"
  | "document-found"
  | "hold-still"
  | "ready"
  | "capturing"
  | "processing"
  | "preview"
  | "error";
```

Exact naming may evolve, but state transitions must remain explicit.

Avoid scattered boolean state where a defined state machine provides clearer behavior.

---

# 9. Scanner UX

Scanner UI should be mobile-first and full-screen.

The user should always understand what to do next.

Example guidance:

* "Place document in view"
* "Move closer"
* "Move phone higher"
* "Hold still"
* "More light needed"
* "Almost there"
* "Scanning..."
* "Scan complete"

Future localisation should support Urdu and English.

Instructions should:

* be short
* use large readable text
* avoid technical terminology
* maintain strong contrast
* avoid excessive animation
* remain understandable for older users

---

# 10. Document Detection Requirements

The detection engine should identify plausible physical documents rather than blindly accepting the largest contour.

Future detection logic should consider:

* quadrilateral geometry
* convexity
* frame coverage
* corner visibility
* contour area
* edge confidence
* aspect-ratio plausibility
* distance from unsafe frame margins
* temporal consistency
* corner motion
* document stability

Weak detections must not trigger automatic capture.

---

# 11. Auto-Capture Requirements

Auto-capture should only occur when all required conditions remain valid for a defined stability interval.

Conceptually:

```ts
readyToCapture =
  documentDetected &&
  documentCoverageIsValid &&
  allCornersVisible &&
  sharpnessIsAcceptable &&
  brightnessIsAcceptable &&
  documentIsStable;
```

The scanner must never capture repeatedly while the same document remains stationary.

Manual capture must remain available as a fallback.

---

# 12. Perspective Correction

After capturing the full-resolution image:

1. Map detected preview coordinates to full-resolution capture coordinates.
2. Order corners consistently.
3. Compute perspective transform.
4. Warp the document into a rectangular image.
5. Preserve useful document detail.
6. Avoid aggressive enhancement by default.
7. Produce a high-quality colour scan.

Identity documents should not be heavily altered.

The product may later offer separate enhancement modes, but the original-looking colour scan should remain the default.

---

# 13. Performance Requirements

Primary target initially:

**Android Chrome**

Then:

* Chrome on other Android devices
* Safari on iPhone
* other modern mobile browsers

Performance goals:

* camera preview remains smooth
* detection should not process every camera frame
* analysis target: approximately 8–12 FPS
* analysis frames: approximately 480–640 pixels wide
* avoid unnecessary memory allocation
* release camera streams correctly
* release vision/WASM resources correctly
* avoid runaway requestAnimationFrame loops
* handle visibility changes and navigation
* handle orientation changes
* avoid blocking the main UI thread where practical

Performance should be validated on real mobile hardware.

---

# 14. Error Handling

Expected camera states include:

* permission not requested
* permission granted
* permission denied
* no usable camera
* camera already in use
* browser incompatibility
* stream interrupted
* application backgrounded
* orientation changed

The app must show useful recovery instructions rather than generic failures.

Never trap the recipient on a technical error screen without a clear next step.

---

# 15. Development Phases

## Phase 0 — Repository Foundation

Status: COMPLETE

Includes:

* Next.js foundation
* TypeScript
* Tailwind
* initial routes
* repository structure
* privacy documentation

---

## Phase 1 — Scanner Engine

### 1.1 Camera Foundation

Implement:

* permission flow
* rear-camera preference
* live preview
* responsive full-screen mobile layout
* stream lifecycle
* cleanup
* camera error handling
* manual capture foundation

No CV yet.

### 1.2 Frame Sampling

Implement:

* analysis canvas/frame extraction
* configurable detection resolution
* configurable detection FPS
* clean start/stop lifecycle

Do not implement document detection yet.

### 1.3 Document Detection

Implement:

* candidate document detection
* quadrilateral detection
* contour/candidate scoring
* corner ordering
* false-positive rejection

### 1.4 Live Document Overlay

Implement:

* coordinate mapping
* polygon overlay
* smooth corner movement
* detection visual states

### 1.5 Quality Engine

Implement:

* framing/coverage checks
* blur/sharpness score
* brightness/exposure checks
* edge/corner visibility checks

### 1.6 Stability Engine

Implement temporal tracking:

* corner movement
* document movement
* detection continuity
* stable-frame accumulation
* reset logic

### 1.7 Automatic Capture

Implement:

* ready-to-capture condition
* hold interval
* automatic trigger
* cooldown
* duplicate prevention foundation
* manual fallback

### 1.8 Perspective Correction

Implement:

* high-resolution capture
* coordinate mapping
* perspective transform
* professional automatic crop

### 1.9 Image Processing

Implement conservative:

* orientation correction
* brightness normalization where appropriate
* contrast improvement where appropriate
* readable colour output

Do not over-process identity documents.

### 1.10 Preview

Implement:

* processed scan preview
* accept
* rescan
* return to scanning

Phase 1 acceptance test:

A user should be able to open `/scan/demo` on a supported Android phone, allow camera access, hold an A4 document over a contrasting surface at a reasonable angle, have Bhejo detect its edges, wait for stability, automatically capture the document, correct perspective, crop it, and display a readable rectangular scan.

---

# 16. Phase 2 — Multi-Page Scanning

Implement:

* continuous scanning
* page counter
* document-removal detection
* duplicate prevention
* thumbnails
* rescan
* delete
* reorder
* finish scan session

Acceptance goal:

A recipient can scan several physical pages without reopening the camera.

---

# 17. Phase 3 — Secure Scan Requests

Introduce backend infrastructure.

Implement:

* sender authentication
* request creation
* cryptographically secure public token
* expiration
* request status
* recipient token validation
* anonymous recipient scanning
* secure document upload
* storage access rules

Example route:

```text
/scan/[token]
```

No recipient account.

---

# 18. Phase 4 — Dashboard and Delivery

Implement sender experience:

* requests
* pending/opened/completed status
* page previews
* individual downloads
* PDF generation
* ZIP download
* delete request
* retention controls

---

# 19. Phase 5 — Intelligence and Production Polish

Potential capabilities:

* Urdu localisation
* Urdu voice prompts
* accessibility refinement
* PWA capabilities
* offline resilience where practical
* better local OCR
* advanced quality detection
* observability without logging sensitive information
* security hardening
* retention automation
* optional AI features

AI remains optional.

---

# 20. Engineering Philosophy

Prefer:

* small composable modules
* explicit behavior
* pure functions for geometry/image scoring
* clear state transitions
* progressive enhancement
* testability
* mobile performance
* privacy by design
* dependency restraint

Avoid:

* premature abstractions
* unnecessary global state
* giant scanner components
* hidden side effects
* unnecessary dependencies
* uploading camera frames
* coupling CV logic directly to React rendering
* building future phases early

---

# 21. Current Status

Phase 0 is complete.

The next implementation target is:

**Phase 1.1 — Camera Foundation**

Do not implement later Phase 1 scanner capabilities until Phase 1.1 has been validated.

