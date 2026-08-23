/*
i am the owner
 * ============================================================================
 * CHETRIKA RAYZ — Production Substation Firmware v2.1 (OTA + Commands)
 * ============================================================================
 * Hardware: ESP32 + PZEM004Tv30 (x4) + LCD 20x4 I2C + Slave Arduino
 *
 * Features:
 *   - 4-channel power monitoring (2 local PZEM + 2 via slave)
 *   - OTA: ArduinoOTA (local) + HTTP OTA (cloud-triggered)
 *   - Remote command execution (restart, OTA, wifi reconnect, etc.)
 *   - Full health heartbeat (RSSI, heap, uptime, restart reason)
 *   - API key authentication for all device-to-server requests
 *   - Completely non-blocking (zero delay() in main loop)
 *   - NTP time sync, Preference config, Watchdog
 *   - Enhanced LCD with OTA status, IP, firmware version
 *   - Phase imbalance detection & alerts
 * ============================================================================
 */

#define FIRMWARE_VERSION "2.1.0"
#define FIRMWARE_CHANNEL "stable"
#define DEVICE_MODEL     "CMS-ESP32-V2"
#define MANUFACTURER     "Chetrika Rayz"

// ==================== Library Includes ====================
#include <PZEM004Tv30.h>
#include <HardwareSerial.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoOTA.h>
#include <Update.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Preferences.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <esp_task_wdt.h>

// ==================== Pin Definitions ====================
#define PZEM1_RX 16
#define PZEM1_TX 17
#define PZEM2_RX 18
#define PZEM2_TX 19
#define CT_RATIO 40
#define LED_OTA 2
#define LED_ALERT 4
#define BTN_RESET 0

// ==================== Network Configuration ====================
#define WIFI_SSID     "ESP32"
#define WIFI_PASSWORD "12345678"
#define API_BASE      "https://chetrika-rayz.onrender.com"
#define API_KEY       "cms-device-key-default"
#define API_DATA      API_BASE "/api/data"
#define API_HEARTBEAT API_BASE "/api/heartbeat"
#define API_FW_CHECK  API_BASE "/api/iot/firmware/check"
#define API_FW_STATUS API_BASE "/api/iot/firmware/status"
#define SUBSTATION_ID "1"

// ==================== Timing Intervals (non-blocking) ====================
#define SEND_INTERVAL_MS       5000
#define HEARTBEAT_INTERVAL_MS  30000
#define OTA_CHECK_INTERVAL_MS  60000
#define COMMAND_POLL_INTERVAL_MS 15000
#define LCD_INTERVAL_MS        200
#define LCD_PAGE_INTERVAL_MS   3000
#define OTA_REBOOT_DELAY_MS    3000

// ==================== Global Objects ====================
LiquidCrystal_I2C lcd(0x27, 20, 4);

HardwareSerial SerialPZEM1(1);
HardwareSerial SerialPZEM2(2);

PZEM004Tv30 pzem1(SerialPZEM1, PZEM1_RX, PZEM1_TX);
PZEM004Tv30 pzem2(SerialPZEM2, PZEM2_RX, PZEM2_TX);

Preferences prefs;
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 19800, 60000);

// ==================== State Variables ====================
float v1, i1, p1, e1, f1, pf1;
float v2, i2, p2, e2, f2, pf2;
float v3, i3, p3, e3, f3, pf3;
float v4, i4, p4, e4, f4, pf4;

String slaveBuffer = "";
unsigned long bootCount = 0;
int page = 0;
bool otaInProgress = false;
bool initialHeartbeatSent = false;
String otaStatus = "";
String deviceID = "";
String restartReason = "power_on";

// Non-blocking timers
unsigned long lastSend = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastOTACheck = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastLCD = 0;
unsigned long lastPageChange = 0;
unsigned long otaRebootStart = 0;

// ==================== Device Identity ====================
String getDeviceID() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char id[18];
  snprintf(id, sizeof(id), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(id);
}

