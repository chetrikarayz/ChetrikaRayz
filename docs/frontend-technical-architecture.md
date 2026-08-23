# Frontend Technical Architecture

This document describes the actual frontend implementation for the Chetrika Rayz project under [website/frontend](../website/frontend). It documents the app structure, routing model, admin dashboard flows, telemetry visualization, authentication, and integration with the backend API.

---

## 1. System purpose

The frontend is a Next.js application used to:

- present the public marketing site
- provide secure admin access to monitoring tools
- visualize live electrical telemetry from DTMS devices
- manage devices and firmware releases
- control phase swappers and relay states
- show logs, device health, and operational history

The frontend is built around a secure admin portal plus a public landing experience.

---

## 2. Stack and framework

The app uses:

- Next.js (App Router)
- TypeScript
- React
- Tailwind-style utility classes
- Recharts for charting
- Framer Motion for landing-page animation
- Lucide React for icons

Core entry points:

- [website/frontend/app/page.tsx](../website/frontend/app/page.tsx): public landing page
- [website/frontend/app/admin/login/page.tsx](../website/frontend/app/admin/login/page.tsx): admin login screen
- [website/frontend/app/admin/dashboard/page.tsx](../website/frontend/app/admin/dashboard/page.tsx): central dashboard
- [website/frontend/app/admin/devices/page.tsx](../website/frontend/app/admin/devices/page.tsx): device management page
- [website/frontend/app/admin/firmware/page.tsx](../website/frontend/app/admin/firmware/page.tsx): firmware release page
- [website/frontend/app/admin/phase-swappers/page.tsx](../website/frontend/app/admin/phase-swappers/page.tsx): phase swapper management page
- [website/frontend/app/admin/logs/page.tsx](../website/frontend/app/admin/logs/page.tsx): telemetry logs viewer

---

## 3. App structure

```text
website/frontend/
├── app/
│   ├── admin/
│   │   ├── dashboard/page.tsx
│   │   ├── devices/page.tsx
│   │   ├── firmware/page.tsx
│   │   ├── landing/page.tsx
│   │   ├── login/page.tsx
│   │   ├── logs/page.tsx
│   │   └── phase-swappers/page.tsx
│   ├── components/
│   │   ├── DeviceManager.tsx
│   │   ├── FirmwareManager.tsx
│   │   ├── PhaseSwapperManager.tsx
│   │   └── Services.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── phase-swapper/page.tsx
├── public/
├── package.json
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
├── eslint.config.mjs
└── README.md
```

This structure separates:

- page-level routing
- reusable UI components
- shared styling and app shell

---

## 4. Public frontend experience

### Landing page

The public home page at [website/frontend/app/page.tsx](../website/frontend/app/page.tsx) is a marketing-style landing page for the Chetrika Rayz product line.

It includes:

- hero section with product positioning
- feature showcases
- solution cards
- technology visualization blocks
- CTA sections for query/contact flow

The landing page also reuses motion-based animations and static sections to build a polished product presentation.

### Services layout

The reusable service section is implemented in [website/frontend/app/components/Services.tsx](../website/frontend/app/components/Services.tsx). It presents the company marketing categories, such as:

- automated phase swapping
- DTMS telemetry
- smart grid security
- software development
- infrastructure management

This is a content component rather than a data-driven API component; it is static marketing content.

---

## 5. Admin authentication flow

### Login screen

The admin login page is implemented in [website/frontend/app/admin/login/page.tsx](../website/frontend/app/admin/login/page.tsx).

Responsibilities:

- collects username and password
- calls `POST /api/auth/login` on the backend
- stores JWT in `localStorage`
- stores role in `localStorage`
- redirects to `/admin/dashboard` on success

Token usage:

```ts
localStorage.setItem("adminToken", data.token);
localStorage.setItem("adminRole", data.role);
```

This means the app treats JWT as the client-side authentication state for protected admin pages.

### Route protection

Admin pages perform a local guard check on mount:

- read `adminToken`
- if missing, redirect to `/admin/login`
- otherwise continue rendering the dashboard page

This pattern is repeated in multiple admin screens, including:

- dashboard
- devices
- firmware
- logs
- phase swappers

---

## 6. Admin UI pattern

The admin pages share a common shell pattern:

- a left sidebar navigation
- header with role badge
- mobile menu toggle
- logout action
- page-specific content container

Examples:

- [website/frontend/app/admin/dashboard/page.tsx](../website/frontend/app/admin/dashboard/page.tsx)
- [website/frontend/app/admin/devices/page.tsx](../website/frontend/app/admin/devices/page.tsx)
- [website/frontend/app/admin/firmware/page.tsx](../website/frontend/app/admin/firmware/page.tsx)
- [website/frontend/app/admin/phase-swappers/page.tsx](../website/frontend/app/admin/phase-swappers/page.tsx)

The nav structure is consistent across pages:

- System Dashboard
- Telemetry Logs
- Phase Swappers
- Devices
- Firmware

This keeps the admin experience consistent and easier to navigate for operations staff.

---

## 7. Dashboard architecture

The main dashboard is implemented in [website/frontend/app/admin/dashboard/page.tsx](../website/frontend/app/admin/dashboard/page.tsx).

### Responsibilities

- loads the current admin role
- fetches active device list
- lets the operator pick a device
- queries latest telemetry from the backend
- queries history for a time range window
- renders live three-phase power cards
- displays neutral current card
- shows an interval-based chart of historical values
- supports live, forward, backward, and reset time-window navigation

### Key data flow

The dashboard uses:

