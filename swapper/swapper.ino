#pragma once

#include "../include/data_types.h"
#include "../include/firmware.h"
#include "../include/device_id.h"
#include "../include/i2c_master.h"
#include "../include/lcd_display.h"
#include "../include/simcom_gsm.h"
#include <ArduinoJson.h>
#include "../include/ota.h"

// Global variable definitions
String deviceID;
HardwareSerial SerialGSM(1);
bool gsmReady = false;
unsigned long lastGSMRetry = 0;

PZEMData slavePZEM1;
PZEMData slavePZEM2;
PZEMData slavePZEM3;
PZEMData slavePZEM4;

LiquidCrystal_I2C lcd(0x27, 20, 4);

unsigned long lastI2CRead = 0;
unsigned long lastSend = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastHeartbeat = 0;

const unsigned long SEND_INTERVAL_MS = 0;
const unsigned long COMMAND_INTERVAL_MS = 10000;
const unsigned long GSM_RETRY_INTERVAL_MS = 30000;
const unsigned long I2C_READ_INTERVAL_MS = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 60000;

// OTA state
bool otaInProgress = false;
String otaStatus;

// Energy reset offsets (subtracted from raw PZEM readings)
float energyOffset1 = 0;
float energyOffset2 = 0;
float energyOffset3 = 0;

// ==================== Heartbeat ====================

void sendHeartbeat()
{
  if (!gsmReady) return;

  JsonDocument doc;

  doc["device_id"] = deviceID;
  doc["fw_version"] = FW_VERSION;
  doc["wifi_status"] = gsmReady ? "connected" : "disconnected";
  doc["free_heap"] = ESP.getFreeHeap();
  doc["uptime"] = millis() / 1000;

  String payload;
  serializeJson(doc, payload);

  if (httpPost("/api/heartbeat?api_key=" DEVICE_API_KEY, payload, nullptr))
  {
    Serial.println("[MAIN] Heartbeat Sent");
  }
  else
  {
    Serial.println("[MAIN] Heartbeat Failed");
    gsmReady = false;
    lastGSMRetry = millis();
  }
}

// ==================== Command Polling ====================

void pollCommands()
{
  if (!gsmReady) return;

  String endpoint = String(API_COMMANDS_PATH) + "/" + deviceID
    + "?device_id=" + deviceID
    + "&api_key=" DEVICE_API_KEY;

  String response;
  if (!httpGet(endpoint, &response))
  {
    gsmReady = false;
    lastGSMRetry = millis();
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, response))
  {
    Serial.println("[CMD] JSON parse failed");
    return;
  }

  if (doc["command"].isNull())
    return;

  const char* cmdType = doc["command"]["type"];
  if (!cmdType)
    return;

  Serial.print("[CMD] Received: ");
  Serial.println(cmdType);

  if (strcmp(cmdType, "restart") == 0)
  {
    Serial.println("[CMD] Restarting...");
    delay(500);
    ESP.restart();
  }
  else if (strcmp(cmdType, "ota") == 0)
  {
    const char* fwUrl = doc["command"]["params"]["firmware_url"];
    const char* version = doc["command"]["params"]["version"];
    size_t size = (size_t)doc["command"]["params"]["size"];

    if (fwUrl && version && size > 0)
    {
      Serial.printf("[CMD] OTA: %s v%s (%u bytes)\n", fwUrl, version, (unsigned)size);
      performOTA(String(fwUrl), String(version), size);
    }
    else
    {
      Serial.println("[CMD] OTA params incomplete — ignored. Use firmware manager to push a firmware version first.");
    }
  }
  else if (strcmp(cmdType, "reset_energy") == 0)
  {
    Serial.println("[CMD] Resetting energy counters");
    energyOffset1 = slavePZEM1.energy;
    energyOffset2 = slavePZEM2.energy;
    energyOffset3 = slavePZEM3.energy;
  }
}