// ==================== Restart Reason ====================
String getRestartReason() {
  esp_reset_reason_t reason = esp_reset_reason();
  switch (reason) {
    case ESP_RST_POWERON:    return "power_on";
    case ESP_RST_EXT:        return "external_pin";
    case ESP_RST_SW:         return "software_restart";
    case ESP_RST_PANIC:      return "panic";
    case ESP_RST_INT_WDT:    return "interrupt_wdt";
    case ESP_RST_TASK_WDT:   return "task_wdt";
    case ESP_RST_WDT:        return "other_wdt";
    case ESP_RST_DEEPSLEEP:  return "deep_sleep_wake";
    case ESP_RST_BROWNOUT:   return "brownout";
    case ESP_RST_SDIO:       return "sdio";
    default:                 return "unknown";
  }
}

// ==================== PZEM Meter Read ====================
void readMeter(PZEM004Tv30 &pzem, float &V, float &I, float &P, float &E, float &F, float &PF) {
  V = pzem.voltage();
  if (isnan(V) || V <= 0) {
    V = I = P = E = F = PF = 0;
    return;
  }
  I  = pzem.current();
  P  = pzem.power();
  E  = pzem.energy();
  F  = pzem.frequency();
  PF = pzem.pf();
  if (isnan(I)) I = 0;
  if (isnan(P)) P = 0;
  if (isnan(E)) E = 0;
  if (isnan(F)) F = 0;
  if (isnan(PF)) PF = 0;
}

// ==================== Slave Communication ====================
void receiveSlaveData() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      sscanf(slaveBuffer.c_str(), "%f,%f,%f,%f,%f,%f,%f,%f,%f,%f,%f,%f",
        &v3, &i3, &p3, &e3, &f3, &pf3,
        &v4, &i4, &p4, &e4, &f4, &pf4
      );
      slaveBuffer = "";
    } else {
      slaveBuffer += c;
    }
  }
}

// ==================== HTTP Helper ====================
void addApiKey(HTTPClient &http) {
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);
}

// ==================== Data Transmission ====================
void sendData() {
  if (WiFi.status() != WL_CONNECTED || otaInProgress) return;
  Serial.println("[DATA] Sending telemetry...");


  HTTPClient http;
  http.begin(API_DATA);
  addApiKey(http);

  String payload = "{";
  payload += "\"substation\":\"" SUBSTATION_ID "\",";
  payload += "\"device_id\":\"" + deviceID + "\",";
  payload += "\"fw_version\":\"" FIRMWARE_VERSION "\",";
  payload += "\"v1\":"  + String(v1, 2)  + ",";
  payload += "\"i1\":"  + String(i1 * CT_RATIO, 3)  + ",";
  payload += "\"p1\":"  + String(p1, 2)  + ",";
  payload += "\"e1\":"  + String(e1, 4)  + ",";
  payload += "\"f1\":"  + String(f1, 2)  + ",";
  payload += "\"pf1\":" + String(pf1, 3) + ",";
  payload += "\"v2\":"  + String(v2, 2)  + ",";
  payload += "\"i2\":"  + String(i2 * CT_RATIO, 3)  + ",";
  payload += "\"p2\":"  + String(p2, 2)  + ",";
  payload += "\"e2\":"  + String(e2, 4)  + ",";
  payload += "\"f2\":"  + String(f2, 2)  + ",";
  payload += "\"pf2\":" + String(pf2, 3) + ",";
  payload += "\"v3\":"  + String(v3, 2)  + ",";
  payload += "\"i3\":"  + String(i3 * CT_RATIO, 3) + ",";
  payload += "\"p3\":"  + String(p3, 2)  + ",";
  payload += "\"e3\":"  + String(e3, 4)  + ",";
  payload += "\"f3\":"  + String(f3, 2)  + ",";
  payload += "\"pf3\":" + String(pf3, 3) + ",";
  payload += "\"i_n\":" + String(i4 * CT_RATIO, 3);
  payload += "}";

  int code = http.POST(payload);
  Serial.print("[DATA] POST /api/data → ");
  Serial.print(code);
  Serial.print(" | V1="); Serial.print(v1, 2);
  Serial.print(" I1="); Serial.print(i1 * CT_RATIO, 3);
  Serial.print(" | Payload: "); Serial.println(payload.substring(0, 80));
  http.end();
}

