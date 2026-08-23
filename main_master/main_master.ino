#pragma once

#define FW_VERSION "2.0.0"

#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#include "../include/data_types.h"
#include "../include/firmware.h"
#include "../include/device_id.h"
#include "../include/serial_print.h"
#include "../include/simcom_gsm.h"
#include "../include/ota.h"

// ==================== Globals ====================

String deviceID;

HardwareSerial SerialGSM(1);
bool gsmReady = false;
unsigned long lastGSMRetry = 0;

bool otaInProgress = false;
String otaStatus = "";

// ==================== PZEM bus (single UART, addressed) ====================

HardwareSerial PZEMSerial(2);

PZEM004Tv30 phaseR(PZEMSerial, 16, 17, 0x01);
PZEM004Tv30 phaseY(PZEMSerial, 16, 17, 0x02);
PZEM004Tv30 phaseB(PZEMSerial, 16, 17, 0x03);
PZEM004Tv30 neutral(PZEMSerial, 16, 17, 0x04);

PZEMData dataR, dataY, dataB, dataN;

PZEM004Tv30 *const meters[4]     = { &phaseR, &phaseY, &phaseB, &neutral };
PZEMData    *const readings[4]   = { &dataR, &dataY, &dataB, &dataN };
const char  *const meterNames[4] = { "R Phase (0x01)", "Y Phase (0x02)", "B Phase (0x03)", "Neutral (0x04)" };

// ==================== LCD ====================

LiquidCrystal_I2C lcd(0x27, 20, 4);

// ==================== Timers ====================

unsigned long lastPzemRead = 0;
unsigned long lastSendAttempt = 0;
unsigned long lastSend = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastHeartbeat = 0;

const unsigned long PZEM_READ_INTERVAL_MS = 1000;
const unsigned long SEND_INTERVAL_MS = 0;
const unsigned long COMMAND_INTERVAL_MS = 30000;
const unsigned long GSM_RETRY_INTERVAL_MS = 30000;
const unsigned long HEARTBEAT_INTERVAL_MS = 60000;

// Energy reset offsets
float energyOffsetR = 0;
float energyOffsetY = 0;
float energyOffsetB = 0;

// ==================== Meter Reading ====================

void readMeter(PZEM004Tv30 &meter, PZEMData &d)
{
  d.voltage = meter.voltage();

  if (isnan(d.voltage) || d.voltage <= 0)
  {
    d.voltage = d.current = d.power = d.energy = d.frequency = d.pf = 0;
    return;
  }

  d.current   = safeValue(meter.current()) * CT_RATIO;
  d.power     = safeValue(meter.power()) * CT_RATIO;
  d.energy    = safeValue(meter.energy()) * CT_RATIO;
  d.frequency = safeValue(meter.frequency());
  d.pf        = safeValue(meter.pf());
}

void readAllMeters()
{
  for (uint8_t i = 0; i < 4; i++)
    readMeter(*meters[i], *readings[i]);
}

// ==================== Address Commissioning ====================

void setMeterAddress(uint8_t newAddr)
{
  Serial.printf("[ADDR] Programming connected PZEM to 0x%02X...\n", newAddr);
  Serial.println("[ADDR] Make sure ONLY ONE meter is connected to the bus!");

  static PZEM004Tv30 anyMeter(PZEMSerial, 16, 17);

  if (anyMeter.setAddress(newAddr))
    Serial.println("[ADDR] Success! Label the meter, then connect the next one.");
  else
    Serial.println("[ADDR] Failed -- check wiring (single meter, RX/TX, mains power).");
}

// ==================== LCD Display ====================

void initLCD()
{
  lcd.init();
  lcd.backlight();
  lcd.clear();
}

