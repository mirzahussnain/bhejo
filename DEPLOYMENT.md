# Bhejo — Production Deployment & Environment Guide

This document outlines the architecture, configuration, and verification steps required to deploy and maintain Bhejo in a production environment (such as Vercel) alongside Supabase.

---

## 1. Environment Variable Reference

Bhejo utilizes Supabase's current **Publishable Key + Secret Key** architecture. 

> [!CAUTION]
> **Strict Secret Key Boundary:**
> `SUPABASE_SECRET_KEY` is a privileged server-only credential. It must **NEVER** be prefixed with `NEXT_PUBLIC_`, exposed in client components, bundled into frontend scripts, printed to logs, or committed to Git.

### Public Variables (Safe for Browser & Client Bundles)

| Variable | Required | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public URL of your Supabase project | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase Publishable Key | `sb_publishable_...` |
| `NEXT_PUBLIC_APP_URL` | Optional | Canonical origin for generating scan links. Defaults to `window.location.origin` if unset. | `https://bhejo.vercel.app` |

### Server-Only Variables (Internal to Next.js Server & Route Handlers)

| Variable | Required | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Optional | Internal server-side Supabase URL (defaults to `NEXT_PUBLIC_SUPABASE_URL` if omitted). | `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Yes | Supabase Secret Key for server PostgREST queries, storage, and auth verification. | `sb_secret_...` |
| `STORAGE_BUCKET` | Optional | Name of the private Supabase storage bucket (defaults to `"documents"`). | `documents` |
| `DATABASE_URL` | Optional | Postgres direct connection string (optional; application uses PostgREST HTTP). | `postgresql://...` |

---

## 2. Supabase Configuration Requirements

### A. Database Migrations
Execute all migration files located in `supabase/migrations/` in your Supabase project SQL Editor in order:
1. `20260903000000_phase3_remote_scan.sql`: Creates `scan_sessions`, `uploaded_pages`, indexes, and base RLS policies.
2. `20260903_phase3b_remote_scan_management.sql`: Creates `session_activities`, `owner_notifications`, and timeline indexes.
3. `20260904_storage_and_security_hardening.sql`: Creates the private `documents` bucket and object-level RLS policies.

### B. Storage Configuration
* **Bucket Name**: `documents`
* **Bucket Privacy**: **Private** (`public = false`).
* **Object Path Specification**:
  `sessions/{opaqueSessionId}/pages/{pageId}.jpg`
* **Storage RLS Policies**:
  - `SELECT`: Only authenticated users whose `auth.uid()` matches the session's `owner_id` can read document objects.
  - `DELETE`: Only authenticated session owners can delete document objects.
  - `INSERT`: Direct client inserts are denied. Server route handlers upload verified pages using `SUPABASE_SECRET_KEY`.

### C. Authentication Configuration
* Navigate to **Authentication -> Providers -> Email** in the Supabase Dashboard.
* Enable **Email** provider.
* For production deployments, configure a custom SMTP server (e.g. Resend, SendGrid, Amazon SES) under **Authentication -> SMTP Settings** to bypass Supabase's default rate limits (3–4 emails/hour).

---

## 3. HTTPS & Camera Requirements

Modern mobile browsers (Chrome on Android, Safari on iOS) strictly enforce that camera access via `navigator.mediaDevices.getUserMedia()` is only available in a **Secure Context** (`https://` or `localhost`).

* **Production Hosting**: Vercel automatically provisions SSL certificates and serves the application over HTTPS with HTTP Strict Transport Security (HSTS).
* **Local Physical Device Testing**:
  - Run the local Next.js dev server: `npm run dev`.
  - Expose port 3000 through an HTTPS tunnel (e.g., `ngrok http 3000`).
  - Open the secure `https://....ngrok-free.dev/scan/demo` link on your physical phone.
* **Camera Lifecycle**:
  - Scanner components automatically request `facingMode: { ideal: "environment" }` for rear-camera acquisition.
  - Video elements include the `playsInline` attribute to prevent full-screen takeover on iOS Safari.
  - Camera tracks are cleanly released upon unmount, route transitions, and backgrounding.

---

## 4. Deployment Steps (Vercel via GitHub)

1. **Connect Repository**:
   - Link `mirzahussnain/bhejo` in the Vercel Dashboard.
   - Framework preset: **Next.js**.
   - Build Command: `next build` (default).
   - Output Directory: `.next` (default).
   - Install Command: `npm install` (default).

2. **Configure Environment Variables**:
   In Vercel **Project Settings -> Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `sb_publishable_...`
   - `SUPABASE_SECRET_KEY`: `sb_secret_...`
   - `STORAGE_BUCKET`: `documents`
   - `NEXT_PUBLIC_APP_URL`: `https://bhejo.vercel.app` (or your custom domain)

3. **Deploy**:
   - Push commits to `origin main` to trigger automatic production builds.

---

## 5. Local Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/mirzahussnain/bhejo.git
   cd bhejo
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` using `.env.example` as a template:
   ```bash
   cp .env.example .env.local
   ```
   Populate your Supabase credentials in `.env.local`.
4. Start development server:
   ```bash
   npm run dev
   ```
5. Run test suite:
   ```bash
   npm test
   ```

---

## 6. Privacy & Security Verifications

Before releasing any build, ensure:
* **Zero Frame Telemetry**: Camera frames are processed exclusively in client WebAssembly/Canvas buffers. No live frames are ever uploaded or transmitted.
* **Consent-Gated Uploads**: Standalone scanning (`/scan/demo`) operates 100% in-browser with zero network transfer. Remote scanning uploads pages only after the recipient confirms transfer.
* **No Secret Leaks**: Run automated audits to ensure client bundles in `.next/static/` contain no secret keys.

---

## 7. Troubleshooting

* **Issue: "Invalid path specified in request URL" during Auth**:
  - Cause: `NEXT_PUBLIC_SUPABASE_URL` has `/rest/v1` or `/rest/v1/` appended.
  - Solution: Ensure the URL is `https://<project-ref>.supabase.co` without `/rest/v1`.
* **Issue: Camera permission denied or prompt not showing on phone**:
  - Cause: Application accessed via insecure HTTP (e.g. `http://192.168...`) rather than HTTPS.
  - Solution: Use the HTTPS ngrok tunnel URL (`https://...ngrok-free.dev`) or deployed HTTPS domain.
* **Issue: 401 Unauthorized on `/api/owner/*` routes**:
  - Cause: Missing or expired Supabase Auth session cookie.
  - Solution: Log in at `/login`. Verify that browser cookies are not blocked.