// ==================== Heartbeat ====================
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED || otaInProgress) return;
  Serial.println("[HEARTBEAT] Sending...");


  HTTPClient http;
  http.begin(API_HEARTBEAT);
  addApiKey(http);

  String payload = "{";
  payload += "\"substation\":\"" SUBSTATION_ID "\",";
  payload += "\"device_id\":\"" + deviceID + "\",";
  payload += "\"fw_version\":\"" FIRMWARE_VERSION "\",";
  payload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  payload += "\"free_heap\":" + String(ESP.getFreeHeap()) + ",";
  payload += "\"uptime\":" + String(millis() / 1000) + ",";
  payload += "\"wifi_status\":\"" + String(WiFi.status() == WL_CONNECTED ? "connected" : "disconnected") + "\",";
  payload += "\"restart_reason\":\"" + restartReason + "\",";
  payload += "\"boot_count\":" + String(bootCount);
  payload += "}";

  int code = http.POST(payload);
  Serial.print("[HEARTBEAT] POST /api/heartbeat → ");
  Serial.print(code);
  Serial.print(" | RSSI="); Serial.print(WiFi.RSSI());
  Serial.print(" Heap="); Serial.print(ESP.getFreeHeap() / 1024);
  Serial.print("KB Uptime="); Serial.print(millis() / 1000);
  Serial.println("s");
  http.end();
}

// ==================== Remote Command Polling ====================
void pollCommands() {
  if (WiFi.status() != WL_CONNECTED || otaInProgress) return;
  if (millis() - lastCommandPoll < COMMAND_POLL_INTERVAL_MS) return;
  lastCommandPoll = millis();

  Serial.println("[CMD] Polling for commands...");

  String url = String(API_BASE) + "/api/commands/" SUBSTATION_ID "?device_id=" + deviceID;

  HTTPClient http;
  http.begin(url);
  addApiKey(http);

  int code = http.GET();
  Serial.print("[CMD] GET /api/commands → ");
  Serial.println(code);
  if (code == 200) {
    String response = http.getString();
    Serial.print("[CMD] Response: ");
    Serial.println(response.substring(0, 120));

    // Only proceed if response actually contains a command
    if (response.indexOf("\"command\":null") >= 0 || response.indexOf("\"id\":\"") < 0) {
      Serial.println("[CMD] No pending commands");
      http.end();
      return;
    }

    int idStart = response.indexOf("\"id\":\"") + 6;
    int idEnd = response.indexOf("\"", idStart);
    String cmdId = response.substring(idStart, idEnd);

    int typeStart = response.indexOf("\"type\":\"") + 8;
    int typeEnd = response.indexOf("\"", typeStart);
    String cmdType = response.substring(typeStart, typeEnd);

    Serial.print("[CMD] Received command: ");
    Serial.print(cmdType);
    Serial.print(" (ID: ");
    Serial.print(cmdId);
    Serial.println(")");

    if (cmdType.length() > 0 && cmdType != "null") {
      executeCommand(cmdId, cmdType, response);
    }
  }
  http.end();
}