void updateLCD()
{
  static unsigned long lastLCD = 0;
  static unsigned long lastLCDPage = 0;
  static int lcdPage = 0;

  unsigned long now = millis();
  if (now - lastLCD < 500) return;
  lastLCD = now;

  if (now - lastLCDPage >= 5000)
  {
    lcdPage = (lcdPage + 1) % 2;
    lastLCDPage = now;
    lcd.clear();
  }

  if (lcdPage == 0)
  {
    float pTot = dataR.power + dataY.power + dataB.power;

    lcd.setCursor(0, 0);
    lcd.print("R:");
    lcd.print(dataR.voltage, 0);
    lcd.print("V ");
    lcd.print(dataR.current, 2);
    lcd.print("A ");
    lcd.print(dataR.power, 0);
    lcd.print("W");

    lcd.setCursor(0, 1);
    lcd.print("Y:");
    lcd.print(dataY.voltage, 0);
    lcd.print("V ");
    lcd.print(dataY.current, 2);
    lcd.print("A ");
    lcd.print(dataY.power, 0);
    lcd.print("W");

    lcd.setCursor(0, 2);
    lcd.print("B:");
    lcd.print(dataB.voltage, 0);
    lcd.print("V ");
    lcd.print(dataB.current, 2);
    lcd.print("A ");
    lcd.print(dataB.power, 0);
    lcd.print("W");

    lcd.setCursor(0, 3);
    lcd.print("N:");
    lcd.print(dataN.current, 2);
    lcd.print("A Tot:");
    lcd.print(pTot, 0);
    lcd.print("W");
  }
  else
  {
    lcd.setCursor(0, 0);
    lcd.print("ID:");
    lcd.print(deviceID.substring(0, 12));

    lcd.setCursor(0, 1);
    lcd.print("GSM:");
    lcd.print(gsmReady ? "OK " : "FAIL");
    lcd.print(" API:");
    lcd.print(lastSend > 0 && now - lastSend < 15000 ? "OK" : "...");

    lcd.setCursor(0, 2);
    lcd.print("FW:");
    lcd.print(FW_VERSION);
    lcd.print(" ");
    lcd.print(FW_CHANNEL);

    lcd.setCursor(0, 3);
    lcd.print(lastSend > 0 && now - lastSend < 15000 ? "Sending data..." : "Waiting...    ");
  }
}

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
    Serial.println("[MAIN] Heartbeat Sent");
  else
  {
    Serial.println("[MAIN] Heartbeat Failed");
    gsmReady = false;
    lastGSMRetry = millis();
  }
}

// ==================== Command Handling ====================

void handleCommand(JsonDocument &doc)
{
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
      Serial.println("[CMD] OTA params incomplete -- ignored. Use firmware manager to push a firmware version first.");
    }
  }
  else if (strcmp(cmdType, "reset_energy") == 0)
  {
    Serial.println("[CMD] Resetting energy counters");
    energyOffsetR = dataR.energy;
    energyOffsetY = dataY.energy;
    energyOffsetB = dataB.energy;
  }
}

// ==================== Telemetry ====================

