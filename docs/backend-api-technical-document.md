# Backend Technical API Documentation

This document describes the actual backend API implemented in [website/backend/server.js](../website/backend/server.js) and the relay service in [website/backend/relay.js](../website/backend/relay.js).

## 1. System purpose

The backend is the central control plane for DTMS field devices. It provides:

- secure telemetry ingestion from ESP32 devices
- heartbeat monitoring and device liveness tracking
- frontend/admin dashboard APIs for analytics and device management
- remote device command dispatch
- phase swapper control APIs
- firmware upload, versioning, and OTA delivery
- optional plain-HTTP relay for GSM devices that cannot directly call HTTPS endpoints

---

## 2. Technology stack

- Node.js + Express
- MongoDB + Mongoose
- JWT-based admin auth
- device API key authentication for ESP32 nodes
- in-memory ring buffers for recent telemetry snapshots
- optional CSV playback/mock telemetry mode
- firmware binary storage in MongoDB as `Buffer`

---

## 3. Authentication model

### 3.1 Device authentication

ESP32 devices authenticate using a shared API key.

Headers accepted:

- `x-api-key: <key>`
- or `?api_key=<key>`

The expected key is configured by `DEVICE_API_KEY` in the backend environment.

Routes protected with `authenticateDevice`:

- `POST /api/data`
- `POST /api/heartbeat`
- `GET /api/device/phase`
- `GET /api/commands/:deviceId`
- `POST /api/commands/:id/result`

### 3.2 Admin authentication

Dashboard/admin APIs use JWT tokens.

Headers:

- `Authorization: Bearer <jwt>`

Login route:

- `POST /api/auth/login`

JWT secret is configured from `JWT_SECRET` and default fallback is used when absent.

Role-based access:

- `admin`
- `superadmin`

Superadmin-only routes use `authorizeRole('superadmin')`.

### 3.3 Mixed auth

Some endpoints accept either JWT or device API key through `authenticateTokenOrDevice`:

- `POST /api/iot/reset-energy`

---

## 4. Core data model

### 4.1 Reading records

The `Reading` collection stores telemetry rows with these fields:

- `s`: device ID
- `t`: timestamp
- `v`: phase voltage array `[R, Y, B]`
- `i`: phase current array `[R, Y, B]`
- `p`: phase power array `[R, Y, B]`
- `e`: energy array `[R, Y, B]`
- `f`: frequency array `[R, Y, B]`
- `pf`: power factor array `[R, Y, B]`
- `n`: neutral current

### 4.2 Device records

The `Device` collection tracks online status and metadata:

- `deviceId`
- `firmwareVersion`
- `apiKey`
- `lastSeen`
- `rssi`
- `freeHeap`
- `uptime`
- `wifiStatus`
- `restartReason`
- `bootCount`
- `ipAddress`
- `status`
- `currentPhase`

### 4.3 Command records

The `Command` collection stores pending and executed remote actions.

Supported commands:

- `restart`
- `ota`
- `reset_energy`
- `clear_logs`
- `sync_time`
- `swap_phase`
- `clear_fault`
- `set_switch_delay`

### 4.4 Firmware records

The `Firmware` collection stores:

- `version`
- `channel`
- `filename`
- `size`
- `sha256`
- `binary`
- `changelog`
- `isLatest`
- `minDeviceVersion`
- `createdBy`

### 4.5 Phase swapper records

The `PhaseSwapper` collection stores:

- `name`
- `currentPhase`: `R | Y | B | NONE`
- `loadType`
- `status`: `active | inactive | fault`
- `lastSwappedAt`
- `switchDelay`

---

## 5. Route catalog

## 5.1 Health and root

### `GET /`

Returns basic service health status.

Response example:

```json
{
  "message": "Chetrika Rayz Backend API is running"
}
```

---

## 5.2 IoT device telemetry ingestion

### `POST /api/data`

Purpose: accept power telemetry from a field device.

Authentication: device API key required.

Accepted body fields:

- `device_id` (or `deviceId` is used internally during processing)
- `fw_version`
- `v1`..`v3`, `i1`..`i3`, `p1`..`p3`, `e1`..`e3`, `f1`..`f3`, `pf1`..`pf3`
- `i_n`
- optional `current_phase`
- optional `voltage`, `current`, `power`, `energy`, `frequency`, `pf` for single-phase swapper devices

Behavior:

- validates that voltage/current do not exceed configured limits
- stores telemetry in MongoDB and in-memory ring buffer
- updates the device status and `lastSeen`
- auto-registers the device if needed
- checks for a pending OTA command and, if present, returns firmware metadata and a signed download URL

Success response:

```json
{
  "received": true
}
```

OTA-enriched response:

```json
{
  "received": true,
  "firmware_url": "https://host/api/iot/firmware/download/2.0.1?token=...",
  "version": "2.0.1",
  "sha256": "...",
  "size": 123456
}
```

### `POST /api/heartbeat`

Purpose: accept periodic health info from the ESP32.

Authentication: device API key required.