void setup()
{
  Serial.begin(115200);

  deviceID = getDeviceID();

  Serial.println("==============================");
  Serial.println("Chetrika Rayz Master");
  Serial.println("Device ID: " + deviceID);
  Serial.println("FW Version: " FW_VERSION);
  Serial.println("API: " + String(API_SERVER));
  Serial.println("==============================");

  Wire.begin();
  Wire.setClock(100000);
  pinMode(21, INPUT_PULLUP);
  pinMode(22, INPUT_PULLUP);
  initLCD();
  lcd.setCursor(0, 0);
  lcd.print("Chetrika Rayz");
  lcd.setCursor(0, 1);
  lcd.print("Loading...");

  SerialGSM.setRxBufferSize(16384);
  SerialGSM.begin(921600, SERIAL_8N1, GSM_RX, GSM_TX);

  gsmReady = initGSM();
  Serial.println(gsmReady ? "[MAIN] GSM Ready!" : "[MAIN] GSM Failed!");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(gsmReady ? "GSM Ready" : "GSM Failed");
  lcd.setCursor(0, 1);
  lcd.print("ID:");
  lcd.print(deviceID.substring(0, 8));
}

void loop()
{
  unsigned long now = millis();

  if (now - lastI2CRead >= I2C_READ_INTERVAL_MS)
  {
    lastI2CRead = now;

    if (!getSlavePZEM(1, slavePZEM1))
      Serial.println("PZEM1 Read Failed");

    if (!getSlavePZEM(2, slavePZEM2))
      Serial.println("PZEM2 Read Failed");

    if (!getSlavePZEM(3, slavePZEM3))
      Serial.println("PZEM3 Read Failed");

    if (!getSlavePZEM(4, slavePZEM4))
      Serial.println("PZEM4 (Neutral) Read Failed");
  }

  updateLCD();

  if (now - lastSend >= SEND_INTERVAL_MS)
  {
    if (gsmReady)
    {
#define FMT(v,p) (isnan(v) ? "null" : String(v, p))

      // Apply energy reset offsets
      float rE1 = max(0.0f, slavePZEM1.energy - energyOffset1);
      float rE2 = max(0.0f, slavePZEM2.energy - energyOffset2);
      float rE3 = max(0.0f, slavePZEM3.energy - energyOffset3);

      String payload = "{";
      payload += "\"device_id\":\"" + deviceID + "\",";
      payload += "\"fw_version\":\"" FW_VERSION "\",";
      payload += "\"v1\":" + FMT(slavePZEM1.voltage, 2) + ",";
      payload += "\"i1\":" + FMT(slavePZEM1.current, 3) + ",";
      payload += "\"p1\":" + FMT(slavePZEM1.power, 2) + ",";
      payload += "\"e1\":" + FMT(rE1, 2) + ",";
      payload += "\"f1\":" + FMT(slavePZEM1.frequency, 2) + ",";
      payload += "\"pf1\":" + FMT(slavePZEM1.pf, 3) + ",";
      payload += "\"v2\":" + FMT(slavePZEM2.voltage, 2) + ",";
      payload += "\"i2\":" + FMT(slavePZEM2.current, 3) + ",";
      payload += "\"p2\":" + FMT(slavePZEM2.power, 2) + ",";
      payload += "\"e2\":" + FMT(rE2, 2) + ",";
      payload += "\"f2\":" + FMT(slavePZEM2.frequency, 2) + ",";
      payload += "\"pf2\":" + FMT(slavePZEM2.pf, 3) + ",";
      payload += "\"v3\":" + FMT(slavePZEM3.voltage, 2) + ",";
      payload += "\"i3\":" + FMT(slavePZEM3.current, 3) + ",";
      payload += "\"p3\":" + FMT(slavePZEM3.power, 2) + ",";
      payload += "\"e3\":" + FMT(rE3, 2) + ",";
      payload += "\"f3\":" + FMT(slavePZEM3.frequency, 2) + ",";
      payload += "\"pf3\":" + FMT(slavePZEM3.pf, 3) + ",";
      payload += "\"i_n\":" + FMT(slavePZEM4.current, 3);
      payload += "}";

#undef FMT

      Serial.println("[MAIN] Sending real data...");
      if (httpPost(API_DATA_PATH, payload, nullptr))
        Serial.println("[MAIN] Data sent OK!");
      else
      {
        Serial.println("[MAIN] Send failed -- reinit GSM");
        gsmReady = false;
        lastGSMRetry = now;
      }
    }
    else
    {
      if (now - lastGSMRetry >= GSM_RETRY_INTERVAL_MS)
      {
        lastGSMRetry = now;
        Serial.println("[MAIN] Retrying GSM init...");
        gsmReady = initGSM();
      }
    }

    lastSend = now;
  }

  // Command polling
  if (now - lastCommandPoll >= COMMAND_INTERVAL_MS)
  {
    lastCommandPoll = now;
    pollCommands();
  }

  // Heartbeat
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS)
  {
    lastHeartbeat = now;
    sendHeartbeat();
  }
}
