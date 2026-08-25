#pragma once

#include <functional>
#include <HardwareSerial.h>
#include "firmware.h"
#include "device_id.h"

#define GSM_RX GSM_RX_PIN
#define GSM_TX GSM_TX_PIN

extern HardwareSerial SerialGSM;

inline String httpCmd(const String &cmd, unsigned long waitTime, bool exitOnOk = true);
extern bool gsmReady;
extern unsigned long lastGSMRetry;
extern String gsmAPN;

inline void sendAT(const String &cmd, unsigned int waitTime = 2000)
{
  SerialGSM.println(cmd);
  unsigned long start = millis();
  String resp;
  while (millis() - start < waitTime)
  {
    while (SerialGSM.available())
    {
      char c = SerialGSM.read();
      resp += c;
      if (resp.endsWith("OK\r\n") || resp.endsWith("ERROR\r\n"))
        goto done;
    }
    // Yield so the idle task can run and feed the ESP32 task watchdog.
    // Without this, a tight busy-wait here can trigger a WDT reset.
    delay(1);
 }
done:;
}

inline bool initGSM()
{
  Serial.println("[GSM] Initializing A7677S...");
  delay(500);

  {
    const int baudTable[] = { 921600, 115200 };
    int activeBaud = 0;

    for (int b = 0; b < 2; b++)
    {
      if (b > 0)
      {
        Serial.printf("[GSM] Retrying at %d baud...\n", baudTable[b]);
        SerialGSM.end(); delay(100);
        SerialGSM.begin(baudTable[b], SERIAL_8N1, GSM_RX, GSM_TX);
        delay(200);
      }
      while (SerialGSM.available()) SerialGSM.read();
      for (int i = 0; i < 3; i++)
      {
        SerialGSM.println("AT");
        String r;
        unsigned long t = millis();
        while (millis() - t < 2000)
        {
          while (SerialGSM.available())
          {
            char c = SerialGSM.read(); r += c;
          }
          delay(1); // yield for watchdog
        }
        if (r.indexOf("OK") >= 0) { activeBaud = baudTable[b]; goto baud_found; }
        delay(500);
      }
    }
    Serial.println("[GSM] Module not responding!");
    return false;

baud_found:
    Serial.printf("[GSM] Module found at %d baud\n", activeBaud);
    if (activeBaud == 115200)
    {
      sendAT("AT+IPREX=921600", 1000);
      delay(100); SerialGSM.flush(); SerialGSM.end(); delay(100);
      SerialGSM.begin(921600, SERIAL_8N1, GSM_RX, GSM_TX);
      delay(200);
      Serial.println("[GSM] Upgraded to 921600 baud");
    }
    while (SerialGSM.available()) SerialGSM.read();
  }

  SerialGSM.println("AT+CPIN?");
  {
    String cpinResp;
    unsigned long t = millis();
    while (millis() - t < 5000)
    {
      while (SerialGSM.available())
      {
        char c = SerialGSM.read();
        cpinResp += c;
      }
      delay(1); // yield for watchdog
    }
    if (cpinResp.indexOf("+CPIN: READY") < 0)
    {
      Serial.println("[GSM] No SIM detected!");
      return false;
    }
  }

  sendAT("ATE0");

  Serial.println("[GSM] Checking network...");
  for (int r = 0; r < 20; r++)
  {
    while (SerialGSM.available()) SerialGSM.read();
    SerialGSM.println("AT+CREG?");
    String resp;
    unsigned long t = millis();
    while (millis() - t < 2000)
    {
      while (SerialGSM.available())
      {
        char c = SerialGSM.read();
        resp += c;
      }
      delay(1); // yield for watchdog
    }
    if (resp.indexOf("+CREG: 0,1") >= 0 || resp.indexOf("+CREG: 0,5") >= 0)
    {
      Serial.println("[GSM] Network registered!");
      break;
    }
    if (r == 19)
    {
      Serial.println("[GSM] Network registration failed");
      return false;
    }
    delay(3000);
  }

  sendAT("AT+CGDCONT=1,\"IP\",\"" + gsmAPN + "\"", 3000);
  sendAT("AT+CGATT=1", 5000);

  Serial.println("[GSM] Activating PDP context...");
  for (int r = 0; r < 5; r++)
  {
    sendAT("AT+CGACT=1,1", 15000);
    while (SerialGSM.available()) SerialGSM.read();
    SerialGSM.println("AT+CGACT?");
    String actResp;
    unsigned long t = millis();
    while (millis() - t < 3000)
    {
      while (SerialGSM.available())
      {
        char c = SerialGSM.read();
        actResp += c;
      }
      delay(1); // yield for watchdog
    }
    if (actResp.indexOf("+CGACT: 1,1") >= 0) break;
    if (r == 4)
    {
      Serial.println("[GSM] PDP context activation failed");
      return false;
    }
  }

  sendAT("AT+CGPADDR=1", 3000);

  sendAT("AT+HTTPTERM", 1000);
  delay(100);
  String initResp = httpCmd("AT+HTTPINIT", 3000);
  if (initResp.indexOf("ERROR") >= 0)
  {
    Serial.println("[GSM] HTTPINIT failed");
    return false;
  }

  httpCmd("AT+CSSLCFG=\"sslversion\",0,4", 500);
  httpCmd("AT+CSSLCFG=\"authmode\",0,0", 500);
  httpCmd("AT+CSSLCFG=\"ignorelocaltime\",0,1", 500);
  httpCmd("AT+CSSLCFG=\"enableSNI\",0,1", 500);

  return true;
}