Body fields:

- `device_id`
- `fw_version`
- `rssi`
- `free_heap`
- `uptime`
- `wifi_status`
- `restart_reason`
- `boot_count`
- optional `phase` or `current_phase`

Response:

- HTTP 200 with body `ok`

This updates the device record and keeps the device marked online.

---

## 5.3 Authentication endpoints

### `POST /api/auth/login`

Purpose: login for admin dashboard.

Request:

```json
{
  "username": "admin",
  "password": "password123"
}
```

Success response:

```json
{
  "token": "jwt-token",
  "role": "admin",
  "message": "Login successful"
}
```

### `POST /api/auth/verify-danger`

Purpose: verify the superadmin danger-zone password.

Authentication: JWT required, role `superadmin`.

---

## 5.4 Device analytics and live data

### `GET /api/iot/latest`

Authentication: JWT required.

Query:

- `device_id=<id>`

Returns the latest telemetry document from the in-memory ring buffer for that device.

### `GET /api/iot/history`

Authentication: JWT required.

Query parameters:

- `device_id`
- `limit` (default 60)
- `range` (`24h`, `7d`, `30d`, `all`)
- or `from` and `to` timestamps

Returns chart-friendly phase histories.

### `GET /api/iot/stats`

Authentication: JWT required.

Query:

- `device_id`

Returns summary metrics like:

- total power
- average voltage
- average current
- imbalance
- efficiency
- neutral current

### `GET /api/iot/logs`

Authentication: JWT required.

Query:

- `device_id`
- `from`
- `to`
- `page`
- `pageSize`

Returns paginated logs from MongoDB.

### `GET /api/iot/export-csv`

Authentication: JWT required, role `superadmin`.

Exports device telemetry to CSV.

### `POST /api/iot/reset-csv`

Authentication: JWT required, role `superadmin`.

Deletes stored telemetry for a device.

### `POST /api/iot/reset-energy`

Purpose: reset in-memory energy accumulators.

Authentication: either JWT or device API key.

Request:

```json
{
  "device_id": "SW1234"
}
```

### `GET /api/iot/esp-status`

Authentication: JWT required.

Returns connection and liveness info for a device.

### `POST /api/iot/mock-toggle`

Authentication: JWT required, role `superadmin`.

Enables or disables mock data playback for a device.

### `GET /api/iot/mock-status`

Authentication: JWT required.

Returns mock mode state.

---

## 5.5 Device management endpoints

### `GET /api/iot/devices`

Authentication: JWT required.

Returns all registered devices and online/offline counts.

### `GET /api/iot/devices/online`

Authentication: JWT required.

Returns currently online devices.

### `GET /api/iot/devices/offline`

Authentication: JWT required.

Returns offline devices.

### `GET /api/iot/devices/:deviceId`

Authentication: JWT required.

Returns a single device record.

### `GET /api/iot/active-devices`

Authentication: JWT required.

Returns the currently active devices from the reading collection.

### `GET /api/iot/debug-times`

Authentication: JWT required.

Returns first and last timestamp for a device’s stored readings.

---

## 5.6 Remote command system

### `GET /api/commands/:deviceId`

Authentication: device API key required.

Purpose: device polling for pending command.

Behavior:

- finds the next pending command for the device
- marks it as `delivered`
- returns JSON with `command.type` and `command.params`
- adds firmware download URL when the command is OTA

Example response:

```json
{
  "command": {
    "id": "64f...",
    "type": "ota",
    "params": {
      "firmware_url": "https://host/api/iot/firmware/download/2.0.1?token=...",
      "version": "2.0.1",
      "size": 131072,
      "sha256": "..."
    }
  }
}
```

### `POST /api/commands/:id/result`

Authentication: device API key required.

Body:

```json
{
  "status": "executed",
  "result": "ok"
}
```

This updates the command record as `executed` or `failed`.

### `POST /api/iot/devices/:deviceId/command`

Authentication: JWT required, admin/superadmin.

Purpose: push a command to a device.

Valid commands:

- `restart`
- `ota`
- `reset_energy`
- `clear_logs`
- `sync_time`
- `swap_phase`
- `clear_fault`
- `set_switch_delay`

---

## 5.7 Phase swapper APIs

### `GET /api/iot/phase-swappers`

Authentication: JWT required.

Returns all phase swapper records.

### `POST /api/iot/phase-swappers`

Authentication: JWT required, admin/superadmin.

Create a swapper registration.

Request:

```json
{
  "name": "SW001",
  "phase": "R",
  "loadType": "Residential"
}
```

### `PUT /api/iot/phase-swappers/:id/swap`

Authentication: JWT required, admin/superadmin.

Sets the active phase and logs the swap event.

It also pushes a `swap_phase` command to the corresponding hardware device if a device record exists.

### `PUT /api/iot/phase-swappers/:id/switch-delay`

Authentication: JWT required, admin/superadmin.

Body:

```json
{
  "delay_ms": 3000
}
```

Valid range is `500` to `30000` ms.