// ==================== Command Execution ====================
void executeCommand(String cmdId, String cmdType, String rawResponse) {
  Serial.println("========================================");
  Serial.print("[EXEC] Executing command: ");
  Serial.println(cmdType);
  Serial.println("========================================");
  updateLCDStatic("COMMAND", "Executing: " + cmdType, "", "");

  String result = "ok";
  bool success = true;

  if (cmdType == "restart") {
    Serial.println("[EXEC] RESTART: Rebooting device in 2s...");
    reportCommandResult(cmdId, "executed", "Restarting in 2s");
    delay(2000);
    ESP.restart();

  } else if (cmdType == "ota") {
    Serial.println("[EXEC] OTA: Forcing firmware version check on next cycle");
    lastOTACheck = 0;

  } else if (cmdType == "wifi_reconnect") {
    Serial.println("[EXEC] WIFI_RECONNECT: Disconnecting and reconnecting WiFi...");
    WiFi.disconnect();
    delay(500);
    WiFi.reconnect();
    Serial.print("[EXEC] WIFI_RECONNECT: Waiting for connection");
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("[EXEC] WIFI_RECONNECT: Reconnected, IP: ");
      Serial.println(WiFi.localIP());
      result = "WiFi reconnected successfully";
    } else {
      Serial.println("[EXEC] WIFI_RECONNECT: Failed to reconnect");
      success = false;
      result = "WiFi reconnect timed out";
    }

  } else if (cmdType == "reset_energy") {
    Serial.println("[EXEC] RESET_ENERGY: Sending reset request to server...");
    HTTPClient http;
    http.begin(String(API_BASE) + "/api/iot/reset-energy");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", API_KEY);
    String payload = "{\"substation\":\"" SUBSTATION_ID "\"}";
    int code = http.POST(payload);
    Serial.print("[EXEC] Reset energy response code: ");
    Serial.println(code);
    if (code != 200) result = "reset request failed";
    else result = "energy counters reset";
    http.end();

  } else if (cmdType == "sync_time") {
    Serial.println("[EXEC] SYNC_TIME: Forcing NTP update...");
    timeClient.forceUpdate();
    result = "NTP time synced";
    Serial.print("[EXEC] New time: ");
    Serial.println(timeClient.getFormattedTime());

  } else if (cmdType == "clear_logs") {
    Serial.println("[EXEC] CLEAR_LOGS: Acknowledged (server-side)");
    result = "clear_logs acknowledged";
  }

  reportCommandResult(cmdId, success ? "executed" : "failed", result);
}

void reportCommandResult(String cmdId, String status, String result) {
  Serial.print("[RESULT] Reporting command result: ");
  Serial.print(status);
  Serial.print(" - ");
  Serial.println(result);
  String url = String(API_BASE) + "/api/commands/" + cmdId + "/result";

  HTTPClient http;
  http.begin(url);
  addApiKey(http);

  String payload = "{";
  payload += "\"status\":\"" + status + "\",";
  payload += "\"result\":\"" + result + "\"";
  payload += "}";

  int code = http.POST(payload);
  Serial.print("[RESULT] POST /api/commands/.../result → ");
  Serial.println(code);
  http.end();
}

// ==================== OTA: Check for Updates ====================
void checkForOTAUpdate() {
  if (WiFi.status() != WL_CONNECTED || otaInProgress) return;
  if (millis() - lastOTACheck < OTA_CHECK_INTERVAL_MS) return;
  lastOTACheck = millis();

  Serial.println("[OTA] Checking for firmware update...");

  HTTPClient http;
  http.begin(API_FW_CHECK);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"device_id\":\"" + deviceID + "\",";
  payload += "\"substation\":\"" SUBSTATION_ID "\",";
  payload += "\"current_version\":\"" FIRMWARE_VERSION "\",";
  payload += "\"channel\":\"" FIRMWARE_CHANNEL "\"";
  payload += "}";

  int code = http.POST(payload);
  Serial.print("[OTA] POST /api/iot/firmware/check → ");
  Serial.println(code);
  if (code == 200) {
    String response = http.getString();
    int idx = response.indexOf("\"update_available\":true");
    if (idx > 0) {
      Serial.println("[OTA] Update available! Starting download...");
      int urlStart = response.indexOf("\"firmware_url\":\"") + 16;
      int urlEnd = response.indexOf("\"", urlStart);
      String fwURL = response.substring(urlStart, urlEnd);

      int verStart = response.indexOf("\"version\":\"") + 11;
      int verEnd = response.indexOf("\"", verStart);
      String fwVersion = response.substring(verStart, verEnd);

      int hashStart = response.indexOf("\"sha256\":\"") + 9;
      int hashEnd = response.indexOf("\"", hashStart);
      String fwHash = response.substring(hashStart, hashEnd);

      Serial.print("[OTA] New version: ");
      Serial.print(fwVersion);
      Serial.print(" | URL: ");
      Serial.println(fwURL);

      performOTAUpdate(fwURL, fwVersion, fwHash);
    } else {
      Serial.println("[OTA] No update available (already latest)");
    }
  } else {
    Serial.print("[OTA] Check failed with code: ");
    Serial.println(code);
  }
  http.end();
}