inline String httpCmd(const String &cmd, unsigned long waitTime, bool exitOnOk)
{
  SerialGSM.println(cmd);
  unsigned long start = millis();
  String resp;
  while (millis() - start < waitTime)
  {
    while (SerialGSM.available())
    {
      char c = SerialGSM.read();
      resp += c;
      if (exitOnOk && (resp.endsWith("OK\r\n") || resp.endsWith("ERROR\r\n")))
        goto done;
    }
    delay(1); // yield for watchdog — waitTime here can be tens of seconds
  }
done:
  return resp;
}

inline String httpActionCmd(int method, unsigned long timeout)
{
  String cmd = "AT+HTTPACTION=" + String(method);
  SerialGSM.println(cmd);
  unsigned long start = millis();
  String resp;
  int actionIdx = -1;
  while (millis() - start < timeout)
  {
    while (SerialGSM.available())
    {
      char c = SerialGSM.read();
      resp += c;
      if (actionIdx < 0) actionIdx = resp.lastIndexOf("+HTTPACTION:");
      if (actionIdx >= 0 && resp.endsWith("\r\n"))
      {
        delay(5);
        while (SerialGSM.available())
        {
          char d = SerialGSM.read();
          resp += d;
        }
        goto done;
      }
    }
    delay(1); // yield for watchdog — timeout here can be up to 120s (OTA download)
  }
done:
  return resp;
}

inline bool waitPrompt(unsigned long timeout)
{
  unsigned long t = millis();
  String buf;
  while (millis() - t < timeout)
  {
    while (SerialGSM.available())
    {
      char c = SerialGSM.read();
      buf += c;
      if (c == '>' || buf.indexOf("DOWNLOAD") >= 0) return true;
    }
    delay(1); // yield for watchdog
  }
  Serial.println("[HTTP] Prompt timeout");
  return false;
}

inline bool httpSetupSession();

