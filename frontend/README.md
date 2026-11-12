# SecureFile — Frontend

A premium, security-focused web frontend for **SecureFile**, a platform for
encrypted **image** delivery, recipient-specific access control, permanent
watermarking and access monitoring.

This is **not** a generic file-sharing site, and it is **not** a document
management system. SecureFile handles **images only** (JPG, JPEG, PNG, WebP) —
no PDFs, Office documents, video or other media. The owner encrypts each
original, keeps it in private storage, and issues **single-use access links**
that each recipient opens in an ordinary web browser. Every recipient receives a
**permanently watermarked, recipient-specific rendition** whose watermark is
embedded directly into the image pixels by the backend.

> **Security scope.** This repository is the presentation/UI layer only. It
> performs **no** cryptography and enforces **no** security. Every restriction
> shown here is enforced by the Django REST Framework backend; the frontend
> restrictions are supplementary only. The backend remains solely responsible
> for authentication, authorization, encryption, key release, permanent
> watermark generation and audit logging.

---

## 1. Tech stack

| Concern         | Choice                                   |
| --------------- | ---------------------------------------- |
| Framework       | React 19                                 |
| Build tool      | Vite 8                                   |
| Language        | TypeScript (strict)                      |
| Styling         | Tailwind CSS v4 (CSS-first `@theme`)     |
| Icons           | lucide-react                             |
| Routing         | react-router-dom v7 (lazy, code-split)   |
| HTTP            | axios                                    |
| Charts          | recharts                                 |
| Lint            | oxlint                                   |

---

## 2. Requirements