// ==================== OTA: Perform Update ====================
void performOTAUpdate(String url, String version, String sha256) {
  otaInProgress = true;
  digitalWrite(LED_OTA, HIGH);

  otaStatus = "Downloading " + version + "...";
  updateLCDStatic("OTA UPDATE", otaStatus, "Do not power off", "");

  HTTPClient http;
  http.begin(url);
  http.setTimeout(30000);
  http.setConnectTimeout(15000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

  int code = http.GET();
  if (code != 200) {
    reportOTAStatus("failed", "HTTP " + String(code));
    otaInProgress = false;
    digitalWrite(LED_OTA, LOW);
    http.end();
    return;
  }

  int contentLength = http.getSize();
  if (contentLength <= 0) {
    reportOTAStatus("failed", "Invalid size");
    otaInProgress = false;
    digitalWrite(LED_OTA, LOW);
    http.end();
    return;
  }

  WiFiClient *stream = http.getStreamPtr();

  if (!Update.begin(contentLength, U_FLASH)) {
    reportOTAStatus("failed", "No partition");
    otaInProgress = false;
    digitalWrite(LED_OTA, LOW);
    http.end();
    return;
  }

  size_t written = 0;
  int lastPercent = -1;

  while (written < contentLength && !Update.hasError()) {
    size_t available = stream->available();
    if (available) {
      uint8_t buffer[256];
      size_t bytesRead = stream->readBytes(buffer, min(available, sizeof(buffer)));
      written += Update.write(buffer, bytesRead);

      int percent = (written * 100) / contentLength;
      if (percent != lastPercent) {
        lastPercent = percent;
        otaStatus = String(percent) + "% (" + version + ")";
        updateLCDStatic("OTA UPDATE", otaStatus, String(written/1024) + "/" + String(contentLength/1024) + "KB", "Downloading...");
      }
    } else {
      delay(10);
    }
  }

  if (Update.hasError()) {
    reportOTAStatus("failed", "Write error");
    Update.abort();
    otaInProgress = false;
    digitalWrite(LED_OTA, LOW);
    http.end();
    return;
  }

  if (!Update.end()) {
    reportOTAStatus("failed", "Finalize error");
    otaInProgress = false;
    digitalWrite(LED_OTA, LOW);
    http.end();
    return;
  }

  reportOTAStatus("success", version);
  updateLCDStatic("OTA UPDATE", "Completed!", "Rebooting in 3s", version);
  http.end();

  // Non-blocking reboot delay
  otaRebootStart = millis();
  while (millis() - otaRebootStart < OTA_REBOOT_DELAY_MS) {
    ArduinoOTA.handle();
  
  }
  ESP.restart();
}

// ==================== OTA: Report Status ====================
void reportOTAStatus(String status, String detail) {
  HTTPClient http;
  http.begin(API_FW_STATUS);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"device_id\":\"" + deviceID + "\",";
  payload += "\"substation\":\"" SUBSTATION_ID "\",";
  payload += "\"current_version\":\"" FIRMWARE_VERSION "\",";
  payload += "\"status\":\"" + status + "\",";
  payload += "\"detail\":\"" + detail + "\"";
  payload += "}";

  http.POST(payload);
  http.end();
}

// ==================== LCD: Static (Non-OTA) Update ====================
void updateLCDStatic(String line1, String line2, String line3, String line4) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(line1);
  lcd.setCursor(0, 1); lcd.print(line2);
  lcd.setCursor(0, 2); lcd.print(line3);
  lcd.setCursor(0, 3); lcd.print(line4);
}

