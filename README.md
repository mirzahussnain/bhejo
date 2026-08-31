# Bhejo

Privacy-first link-based document scanning. Send a link, hold the document, done.

## What Bhejo is

Bhejo is being built to make remote document collection extremely simple. A sender creates a secure request link, shares it through any channel, and a recipient scans documents directly in their mobile browser without installing an app or creating an account.

## Current development status

Bhejo is in early foundation setup and does not yet include camera scanning, backend, authentication, storage, OpenCV, or AI integrations.

## Intended user flow

1. Sender creates a secure document request link.
2. Sender shares the link via WhatsApp, SMS, email, or similar.
3. Recipient opens the link on mobile.
4. Recipient grants camera access (future phase).
5. Recipient scans one or more documents.
6. Sender securely accesses completed scans.

## Technology stack

- Next.js (App Router)
- React
- TypeScript (strict)
- Tailwind CSS
- ESLint
- npm

## Local development

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Repository structure

```text
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── scan/
│   │   └── demo/
│   │       └── page.tsx
│   └── dashboard/
│       └── page.tsx
├── components/
│   ├── ui/
│   └── scanner/
├── lib/
│   ├── vision/
│   ├── camera/
│   └── utils/
├── hooks/
└── types/
```

## Privacy principles (architectural constraints)

1. Live camera frames should remain on the user's device.
2. Future document detection should run locally where practical.
3. Raw live camera streams must never be uploaded to the server.
4. Only intentionally captured/processed documents may eventually be uploaded.
5. Sensitive documents must not be sent to third-party AI services by default.
6. AI functionality must remain optional and separated from the core scanning pipeline.
7. Recipients should not require accounts to fulfill a valid scan request.
8. Future scan links must use secure, unguessable tokens and expiry.
9. Do not log document contents or sensitive extracted information.
10. Security and privacy take priority over analytics.

## Current milestone

**Phase 0 — Repository Foundation**

## Future high-level milestones

### Phase 1 — Scanner Engine

- mobile camera access
- document detection
- four-corner overlay
- quality checks
- stability detection
- automatic capture
- perspective correction
- professional crop
- preview

### Phase 2 — Multi-page Scanning

- continuous scanning
- duplicate prevention
- thumbnails
- rescan/delete
- reorder pages
- finish session

### Phase 3 — Secure Scan Requests

- sender dashboard
- secure request tokens
- expiry
- recipient scan sessions
- secure upload/storage

### Phase 4 — Document Delivery

- request status
- document preview
- PDF generation
- individual downloads
- ZIP download
- deletion/retention controls

### Phase 5 — Optional Intelligence

AI must not be required for scanning.

Potential optional capabilities:

- document classification
- requested-document validation
- intelligent naming
- OCR-assisted organisation

Sensitive documents must never automatically be sent to external AI services.