- **Node.js 20.19+** (Node 22 LTS recommended) and npm.
- A running Django REST Framework backend exposing the endpoints in
  [§6](#6-api-integration) (optional — see [§5](#5-mock-fallback)).

---

## 3. Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure the environment
cp .env.example .env.local
#    then edit .env.local (see §4)

# 3. Start the dev server (http://localhost:5173)
npm run dev
```

### Scripts

| Command           | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server with HMR (port `5173`).         |
| `npm run build`   | Type-check (`tsc -b`) then produce a production build in `dist/`. |
| `npm run preview` | Serve the production build locally.                       |
| `npm run lint`    | Run oxlint over the source.                              |

---

## 4. Environment variables

Copy `.env.example` → `.env.local`. All variables are public (Vite inlines any
`VITE_*` value into the client bundle) — **never put secrets, API keys or
encryption keys here**.

| Variable                   | Default                        | Purpose                                                            |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `VITE_API_BASE_URL`        | `http://localhost:8000/api`    | Django REST Framework base URL (no trailing slash).                |
| `VITE_ENABLE_MOCK_FALLBACK`| `true`                         | Fall back to bundled mock adapters for unimplemented endpoints.    |
| `VITE_API_TIMEOUT`         | `20000`                        | Request timeout in milliseconds.                                   |
| `VITE_SHARE_BASE_URL`      | `<origin>/view`                | Origin + path used to build recipient sharing links.               |

Configuration is read in [`src/config/env.ts`](src/config/env.ts).

---

## 5. Mock fallback

Every service in `src/services/*.service.ts` calls its **live Django endpoint
first**. Only when the backend returns "route not found" (`404`, `405`, `501`,
`502`, `503`, `504`) or the request fails at the transport layer (`0`) does it
transparently delegate to an in-memory mock adapter in `src/services/mock/`.

Crucially, **real errors are never masked**: `400` (validation), `401`
(unauthenticated) and `403` (forbidden) responses always surface to the UI.

- Mocks are **clearly isolated** under `src/services/mock/` (`data.ts` fixtures,
  `index.ts` behaviour, `previews.ts` rendition previews). Delete the `mock`
  import from a service once its endpoint is live.
- Set `VITE_ENABLE_MOCK_FALLBACK=false` in production to bypass mocks entirely.

### Demo credentials (mock mode only)

SecureFile is a **single-administrator** platform — there is no public
registration, no email verification, no OTP and no MFA.

| Flow                    | Input                                                     |
| ----------------------- | --------------------------------------------------------- |
| Administrator login     | Any email + any password (no backend validates in mock).  |
| Password reset          | Any email; the reset link is simulated in mock mode.      |

---

## 6. API integration

Services are grouped by domain and map 1:1 to the proposed backend contracts.
Wire the real endpoints in the corresponding module; the UI does not change.

| Endpoint                                    | Service module                                     |
| ------------------------------------------- | -------------------------------------------------- |
| `POST /api/auth/login/`                     | [`auth.service.ts`](src/services/auth.service.ts)  |
| `POST /api/auth/forgot-password/`, `POST /api/auth/reset-password/` | `auth.service.ts` |
| `POST /api/auth/logout/`, `GET /api/auth/me/` | `auth.service.ts`                                |
| `GET/POST /api/files/`, `GET /api/files/upload/` | [`files.service.ts`](src/services/files.service.ts) |
| `GET/PATCH/DELETE /api/files/{id}/`         | `files.service.ts`                                 |
| `GET/PATCH /api/files/{id}/policies/`       | `files.service.ts`                                 |
| `POST /api/files/{id}/share/`, `GET /api/shares/`, `POST /api/shares/{id}/revoke/` | [`shares.service.ts`](src/services/shares.service.ts) |
| `GET /api/access-logs/`                     | [`access.service.ts`](src/services/access.service.ts) |
| `GET /api/devices/`                         | [`devices.service.ts`](src/services/devices.service.ts) |
| `GET /api/watermarks/`, `…/{id}/verify/`, `POST /api/watermarks/lookup/` | [`watermark.service.ts`](src/services/watermark.service.ts) |
| `GET /api/notifications/`                   | [`notifications.service.ts`](src/services/notifications.service.ts) |
| `GET /api/dashboard/summary/`               | [`dashboard.service.ts`](src/services/dashboard.service.ts) |
| `…/public/shares/{token}/…` (recipient)     | [`viewer.service.ts`](src/services/viewer.service.ts) |

The shared axios client ([`api.ts`](src/services/api.ts)) adds the in-memory
access token to every request, refreshes nothing client-side, and routes `401`s
through a single sign-out handler.

---

## 7. Routes

| Area             | Path                                                            |
| ---------------- | --------------------------------------------------------------- |
| Auth             | `/login`, `/forgot-password`, `/reset-password`                 |
| Dashboard        | `/`                                                             |
| Files            | `/files`, `/files/new` (Protect workflow), `/files/:fileId`      |
| Sharing          | `/sharing`                                                      |
| Monitoring       | `/monitoring`, `/monitoring/files/:fileId`, `/monitoring/recipients/:recipientUsername` |
| Devices          | `/devices` (traceability records)                               |
| Notifications    | `/notifications`                                                |
| Watermarks       | `/watermarks`, `/watermarks/:watermarkId`                       |
| Settings         | `/settings`                                                     |
| **Recipient viewer** | `/:token` (root-level token, public, no owner navigation)      |

Administrative routes are wrapped in a `ProtectedRoute`; the recipient viewer is
served by a separate `ViewerLayout` that never exposes the owner dashboard. The
recipient reaches the viewer only by opening their single-use link and
authenticating with the image-specific credentials the administrator issued.

---

## 8. Project structure

```
src/
├── assets/
├── components/
│   ├── common/      # design-system primitives (Button, Card, Table, Modal, …)
│   ├── dashboard/   # recharts analytics widgets
│   ├── files/       # file table, policy editor, recipient editor, type icons
│   ├── security/    # status badges, access-log table
│   └── watermark/   # watermark config preview + watermarked rendition
├── config/          # runtime environment config
├── context/         # AuthContext (session) + ToastContext
├── hooks/           # useAsync, usePagination, useCountdown, useMediaQuery, …
├── layouts/         # AppShell, Sidebar, Topbar, AuthLayout, ViewerLayout
├── pages/
│   ├── auth/  dashboard/  files/  sharing/  monitoring/
│   ├── devices/  notifications/  watermarks/
│   ├── settings/  viewer/
│   └── NotFoundPage.tsx
├── routes/          # AppRoutes (lazy) + navigation config
├── services/        # api client + one module per API domain
│   └── mock/        # isolated mock adapters & fixtures
├── types/           # shared domain types
└── utils/           # cn, format, labels (status metadata), policy helpers
```

---

## 9. Design system

Tokens are declared once in [`src/index.css`](src/index.css) via Tailwind v4
`@theme` — **no `tailwind.config.js`**.

- **Sidebar** dark charcoal/navy (`navy-900`), **workspace** light neutral
  (`canvas`/`surface`), primary accent electric-indigo (`brand-500`).
- Semantic colour: `success` (allowed), `warning` (caution), `danger`
  (unauthorized / critical), `info`.
- All status colours flow through the `*_META` maps in
  [`src/utils/labels.ts`](src/utils/labels.ts) and the badge components in
  `src/components/security/`, so a status renders consistently everywhere.
- Reusable primitives in `src/components/common/` provide modals, toasts,
  confirmation dialogs, loading skeletons, empty/error states, pagination,
  form validation and accessible controls. Layouts are responsive across
  desktop, tablet and mobile.

---

## 10. Security principles honoured by this frontend

SecureFile is built around three pillars. In every case the **backend enforces**
the rule; the frontend only reflects it and adds supplementary friction.

**Prevention**

- SecureFile is a **single-administrator** platform: one administrator login and
  one console. There is no public registration, no multiple admin roles and no
  general recipient dashboard.
- The administrator creates **image-specific recipient credentials** for each
  protected image.
- Each recipient's link is **single-use**. Opening it does not consume it and a
  failed authentication does not consume it — only a **successful
  authentication** consumes it, after which the link can never be reused.
- A consumed link yields exactly **one** authorized browser session. Losing the
  cookie means the link cannot be reused — the administrator must issue a
  replacement.
- The UI holds the access token **in memory only** (never `localStorage`); a
  `sessionStorage` snapshot stores the non-sensitive session view for reloads.
- URL parameters (link tokens, ids) are treated as **inputs only, never as
  authorization**. The backend re-validates every protected image request.
- Original, unwatermarked images are never referenced by public storage URLs;
  only short-lived, recipient-scoped, watermarked renditions are.

**Deterrence**

- The permanent watermark is **mandatory** and cannot be disabled — enforced at
  the type level (`ViewingRestrictionPolicy.permanentWatermark: true`) and
  re-applied server-side. Preview components are clearly marked as illustrations
  of configuration; they are not the protection mechanism.
- The watermark embeds the recipient's username and the server access timestamp
  **directly into the image pixels** as a repeated diagonal pattern — it is not a
  CSS/HTML overlay and survives ordinary browser interaction.
- The UI **does not claim** that disabling right-click or preventing screenshots
  provides protection. Deterrents are labelled as such.

**Traceability**

- Every rendition is recorded with its recipient username, access/session id,
  server timestamp, output SHA-256 and device metadata.
- The watermark-records console includes a **leak-investigation** surface that
  compares an extracted watermark or a leaked-image hash against stored records.
- The UI **never over-claims**: an image whose watermark was removed or
  reconstructed cannot be attributed, and this is stated on the investigation
  screen.

---

## 11. Known limitations

- oxlint reports advisory React Compiler hints (e.g. `react(set-state-in-effect)`)
  in a few existing components; these are warnings only and the production build
  is clean.
- Device records are **traceability evidence only**. Device identity is never
  used as an authentication factor and cannot be revoked from this console.
- Some owner controls (e.g. editing an existing recipient's permissions, changing
  the account password, "sign out everywhere") have no backend endpoint yet and
  are presented as clearly-labelled illustrative UI rather than faked behaviour.
- Reissuing a replacement link after a lost cookie is an explicit backend
  operation; the console explains the requirement instead of pretending to
  regenerate the link client-side.