### `POST /api/iot/phase-swappers/:id/clear-fault`

Authentication: JWT required, admin/superadmin.

Creates a `clear_fault` command and returns a message indicating the device must verify the state.

### `PUT /api/iot/phase-swappers/:id`

Authentication: JWT required, admin/superadmin.

Updates a swapper record.

### `DELETE /api/iot/phase-swappers/:id`

Authentication: JWT required, admin/superadmin.

Deletes a swapper record.

### `GET /api/device/phase`

Authentication: device API key required.

Query:

- `device_id`

Returns current phase assignment for the device and switch delay.

Example:

```json
{
  "phase": "R",
  "switch_delay": 3000
}
```

---

## 5.8 Firmware management endpoints

### `POST /api/iot/firmware/status`

Purpose: OTA status reporting from device.

No auth requirement in the route itself.

Body fields:

- `device_id`
- `current_version`
- `status`
- `detail`

Status values are recorded as OTA events.

### `POST /api/iot/firmware/check`

Purpose: device asks whether a firmware update is available.

Body:

```json
{
  "device_id": "SW1234",
  "current_version": "1.0.0",
  "channel": "stable"
}
```

If a newer stable version exists, it responds with:

```json
{
  "update_available": true,
  "firmware_url": "https://host/api/iot/firmware/download/2.0.1?token=...",
  "version": "2.0.1",
  "size": 123456,
  "sha256": "..."
}
```

### `GET /api/iot/firmware/download/:version`

Purpose: download the binary file for a firmware version.

Security: requires a signed JWT token in the query string called `token`.

Response:

- `application/octet-stream`
- `Content-Disposition: attachment; filename="..."`
- `Content-Length`
- optional `X-SHA256`

### `POST /api/iot/firmware/upload`

Authentication: JWT required, admin/superadmin.

Request body:

```json
{
  "version": "2.0.1",
  "channel": "stable",
  "binary_base64": "<base64 firmware bytes>",
  "changelog": "Bug fixes",
  "minDeviceVersion": "1.0.0"
}
```

Behavior:

- validates version format
- rejects duplicates
- stores binary in MongoDB
- computes `sha256`
- marks new version as latest for that channel

### `GET /api/iot/firmware/versions`

Authentication: JWT required.

Returns all firmware release metadata.

### `GET /api/iot/firmware/ota-events`

Authentication: JWT required, admin/superadmin.

Returns OTA event history.

### `DELETE /api/iot/firmware/:version`

Authentication: JWT required, admin/superadmin.

Deletes a firmware version record.

---

## 5.9 HTTP relay service

The plain HTTP relay is implemented in [website/backend/relay.js](../website/backend/relay.js).

### Purpose

This server is meant for devices that cannot talk to HTTPS directly, such as a GSM modem or constrained hardware. It accepts the request over HTTP and forwards it to the main API server.

### Configuration

Environment variables:

- `PORT` (default `8080`)
- `RELAY_API_KEY` or `DEVICE_API_KEY` (default `cms-device-key-default`)
- `TARGET_API` (default `https://chetrika-rayz.onrender.com`)

### Behavior

It accepts:

- `GET *`
- `POST *`
- `PUT *`

and forwards them to the upstream target while preserving the same API key validation.

It rewrites the request path for the special route:

- `/api/iot/data` -> `/api/data`

This allows the field device to send telemetry to a local relay endpoint while the relay uses the central backend as the actual sink.

---

## 6. Typical request flow for a device

### 6.1 Telemetry upload flow

```text
ESP32 -> POST /api/data
   -> validate API key
   -> write to MongoDB
   -> update ring buffer
   -> update device status
   -> optionally return firmware URL if OTA is queued
```

### 6.2 Command poll flow

```text
ESP32 -> GET /api/commands/:deviceId
   -> find pending command
   -> mark delivered
   -> return payload
   -> device executes command locally
   -> device POST /api/commands/:id/result
```

### 6.3 Firmware update flow

```text
ESP32 -> POST /api/iot/firmware/check
   -> backend finds newer firmware
   -> returns signed firmware download URL
   -> ESP32 downloads binary
   -> backend logs OTA status via /api/iot/firmware/status
```

---

## 7. Operational notes

- The server uses MongoDB as the persistent source of truth for devices, firmware, commands, phase swappers, and telemetry history.
- The in-memory ring buffer is used for low-latency recent data access by the admin dashboard.
- Data writes are protected by validation rules to prevent unrealistic voltage/current spikes.
- Firmware binaries are stored in MongoDB, which keeps OTA releases tied to the same data model as the rest of the backend.
- The relay server is designed for environments where direct SSL connectivity is not available from the field modem.

---

## 8. Summary

The backend is a full DTMS control server. It combines telemetry ingestion, remote command dispatch, device registry management, phase swapper orchestration, firmware lifecycle management, and secure admin dashboard APIs.

The real implementation is defined in [website/backend/server.js](../website/backend/server.js), and the relay path is implemented in [website/backend/relay.js](../website/backend/relay.js).