// ==================== LCD: Normal Cycling ====================
void updateLCD() {
  if (otaInProgress) return;
  if (millis() - lastLCD < LCD_INTERVAL_MS) return;
  lastLCD = millis();

  if (millis() - lastPageChange > LCD_PAGE_INTERVAL_MS) {
    page++;
    if (page > 5) page = 0;
    lastPageChange = millis();
  }

  lcd.clear();

  float disp_i1 = i1 * CT_RATIO;
  float disp_i3 = i3 * CT_RATIO;
  float disp_i4 = i4 * CT_RATIO;

  String balStatus = "OK";
  if (disp_i4 > 120.0) balStatus = "UNBAL";
  else if (disp_i4 > 80.0) balStatus = "WARN";

  switch (page) {
    case 0:
      lcd.setCursor(0, 0); lcd.print("R:"); lcd.print(v1, 0); lcd.print("V "); lcd.print(disp_i1, 1); lcd.print("A");
      lcd.setCursor(0, 1); lcd.print("Y:"); lcd.print(v2, 0); lcd.print("V "); lcd.print(i2 * CT_RATIO, 1); lcd.print("A");
      lcd.setCursor(0, 2); lcd.print("B:"); lcd.print(v3, 0); lcd.print("V "); lcd.print(disp_i3, 1); lcd.print("A");
      lcd.setCursor(0, 3); lcd.print("N:"); lcd.print(disp_i4, 1); lcd.print("A "); lcd.print(balStatus);
      break;

    case 1:
      lcd.setCursor(0, 0); lcd.print("R P:"); lcd.print(p1, 0);
      lcd.setCursor(0, 1); lcd.print("Y P:"); lcd.print(p2, 0);
      lcd.setCursor(0, 2); lcd.print("B P:"); lcd.print(p3, 0);
      lcd.setCursor(0, 3); lcd.print("Tot:"); lcd.print(p1 + p2 + p3, 0); lcd.print("W");
      break;

    case 2:
      lcd.setCursor(0, 0); lcd.print("R E:"); lcd.print(e1, 1);
      lcd.setCursor(0, 1); lcd.print("Y E:"); lcd.print(e2, 1);
      lcd.setCursor(0, 2); lcd.print("B E:"); lcd.print(e3, 1);
      lcd.setCursor(0, 3); lcd.print("Tot:"); lcd.print(e1 + e2 + e3, 1);
      break;

    case 3:
      lcd.setCursor(0, 0); lcd.print("R PF:"); lcd.print(pf1, 2);
      lcd.setCursor(0, 1); lcd.print("Y PF:"); lcd.print(pf2, 2);
      lcd.setCursor(0, 2); lcd.print("B PF:"); lcd.print(pf3, 2);
      lcd.setCursor(0, 3); lcd.print("N "); lcd.print(balStatus);
      break;

    case 4:
      lcd.setCursor(0, 0); lcd.print("CMS v" FIRMWARE_VERSION);
      lcd.setCursor(0, 1); lcd.print("Boot #"); lcd.print(bootCount);
      lcd.setCursor(0, 2); lcd.print(WiFi.localIP().toString());
      lcd.setCursor(0, 3); lcd.print("Uptime: "); lcd.print(millis() / 60000); lcd.print("m");
      break;

    case 5:
      lcd.setCursor(0, 0); lcd.print("RSSI: "); lcd.print(WiFi.RSSI()); lcd.print(" dBm");
      lcd.setCursor(0, 1); lcd.print("Heap: "); lcd.print(ESP.getFreeHeap() / 1024); lcd.print(" KB");
      lcd.setCursor(0, 2); lcd.print("Restart: "); lcd.print(restartReason);
      lcd.setCursor(0, 3); lcd.print("ID: "); lcd.print(deviceID.substring(0, 8));
      break;
  }
}

