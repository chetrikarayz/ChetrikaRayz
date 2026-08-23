#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "firmware.h"

#define WIFI_RETRY_INTERVAL_MS 30000
#define COMMAND_POLL_INTERVAL_MS 3000
#define SEND_INTERVAL_MS 30000

extern String deviceID;
extern char activePhase;

extern float voltage, current, power, energy, frequency, pf;

extern bool wifiConnected;
extern unsigned long lastWifiRetry;
extern unsigned long lastSend;
extern unsigned long lastCommandPoll;

inline bool connectWiFi()
{
  if (wifiConnected && WiFi.status() == WL_CONNECTED)
    return true;

  Serial.println("[WIFI] Connecting...");

  WiFi.mode(WIFI_STA);
  WiFi.begin();

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40)
  {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED)
  {
    wifiConnected = true;
    Serial.print("[WIFI] Connected! IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("[WIFI] Failed to connect");
  wifiConnected = false;
  return false;
}

inline bool wifiHttpPost(const String &path, const String &payload, String *responseBody = nullptr)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[HTTP] WiFi not connected");
    return false;
  }

  String url = String(API_SERVER) + path;
  Serial.print("[HTTP POST] ");
  Serial.println(url);

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(30000);

  int httpCode = http.POST(payload);

  if (httpCode > 0)
  {
    Serial.print("[HTTP POST] Response code: ");
    Serial.println(httpCode);

    if (httpCode >= 200 && httpCode < 300)
    {
      if (responseBody != nullptr)
        *responseBody = http.getString();
      http.end();
      return true;
    }
  }
  else
  {
    Serial.print("[HTTP POST] Failed, error: ");
    Serial.println(http.errorToString(httpCode).c_str());
  }

  http.end();
  return false;
}

inline bool wifiHttpGet(const String &url, String &body, int &httpCode)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[HTTP] WiFi not connected");
    return false;
  }

  Serial.print("[HTTP GET] ");
  Serial.println(url);

  HTTPClient http;
  http.begin(url);
  http.setTimeout(15000);

  httpCode = http.GET();

  if (httpCode > 0)
  {
    Serial.print("[HTTP GET] Response code: ");
    Serial.println(httpCode);

    if (httpCode == 200)
    {
      body = http.getString();
      http.end();
      return true;
    }
  }
  else
  {
    Serial.print("[HTTP GET] Failed, error: ");
    Serial.println(http.errorToString(httpCode).c_str());
  }

  http.end();
  return false;
}

inline String buildDataPayload()
{
  String payload = "{";
  payload += "\"device_id\":\"" + deviceID + "\",";
  payload += "\"fw_version\":\"" FW_VERSION "\",";
  payload += "\"active_phase\":\"" + String(activePhase) + "\",";
  payload += "\"voltage\":" + String(voltage, 2) + ",";
  payload += "\"current\":" + String(current, 3) + ",";
  payload += "\"power\":" + String(power, 2) + ",";
  payload += "\"energy\":" + String(energy, 2) + ",";
  payload += "\"frequency\":" + String(frequency, 2) + ",";
  payload += "\"pf\":" + String(pf, 3);
  payload += "}";
  return payload;
}

inline void sendData()
{
  if (WiFi.status() != WL_CONNECTED) return;

  String payload = buildDataPayload();
  Serial.println("[DATA] Sending...");

  String dataResp;
  if (wifiHttpPost(API_DATA_PATH, payload, &dataResp))
  {
    Serial.println("[DATA] Sent OK");
  }
  else
  {
    Serial.println("[DATA] Send failed");
  }
}

inline void pollCommands()
{
  if (WiFi.status() != WL_CONNECTED) return;

  String url = String(API_SERVER) + "/api/commands/" + deviceID + "?device_id=" + deviceID + "&api_key=" DEVICE_API_KEY;

  String body;
  int httpCode = 0;
  if (!wifiHttpGet(url, body, httpCode) || httpCode != 200)
  {
    Serial.println("[CMD] Poll failed");
    return;
  }

  if (body.indexOf("\"command\":null") >= 0 || body.indexOf("\"id\":\"") < 0)
    return;

  int idStart = body.indexOf("\"id\":\"") + 6;
  int idEnd = body.indexOf("\"", idStart);
  String cmdId = body.substring(idStart, idEnd);

  int typeStart = body.indexOf("\"type\":\"") + 8;
  int typeEnd = body.indexOf("\"", typeStart);
  String cmdType = body.substring(typeStart, typeEnd);

  Serial.print("[CMD] Received: ");
  Serial.println(cmdType);

  if (cmdType == "restart")
  {
    Serial.println("[CMD] Restarting...");
    delay(1000);
    ESP.restart();
  }
  else if (cmdType == "switch_phase")
  {
    int valStart = body.indexOf("\"value\":\"") + 9;
    int valEnd = body.indexOf("\"", valStart);
    String phase = body.substring(valStart, valEnd);
    phase.toUpperCase();

    Serial.print("[CMD] Switch to phase: ");
    Serial.println(phase);
  }
  else if (cmdType == "ota")
  {
    Serial.println("[CMD] OTA command received");
  }
}