inline bool httpPost(const String &path, const String &payload, String *responseBody = nullptr)
{
  if (!gsmReady) return false;

  String currentUrl = String(API_SERVER) + path;

  // NOTE: AT+HTTPPARA="REDIR",1 tells the modem to follow HTTP redirects
  // itself, so there is no application-level redirect handling to do here.
  // This function retries the whole POST up to 3 times on transient
  // failure, resetting the modem's HTTP session before the final retry.
  for (int retry = 0; retry < 3; retry++)
  {
    httpCmd("AT+HTTPPARA=\"CONTENT\",\"application/json\"", 200);
    httpCmd("AT+HTTPPARA=\"REDIR\",1", 200);

    String urlResp = httpCmd("AT+HTTPPARA=\"URL\",\"" + currentUrl + "\"", 500);
    if (urlResp.indexOf("ERROR") >= 0)
    {
      Serial.println("[HTTP] URL setup failed");
      goto http_fail;
    }

    while (SerialGSM.available()) SerialGSM.read();
    SerialGSM.print("AT+HTTPDATA=");
    SerialGSM.print(payload.length());
    SerialGSM.println(",1000");

    if (!waitPrompt(5000))
    {
      Serial.println("[HTTP] No prompt after HTTPDATA");
      goto http_fail;
    }

    SerialGSM.println(payload);

    {
      String dataConfirm;
      unsigned long t = millis();
      while (millis() - t < 500)
      {
        while (SerialGSM.available())
        {
          char c = SerialGSM.read();
          dataConfirm += c;
          if (dataConfirm.endsWith("OK\r\n") || dataConfirm.endsWith("ERROR\r\n"))
            goto data_done;
        }
        delay(1); // yield for watchdog
      }
      data_done: ;
    }

    {
      String resp = httpActionCmd(1, 60000);

      int code = 0;
      int idx = resp.indexOf("+HTTPACTION:");
      if (idx >= 0)
      {
        int c1 = resp.indexOf(',', idx + 12);
        int c2 = resp.indexOf(',', c1 + 1);
        if (c2 > 0)
          code = resp.substring(c1 + 1, c2).toInt();
      }

      if (code >= 200 && code < 300)
      {
        if (responseBody != nullptr)
        {
          String readResp = httpCmd("AT+HTTPREAD=0,4096", 3000, false);
          int rIdx = readResp.indexOf("+HTTPREAD:");
          if (rIdx >= 0)
          {
            int nl = readResp.indexOf("\r\n", rIdx);
            if (nl >= 0)
            {
              int endIdx = readResp.indexOf("\r\n+HTTPREAD: 0", nl + 2);
              int okIdx = readResp.indexOf("\r\nOK\r\n", nl + 2);
              int cut = -1;
              if (endIdx >= 0 && okIdx >= 0) cut = (endIdx < okIdx) ? endIdx : okIdx;
              else if (endIdx >= 0) cut = endIdx;
              else if (okIdx >= 0) cut = okIdx;
              if (cut >= 0)
                *responseBody = readResp.substring(nl + 2, cut);
            }
          }
        }
        return true;
      }

      if (code >= 400 && code < 500)
      {
        Serial.println("[HTTP] Client error");
        return false;
      }
    }

    http_fail:
    if (retry == 0) { delay(200); continue; }
    if (retry == 1)
    {
      if (!httpSetupSession()) { gsmReady = false; return false; }
      delay(200);
      continue;
    }
    break;
  }

  return false;
}

inline bool httpGet(const String &path, String *responseBody = nullptr)
{
  if (!gsmReady) return false;

  String currentUrl = String(API_SERVER) + path;

  // See the note in httpPost() — redirects are handled by the modem itself
  // via AT+HTTPPARA="REDIR",1; this loop is a retry-on-failure loop only.
  for (int retry = 0; retry < 3; retry++)
  {
    httpCmd("AT+HTTPPARA=\"REDIR\",1", 200);

    String urlResp = httpCmd("AT+HTTPPARA=\"URL\",\"" + currentUrl + "\"", 500);
    if (urlResp.indexOf("ERROR") >= 0) goto http_get_fail;

    {
      String resp = httpActionCmd(0, 30000);

      int code = 0;
      int idx = resp.indexOf("+HTTPACTION:");
      if (idx >= 0)
      {
        int c1 = resp.indexOf(',', idx + 12);
        int c2 = resp.indexOf(',', c1 + 1);
        if (c2 > 0) code = resp.substring(c1 + 1, c2).toInt();
      }

      if (code >= 200 && code < 300)
      {
        if (responseBody != nullptr)
        {
          String readResp = httpCmd("AT+HTTPREAD=0,4096", 3000, false);
          int rIdx = readResp.indexOf("+HTTPREAD:");
          if (rIdx >= 0)
          {
            int nl = readResp.indexOf("\r\n", rIdx);
            if (nl >= 0)
            {
              int endIdx = readResp.indexOf("\r\n+HTTPREAD: 0", nl + 2);
              int okIdx = readResp.indexOf("\r\nOK\r\n", nl + 2);
              int cut = -1;
              if (endIdx >= 0 && okIdx >= 0) cut = (endIdx < okIdx) ? endIdx : okIdx;
              else if (endIdx >= 0) cut = endIdx;
              else if (okIdx >= 0) cut = okIdx;
              if (cut >= 0)
                *responseBody = readResp.substring(nl + 2, cut);
            }
          }
        }
        return true;
      }

      if (code >= 400 && code < 500) return false;
    }

    http_get_fail:
    if (retry == 0) { delay(200); continue; }
    if (retry == 1)
    {
      if (!httpSetupSession()) { gsmReady = false; return false; }
      delay(200);
      continue;
    }
    break;
  }

  return false;
}