void sendTelemetry()
{
  if (!gsmReady) return;

  readAllMeters();

#define FMT(v,p) (isnan(v) ? "null" : String(v, p))

  float rE1 = max(0.0f, dataR.energy - energyOffsetR);
  float rE2 = max(0.0f, dataY.energy - energyOffsetY);
  float rE3 = max(0.0f, dataB.energy - energyOffsetB);

  String payload = "{";
  payload += "\"device_id\":\"" + deviceID + "\",";
  payload += "\"fw_version\":\"" FW_VERSION "\",";
  payload += "\"cmd\":1,";
  payload += "\"v1\":" + FMT(dataR.voltage, 2) + ",";
  payload += "\"i1\":" + FMT(dataR.current, 3) + ",";
  payload += "\"p1\":" + FMT(dataR.power, 2) + ",";
  payload += "\"e1\":" + FMT(rE1, 2) + ",";
  payload += "\"f1\":" + FMT(dataR.frequency, 2) + ",";
  payload += "\"pf1\":" + FMT(dataR.pf, 3) + ",";
  payload += "\"v2\":" + FMT(dataY.voltage, 2) + ",";
  payload += "\"i2\":" + FMT(dataY.current, 3) + ",";
  payload += "\"p2\":" + FMT(dataY.power, 2) + ",";
  payload += "\"e2\":" + FMT(rE2, 2) + ",";
  payload += "\"f2\":" + FMT(dataY.frequency, 2) + ",";
  payload += "\"pf2\":" + FMT(dataY.pf, 3) + ",";
  payload += "\"v3\":" + FMT(dataB.voltage, 2) + ",";
  payload += "\"i3\":" + FMT(dataB.current, 3) + ",";
  payload += "\"p3\":" + FMT(dataB.power, 2) + ",";
  payload += "\"e3\":" + FMT(rE3, 2) + ",";
  payload += "\"f3\":" + FMT(dataB.frequency, 2) + ",";
  payload += "\"pf3\":" + FMT(dataB.pf, 3) + ",";
  payload += "\"i_n\":" + FMT(dataN.current, 3);
  payload += "}";

#undef FMT

  Serial.println("[MAIN] Sending real data...");
  String response;
  if (httpPost(API_DATA_PATH, payload, &response))
  {
    Serial.println("[MAIN] Data sent OK!");
    lastSend = millis();

    JsonDocument doc;
    if (deserializeJson(doc, response) == DeserializationError::Ok)
      handleCommand(doc);
  }
  else
  {
    Serial.println("[MAIN] Send failed -- reinit GSM");
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

  handleCommand(doc);
}

// ==================== Serial Commands ====================

void handleSerial()
{
  if (!Serial.available())
    return;

  char cmd = toupper(Serial.read());

  switch (cmd)
  {
  case 'A':
  {
    delay(50);
    char d = Serial.available() ? Serial.read() : 0;
    if (d >= '1' && d <= '4')
      setMeterAddress(d - '0');
    else
      Serial.println("Usage: A1..A4 (program the single connected meter)");
    break;
  }
  case 'S':
  {
    Serial.println();
    Serial.println("========== DTMS STATUS ==========");
    Serial.println("Device ID : " + deviceID);
    Serial.println("FW        : " FW_VERSION);
    Serial.print("GSM       : ");
    Serial.println(gsmReady ? "CONNECTED" : "DISCONNECTED");
    for (uint8_t i = 0; i < 4; i++)
      printData(meterNames[i], *readings[i]);
    Serial.println("=================================");
    break;
  }
  case 'H':
    Serial.println();
    Serial.println("===== DTMS COMMANDS =====");
    Serial.println("S  = Full status dump");
    Serial.println("A1 = Set meter address 0x01 (R phase)");
    Serial.println("A2 = Set meter address 0x02 (Y phase)");
    Serial.println("A3 = Set meter address 0x03 (B phase)");
    Serial.println("A4 = Set meter address 0x04 (Neutral)");
    Serial.println("     (connect ONE meter at a time!)");
    Serial.println("H  = Help");
    Serial.println("=========================");
    break;
  }

  while (Serial.available())
    Serial.read();
}

// ==================== Setup ====================

void setup()
{
  Serial.begin(115200);

  deviceID = getDeviceID();

  Serial.println("==============================");
  Serial.println("Chetrika Rayz DTMS");
  Serial.println("Device ID: " + deviceID);
  Serial.println("FW Version: " FW_VERSION);
  Serial.println("API: " + String(API_SERVER));
  Serial.println("==============================");
  Serial.println("Type H for serial commands");

  Wire.begin();
  Wire.setClock(100000);
  pinMode(21, INPUT_PULLUP);
  pinMode(22, INPUT_PULLUP);
  initLCD();
  lcd.setCursor(0, 0);
  lcd.print("Chetrika Rayz DTMS");
  lcd.setCursor(0, 1);
  lcd.print("Loading...");

  PZEMSerial.begin(9600, SERIAL_8N1, 16, 17);

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

// ==================== Loop ====================

void loop()
{
  unsigned long now = millis();

  handleSerial();

  if (!gsmReady && now - lastPzemRead >= PZEM_READ_INTERVAL_MS)
  {
    lastPzemRead = now;
    readAllMeters();
  }

  updateLCD();

  if (now - lastSendAttempt >= SEND_INTERVAL_MS)
  {
    lastSendAttempt = now;
    sendTelemetry();
  }

  if (!gsmReady && now - lastGSMRetry >= GSM_RETRY_INTERVAL_MS)
  {
    lastGSMRetry = now;
    Serial.println("[MAIN] Retrying GSM init...");
    gsmReady = initGSM();
  }

  if (now - lastCommandPoll >= COMMAND_INTERVAL_MS)
  {
    lastCommandPoll = now;
    pollCommands();
  }

  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS)
  {
    lastHeartbeat = now;
    sendHeartbeat();
  }
}