- `fetchDeviceList()` to populate available device IDs
- `fetchLatest()` to fetch the newest readings
- `fetchHistory(start, end)` to fetch chart data
- `fetchESPStatus(deviceId)` to check liveness/connectivity

It then builds UI from the response, including:

- `latest.phases.R`, `Y`, and `B`
- `latest.neutralCurrent`
- time-window history arrays

### Visualization model

The dashboard uses `recharts` with area-based charting to render the selected metric history and show recent electrical behavior.

This gives operators a quick overview of:

- current trends
- voltage drift
- load change behavior
- possibility of imbalance or fault conditions

---

## 8. Device management UI

The device management experience is implemented in [website/frontend/app/components/DeviceManager.tsx](../website/frontend/app/components/DeviceManager.tsx).

### Scope

This component is responsible for:

- listing all devices from `/api/iot/devices`
- showing online/offline/fault counts
- issuing remote commands to devices
- expanding a selected device card for details
- summarizing signal quality and uptime

### Backend integration

Key API calls:

- `GET /api/iot/devices`
- `POST /api/iot/devices/:deviceId/command`

The command panel accepts a device ID and command type, then submits JSON params to the backend for remote action.

Available command types in the UI include:

- restart
- ota
- reset_energy
- sync_time
- clear_logs

This is an operational control screen rather than a pure read-only dashboard.

---

## 9. Firmware management UI

The firmware management screen is implemented in [website/frontend/app/components/FirmwareManager.tsx](../website/frontend/app/components/FirmwareManager.tsx).

### Responsibilities

- list all uploaded firmware versions
- show status, channel, size, and hash metadata
- upload a firmware binary to the backend
- delete a release
- show OTA event history

### Integrations

This component uses the firmware endpoints from the backend:

- `GET /api/iot/firmware/versions`
- `POST /api/iot/firmware/upload`
- `DELETE /api/iot/firmware/:version`
- `GET /api/iot/firmware/ota-events`

It uses Base64 conversion to send a binary file payload to the server as part of the upload form.

---

## 10. Phase swapper management UI

The phase swapper experience is implemented in [website/frontend/app/components/PhaseSwapperManager.tsx](../website/frontend/app/components/PhaseSwapperManager.tsx).

### Responsibilities

- register new phase swappers
- show live state and active phase
- display load readings for the selected operating phase
- swap device phase
- change switch delay
- clear fault state
- delete a swapper record

### Backend integrations

This component calls the phase swapper routes:

- `GET /api/iot/phase-swappers`
- `POST /api/iot/phase-swappers`
- `PUT /api/iot/phase-swappers/:id/swap`
- `PUT /api/iot/phase-swappers/:id/switch-delay`
- `POST /api/iot/phase-swappers/:id/clear-fault`
- `DELETE /api/iot/phase-swappers/:id`

The UI shows an operator-friendly phase LED/status treatment: `R`, `Y`, `B`, and `NONE`, with color-coded status indicators.<n>

---

## 11. Logs and telemetry viewing

The logs page is in the admin area under [website/frontend/app/admin/logs/page.tsx](../website/frontend/app/admin/logs/page.tsx). It provides access to historical analytics and log tables.

The application fetches data through backend routes such as:

- `GET /api/iot/history`
- `GET /api/iot/logs`
- `GET /api/iot/stats`
- `GET /api/iot/export-csv`

The design supports:

- select a device
- filter by time range
- view telemetry history
- export raw telemetry records as CSV

---

## 12. Public phase swapper page

The page at [website/frontend/app/phase-swapper/page.tsx](../website/frontend/app/phase-swapper/page.tsx) is a dedicated product-focused phase-swapping showcase page.

It uses:

- motion-based animations
- custom SVG diagrams
- feature cards
- product messaging related to phase switching and smart grid optimization

This is more of an informational/demo page than a connected runtime control surface.

---

## 13. Frontend data access model

The app follows a straightforward client-side service model:

- read `adminToken` from browser storage
- attach it to API requests via `Authorization: Bearer ...`
- request JSON from the backend
- render state locally in React components
- update using `useState` and `useEffect`

This is a classic dashboard architecture: the UI is stateless between refreshes, and all operational state is restored from the backend.

---

## 14. Frontend state and refresh behavior

The admin screens use local React state and periodic polling for live values.

Examples:

- device list auto-refreshes every 10 seconds
- dashboard live data is refreshed on interval or user navigation
- telemetry time windows are user-driven and support manual navigation

This gives the app a near-real-time monitoring feel without requiring a heavy global state tool.

---

## 15. Styling and design system

The frontend styling is built with utility-first classes and shared design tokens, including:

- light gray surfaces
- deep slate text colors
- primary brand color for CTAs and emphasis
- rounded cards and subtle shadows
- compact dashboard-style layout

The app also uses a common design language for admin pages, which makes it easier to maintain and scale.

---

## 16. Security considerations

The frontend does not store sensitive secrets beyond the JWT token and role. It relies on backend enforcement for authorization and device identity controls.

Notable implementation points:

- protected admin pages check token presence before rendering
- admin endpoints require JWT on the backend
- device endpoints require the shared device API key
- superadmin-only actions are gated in the backend and sometimes also presented conditionally in the UI

---

## 17. Summary

The frontend is a Next.js-based operations portal for DTMS and phase-swapper infrastructure. It combines:

- a public product landing page
- secure admin login and session handling
- live device telemetry dashboards
- command issuance to field devices
- phase swapper lifecycle management
- OTA and firmware management
- historical analysis and operational logs

The app is designed as a practical field operations interface, not just a static website, and it is tightly coordinated with the backend API documented in the backend technical document.
