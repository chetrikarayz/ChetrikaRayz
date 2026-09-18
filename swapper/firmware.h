#pragma once

// ============================================================
// CHEtrika Rayz SWAPPER - CENTRAL FIRMWARE CONFIGURATION
// ============================================================
// IMPORTANT:
// ALL hardware pins are configured ONLY in this file.
// Do not define/change pins anywhere else.
// ============================================================

#ifndef FW_VERSION
#define FW_VERSION "1.2.0-SIM"
#endif

#define FW_CHANNEL "stable"

// ============================================================
// SERVER / DEVICE
// ============================================================

#ifndef API_SERVER
#define API_SERVER "https://api.chetrikarayz.in"
#endif

// NOTE: The runtime device identity actually used throughout this firmware
// (deviceID, see device_id.h) is derived from the ESP32's eFuse MAC address
// at boot, NOT from this macro. This DEVICE_ID macro is currently unused —
// it is kept only as a documented override point in case a future build
// needs a non-MAC-derived ID. Don't assume changing it changes deviceID.
#ifndef DEVICE_ID
#define DEVICE_ID "SW589724077000"
#endif

// SECURITY: every device that ships without DEVICE_API_KEY overridden at
// build time (e.g. -DDEVICE_API_KEY=\"...\") will authenticate to the API
// with this SAME shared placeholder key. That means any device flashed
// without a real per-device (or at minimum per-batch) key can read/command
// any other such device on the same key. This must be overridden per
// device/batch before field deployment — see setup()'s startup check, which
// refuses to arm cloud networking if this placeholder is still in use.
#ifndef DEVICE_API_KEY
#define DEVICE_API_KEY "cms-device-key-default"
#endif

// ============================================================
// RELAY OUTPUT PINS
// ============================================================
// Active LOW relay logic:
// LOW  = Relay ON
// HIGH = Relay OFF

#define RELAY_R_PIN 16
#define RELAY_Y_PIN 17
#define RELAY_B_PIN 18

// ============================================================
// CONTACTOR / RELAY FEEDBACK INPUT PINS
// ============================================================
// ACTIVE LOW:
// LOW  = Contactor ON
// HIGH = Contactor OFF
//
// GPIO 34, 35 and 39 are input-only on ESP32.

#define FB_R 36
#define FB_Y 39
#define FB_B 34

#define FEEDBACK_ON  LOW
#define FEEDBACK_OFF HIGH

// ============================================================
// PZEM UART
// ============================================================

#define PZEM_RX_PIN 33
#define PZEM_TX_PIN 32

// ============================================================
// SIMCOM / A7677S UART
// ============================================================
// ESP32 RX <- A7677S TX
// ESP32 TX -> A7677S RX

#define GSM_RX_PIN 26
#define GSM_TX_PIN 27
#define GSM_BAUD 921600

// ============================================================
// STATUS LED
// ============================================================
// Onboard LED: solid when GSM/cloud is ready, blinking while
// offline / not provisioned.

#define LED_PIN 2

// ============================================================
// USB SERIAL
// ============================================================

#define SERIAL_BAUD 115200

// ============================================================
// SWITCHING / FEEDBACK TIMING
// ============================================================

#define DEFAULT_SWITCH_DELAY_MS 3000
#define FEEDBACK_TIMEOUT_MS 1500
#define FEEDBACK_SETTLE_MS 100

// ============================================================
// LOOP TIMING
// ============================================================
// The PZEM read used to run unthrottled on every ~10ms loop() pass. Each
// PZEM004T Modbus read is actually 6 sequential register reads over a
// 9600 baud UART, so it dominates loop timing anyway; throttling it here
// removes needless PZEM bus traffic and makes loop() cadence predictable.

#define PZEM_READ_INTERVAL_MS 0

// How often to ask the backend for a firmware update.
#define OTA_CHECK_INTERVAL_MS 3600000UL  // 1 hour

// ============================================================
// GSM / APN
// ============================================================

#define DEFAULT_GSM_APN "airtelgprs.com"

// ============================================================
// API PATHS
// ============================================================

#define API_DATA_PATH       "/api/data?api_key=" DEVICE_API_KEY
#define API_FW_CHECK_PATH   "/api/iot/firmware/check"
#define API_FW_STATUS_PATH  "/api/iot/firmware/status"
#define API_COMMANDS_PATH   "/api/commands"

// ============================================================
// FINAL PIN MAP
// ============================================================
//
// GPIO 16  -> R relay OUTPUT
// GPIO 17  -> Y relay OUTPUT
// GPIO 18  -> B relay OUTPUT
//
// GPIO 34  <- R feedback INPUT, LOW = ON
// GPIO 35  <- Y feedback INPUT, LOW = ON
// GPIO 39  <- B feedback INPUT, LOW = ON
//
// GPIO 32  <- PZEM TX / ESP32 RX
// GPIO 33  -> PZEM RX / ESP32 TX
//
// GPIO 27  <- A7677S TX / ESP32 RX
// GPIO 26  -> A7677S RX / ESP32 TX
//
// GPIO 2   -> STATUS LED OUTPUT
//
// USB Serial -> GPIO USB, 115200
//
// SIMCOM / A7677S ONLY
// NO I2C
// ============================================================