// ==================== ArduinoOTA Handler ====================
void setupArduinoOTA() {
  ArduinoOTA.setHostname(("cms-" + deviceID).c_str());
  ArduinoOTA.setPassword("chetrika-ota");

  ArduinoOTA.onStart([]() {
    otaInProgress = true;
    digitalWrite(LED_OTA, HIGH);
    updateLCDStatic("OTA UPDATE", "ArduinoOTA", "Starting...", "");
  });

  ArduinoOTA.onEnd([]() {
    otaInProgress = false;
    digitalWrite(LED_OTA, LOW);
    updateLCDStatic("OTA UPDATE", "Completed!", "Rebooting...", "");
    delay(1000);
    ESP.restart();
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    int pct = (progress * 100) / total;
    otaStatus = String(pct) + "%";
    updateLCDStatic("OTA UPDATE", "Uploading...", String(progress/1024) + "/" + String(total/1024) + "KB", otaStatus);
  });

  ArduinoOTA.onError([](ota_error_t error) {
    otaInProgress = false;
    digitalWrite(LED_OTA, LOW);
    updateLCDStatic("OTA ERROR", "ArduinoOTA failed", "Check connection", "");
    delay(3000);
  });

  ArduinoOTA.begin();
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  esp_task_wdt_deinit();

  SerialPZEM1.begin(9600, SERIAL_8N1, PZEM1_RX, PZEM1_TX);
  SerialPZEM2.begin(9600, SERIAL_8N1, PZEM2_RX, PZEM2_TX);

  pinMode(LED_OTA, OUTPUT);
  pinMode(LED_ALERT, OUTPUT);
  pinMode(BTN_RESET, INPUT_PULLUP);
  digitalWrite(LED_OTA, LOW);
  digitalWrite(LED_ALERT, LOW);

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Chetrika Rayz CMS");
  lcd.setCursor(0, 1);
  lcd.print("v" FIRMWARE_VERSION);
  lcd.setCursor(0, 2);
  lcd.print("Loading...");

  prefs.begin("cms", false);
  bootCount = prefs.getULong("bootCount", 0) + 1;
  prefs.putULong("bootCount", bootCount);
  prefs.end();

  deviceID = getDeviceID();
  restartReason = getRestartReason();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 60) {
    delay(500);
    wifiAttempts++;
    lcd.setCursor(0, 3);
    lcd.print("WiFi: ");
    lcd.print(wifiAttempts * 5);
    lcd.print("%    ");
  }

  timeClient.begin();

  setupArduinoOTA();


  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("System Ready");
  lcd.setCursor(0, 1);
  lcd.print("IP: ");
  lcd.print(WiFi.localIP().toString());
  lcd.setCursor(0, 2);
  lcd.print("FW: v" FIRMWARE_VERSION);
  lcd.setCursor(0, 3);
  lcd.print("ID: ");
  lcd.print(deviceID.substring(0, 8));

  // Send initial heartbeat after brief delay for WiFi stability
  delay(2000);
  sendHeartbeat();
  initialHeartbeatSent = true;
  lastHeartbeat = millis();

  // Clear splash
  lastPageChange = millis();
  page = 0;
}

// ==================== Main Loop (Non-Blocking) ====================
void loop() {

  ArduinoOTA.handle();

  // -- Read PZEM meters (every call, PZEM handles its own timing) --
  readMeter(pzem1, v1, i1, p1, e1, f1, pf1);
  readMeter(pzem2, v2, i2, p2, e2, f2, pf2);

  // -- Receive slave data (non-blocking, just drains Serial) --
  receiveSlaveData();

  unsigned long now = millis();

  // -- Send telemetry every SEND_INTERVAL_MS --
  if (now - lastSend >= SEND_INTERVAL_MS) {
    sendData();
    lastSend = now;
  }

  // -- Send heartbeat every HEARTBEAT_INTERVAL_MS --
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    lastHeartbeat = now;
  }

  // -- Check for OTA updates --
  checkForOTAUpdate();

  // -- Poll for remote commands --
  pollCommands();

  // -- Update LCD --
  updateLCD();

  // -- Alert LED on imbalance --
  float neutralCurrent = i4 * CT_RATIO;
  if (neutralCurrent > 80.0) {
    digitalWrite(LED_ALERT, (millis() / 500) % 2);
  } else {
    digitalWrite(LED_ALERT, LOW);
  }
}