// ==================== HTTP Session Helpers ====================

inline bool httpSetupSession()
{
  httpCmd("AT+HTTPTERM", 500);
  delay(100);
  if (httpCmd("AT+HTTPINIT", 3000).indexOf("ERROR") >= 0) return false;
  httpCmd("AT+CSSLCFG=\"sslversion\",0,4", 500);
  httpCmd("AT+CSSLCFG=\"authmode\",0,0", 500);
  httpCmd("AT+CSSLCFG=\"ignorelocaltime\",0,1", 500);
  httpCmd("AT+CSSLCFG=\"enableSNI\",0,1", 500);
  httpCmd("AT+HTTPPARA=\"REDIR\",1", 200);
  httpCmd("AT+HTTPPARA=\"TIMEOUT\",180", 200);
  httpCmd("AT+HTTPPARA=\"BREAK\",0", 200);
  httpCmd("AT+HTTPPARA=\"BUFFER\",0", 200);
  return true;
}

// ==================== Serial helpers ====================

static void consumeOK(unsigned long timeout_ms)
{
  unsigned long t = millis();
  const char pattern[] = "OK\r\n";
  int match = 0;
  while (millis() - t < timeout_ms)
  {
    while (SerialGSM.available())
    {
      char c = SerialGSM.read();
      if (c == pattern[match]) { match++; if (pattern[match] == 0) return; }
      else { match = (c == pattern[0]) ? 1 : 0; }
    }
    delay(1); // yield for watchdog
  }
}

static void drainSerial()
{
  while (SerialGSM.available()) { SerialGSM.read(); delay(1); }
}

// ==================== Streaming Binary Download ====================
// Reads entire HTTP body via a single AT+HTTPREAD=0,total call, handling the
// modem's multi-segment "+HTTPREAD: <len>" framing until a "+HTTPREAD: 0"
// terminator. Feeds raw binary data to the callback without String buffering.

typedef std::function<bool(uint8_t *data, size_t len, size_t totalWritten, size_t totalSize)> StreamCallback;

inline bool gsmDownloadStream(const String &url, StreamCallback cb)
{
  if (!gsmReady) return false;

  if (!httpSetupSession()) return false;

  if (httpCmd("AT+HTTPPARA=\"URL\",\"" + url + "\"", 500).indexOf("ERROR") >= 0) return false;
  httpCmd("AT+HTTPPARA=\"CONTENT\",\"application/octet-stream\"", 200);

  String resp = httpActionCmd(0, 120000);

  int code = 0, contentLen = 0;
  int p = resp.indexOf("+HTTPACTION:");
  if (p >= 0)
  {
    int c1 = resp.indexOf(',', p + 12);
    int c2 = resp.indexOf(',', c1 + 1);
    int c3 = resp.indexOf(',', c2 + 1);
    if (c1 > 0 && c2 > 0)
    {
      code = resp.substring(c1 + 1, c2).toInt();
      if (c3 > 0) contentLen = resp.substring(c2 + 1, c3).toInt();
      else contentLen = resp.substring(c2 + 1).toInt();
    }
  }
  if (code != 200 || contentLen <= 0) return false;

  while (SerialGSM.available()) SerialGSM.read();
  SerialGSM.print("AT+HTTPREAD=");
  SerialGSM.println(contentLen);

  {
    size_t total = 0;
    unsigned long last = millis();
    const unsigned long STALL_TIMEOUT = 120000;
    const unsigned long HEADER_LINE_TIMEOUT = 5000;

    uint8_t buf[1024];
    const char prefix[] = "+HTTPREAD: ";
    size_t pPos = 0;
    size_t segRemain = 0;
    bool readingHeader = true;

    while (total < (size_t)contentLen)
    {
      if (millis() - last > STALL_TIMEOUT)
      {
        Serial.printf("[HTTP] Stream stalled at %u/%d bytes\n",
                       (unsigned)total, contentLen);
        return false;
      }

      if (segRemain > 0)
      {
        size_t want = segRemain > sizeof(buf) ? sizeof(buf) : segRemain;
        size_t got = SerialGSM.readBytes(buf, want);
        if (got > 0)
        {
          last = millis();
          if (!cb(buf, got, total, contentLen)) return false;
          segRemain -= got;
          total += got;
        }
        continue;
      }

      if (readingHeader && SerialGSM.available())
      {
        char c = SerialGSM.read();
        last = millis();

        if (c == prefix[pPos])
        {
          pPos++;
          if (pPos == strlen(prefix))
          {
            pPos = 0;

            String line;
            unsigned long ls = millis();
            bool gotNL = false;
            while (millis() - ls < HEADER_LINE_TIMEOUT)
            {
              if (SerialGSM.available())
              {
                c = SerialGSM.read();
                last = millis();
                ls = millis();
                if (c == '\n') { gotNL = true; break; }
                line += c;
              }
              else
              {
                delay(1); // yield for watchdog
              }
            }
            if (!gotNL) return false;

            int comma = line.indexOf(',');
            String ns = (comma >= 0) ? line.substring(0, comma) : line;
            ns.trim();
            bool numeric = ns.length() > 0;
            for (size_t i = 0; i < ns.length() && numeric; i++)
              if (!isDigit(ns[i])) numeric = false;
            if (!numeric) return false;

            size_t segLen = (size_t)ns.toInt();
            if (segLen == 0)
              readingHeader = false;
            else
              segRemain = segLen;
          }
        }
        else
        {
          pPos = (c == prefix[0]) ? 1 : 0;
        }
      }
      else
      {
        delay(1); // yield for watchdog when nothing is currently available
      }
    }

    consumeOK(3000);
    return true;
  }
}

// ==================== OTA Check ====================

inline bool checkOTAUpdate(String &outUrl, String &outVersion, size_t &outSize)
{
  if (!gsmReady) return false;

  String payload = "{";
  payload += "\"device_id\":\"" + deviceID + "\",";
  payload += "\"current_version\":\"" FW_VERSION "\",";
  payload += "\"channel\":\"" FW_CHANNEL "\"";
  payload += "}";

  String response;
  if (!httpPost(API_FW_CHECK_PATH, payload, &response))
    return false;

  if (response.indexOf("\"update_available\":true") < 0)
    return false;

  int urlStart = response.indexOf("\"firmware_url\":\"") + 16;
  int urlEnd = response.indexOf("\"", urlStart);
  if (urlStart < 16 || urlEnd < 0) return false;
  outUrl = response.substring(urlStart, urlEnd);

  int verStart = response.indexOf("\"version\":\"") + 11;
  int verEnd = response.indexOf("\"", verStart);
  if (verStart < 11 || verEnd < 0) return false;
  outVersion = response.substring(verStart, verEnd);

  Serial.printf("[OTA] check response: \"%s\"\n", response.c_str());

  int sizeColon = response.indexOf("\"size\":");
  if (sizeColon >= 0)
  {
    int p = sizeColon + 7;
    while (p < (int)response.length() && (response.charAt(p) == ' ' || response.charAt(p) == '\t')) p++;
    int sizeEnd = p;
    while (sizeEnd < (int)response.length() && isDigit(response.charAt(sizeEnd))) sizeEnd++;
    if (sizeEnd > p)
      outSize = (size_t)response.substring(p, sizeEnd).toInt();
    else
    {
      outSize = 0;
      Serial.println("[OTA] WARNING: no size digits found after \"size\":");
    }
  }
  else
  {
    outSize = 0;
    Serial.println("[OTA] WARNING: \"size\": not found in response!");
  }

  return true;
}

inline String jsonEscape(const String &in)
{
  String out;
  out.reserve(in.length() + 8);
  for (size_t i = 0; i < in.length(); i++)
  {
    char c = in.charAt(i);
    switch (c)
    {
      case '"':  out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n";  break;
      case '\r': out += "\\r";  break;
      case '\t': out += "\\t";  break;
      default:
        if ((unsigned char)c < 0x20)
        {
          // Skip other control characters rather than emit invalid JSON.
        }
        else
        {
          out += c;
        }
    }
  }
  return out;
}

inline void reportFirmwareStatus(const String &status, const String &detail)
{
  if (!gsmReady) return;

  String payload = "{";
  payload += "\"device_id\":\"" + jsonEscape(deviceID) + "\",";
  payload += "\"current_version\":\"" FW_VERSION "\",";
  payload += "\"status\":\"" + jsonEscape(status) + "\",";
  payload += "\"detail\":\"" + jsonEscape(detail) + "\"";
  payload += "}";

  httpPost(API_FW_STATUS_PATH, payload, nullptr);
}
