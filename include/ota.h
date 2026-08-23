#pragma once

#include <Arduino.h>
#include <Update.h>
#include "simcom_gsm.h"
#include "device_id.h"

extern bool otaInProgress;
extern String otaStatus;

#ifndef OTA_CHECK_INTERVAL_MS
#define OTA_CHECK_INTERVAL_MS 60000
#endif
#ifndef OTA_REBOOT_DELAY_MS
#define OTA_REBOOT_DELAY_MS 3000
#endif

inline void setupOTA()
{
  otaInProgress = false;
}

// ==================== HTTP Firmware Download (Re-fetch Strategy) ====================
// Phase 1: Cursor-based AT+HTTPREAD=<len> — single burst for ~75%
// Phase 2: Re-fetch HTTP session + offset-based AT+HTTPREAD=offset,len — repeat until done
//
// Response formats (cursor): +HTTPREAD: <len>\r\n<data>\r\n+HTTPREAD: <len2>\r\n...\r\n+HTTPREAD: 0\r\nOK\r\n
// Response formats (offset): +HTTPREAD: <len>\r\n<data>\r\nOK\r\n

// === HTTP session helper ===
static bool httpFetch(const String &fwUrl, int &outCode, int &outLen)
{
  if (!httpSetupSession()) return false;
  if (httpCmd("AT+HTTPPARA=\"URL\",\"" + fwUrl + "\"", 500).indexOf("ERROR") >= 0) return false;

  String resp = httpActionCmd(0, 180000);
  int idx = resp.indexOf("+HTTPACTION:");
  if (idx < 0) return false;

  int c1 = resp.indexOf(',', idx + 12);
  int c2 = resp.indexOf(',', c1 + 1);
  int c3 = resp.indexOf(',', c2 + 1);
  if (c1 < 0 || c2 < 0) return false;

  outCode = resp.substring(c1 + 1, c2).toInt();
  if (c3 > 0) outLen = resp.substring(c2 + 1, c3).toInt();
  else outLen = resp.substring(c2 + 1).toInt();
  return outCode == 200 && outLen > 0;
}

// Read a length value from serial (ASCII until \n)
static bool readLen(size_t &out)
{
  unsigned long t = millis();
  String line;
  while (millis() - t < 5000)
  {
    while (SerialGSM.available())
    {
      char c = SerialGSM.read();
      if (c == '\n') { line.trim(); out = (size_t)line.toInt(); return true; }
      line += c;
    }
  }
  return false;
}

struct ReadResult { enum { TIMEOUT, END_OF_DATA, DATA }; };

// Reads one chunk from the modem's HTTP buffer at the given offset.
// Updates *written with bytes read; caller writes buf[0 .. (written-prevWritten)] to flash.
static int readOffsetChunk(size_t offset, size_t chunkLen, uint8_t *buf, size_t bufSize,
                            size_t &written, size_t totalSize, int &lastPct)
{
  delay(10);
  SerialGSM.print("AT+HTTPREAD=");
  SerialGSM.print(offset);
  SerialGSM.print(",");
  SerialGSM.println(chunkLen);

  const char prefix[] = "+HTTPREAD: ";
  size_t pPos = 0;
  unsigned long deadline = millis() + 30000;

  while (millis() < deadline)
  {
    if (SerialGSM.available())
    {
      char c = SerialGSM.read();
      if (c == prefix[pPos]) pPos++;
      else pPos = (c == prefix[0]) ? 1 : 0;
      if (pPos == strlen(prefix))
      {
        size_t segLen = 0;
        if (!readLen(segLen)) return ReadResult::TIMEOUT;
        if (segLen == 0) return ReadResult::END_OF_DATA;

        size_t toRead = min(segLen, bufSize);
        size_t got = SerialGSM.readBytes(buf, toRead);
        if (got > 0)
        {
          written += got;
          int pct = (int)((written * 100UL) / totalSize);
          if (pct != lastPct) { lastPct = pct; Serial.printf("[OTA] %d%% (%d/%d KB)\n", pct, (int)(written/1024), (int)(totalSize/1024)); }
        }
        consumeOK(3000);
        return (got > 0) ? ReadResult::DATA : ReadResult::TIMEOUT;
      }
    }
  }

  Serial.printf("[OTA] TIMEOUT at offset %u\n", (unsigned)offset);
  unsigned long dumpDeadline = millis() + 200;
  Serial.print("[OTA] Raw: \"");
  while (millis() < dumpDeadline) {
    while (SerialGSM.available()) {
      char c = SerialGSM.read();
      if (c >= 32 && c < 127) Serial.print(c);
      else Serial.printf("\\x%02X", (uint8_t)c);
    }
  }
  Serial.println("\"");
  return ReadResult::TIMEOUT;
}

inline bool performOTA(const String &fwUrl, const String &version, size_t totalSize)
{
  otaInProgress = true;
  otaStatus = "Starting OTA...";

  if (!gsmReady)
  {
    reportFirmwareStatus("failed", "GSM not ready");
    otaInProgress = false;
    return false;
  }

  Serial.printf("[OTA] Target: %d KB (%u bytes)\n", (int)(totalSize / 1024), (unsigned)totalSize);
  if (!Update.begin(totalSize, U_FLASH))
  {
    reportFirmwareStatus("failed", "No partition");
    otaInProgress = false; return false;
  }

  const size_t NEED = totalSize;
  size_t written = 0;
  int lastPct = -1;
  uint8_t buf[4096];

  // ---- Phase 1: Cursor-based burst (single session) ----
  {
    int code = 0, respLen = 0;
    if (!httpFetch(fwUrl, code, respLen))
    {
      reportFirmwareStatus("failed", "HTTP fetch");
      Update.abort(); otaInProgress = false; return false;
    }
    Serial.printf("[OTA] HTTP %d, %d bytes\n", code, respLen);

    drainSerial();
    SerialGSM.print("AT+HTTPREAD=");
    SerialGSM.println(NEED);

    const char prefix[] = "+HTTPREAD: ";
    size_t pPos = 0;
    size_t segLen = 0;
    unsigned long lastData = millis();

    while (written < NEED && millis() - lastData < 20000)
    {
      if (segLen > 0)
      {
        size_t want = segLen > sizeof(buf) ? sizeof(buf) : segLen;
        size_t got = SerialGSM.readBytes(buf, want);
        if (got > 0)
        {
          lastData = millis();
          if (Update.write(buf, got) != got) { reportFirmwareStatus("failed", "Flash"); Update.abort(); otaInProgress = false; return false; }
          segLen -= got;
          written += got;
          int pct = (int)((written * 100UL) / NEED);
          if (pct != lastPct) { lastPct = pct; otaStatus = String(pct) + "%"; Serial.printf("[OTA] %d%% (%d/%d KB)\n", pct, (int)(written/1024), (int)(NEED/1024)); }
        }
        continue;
      }

      if (SerialGSM.available())
      {
        char c = SerialGSM.read();
        if (c == prefix[pPos]) pPos++;
        else pPos = (c == prefix[0]) ? 1 : 0;
        if (pPos == strlen(prefix))
        {
          pPos = 0;
          if (!readLen(segLen)) break;
          if (segLen == 0) break;
        }
      }
    }

    consumeOK(3000);
    Serial.printf("[OTA] Phase 1 done: %u/%u bytes\n", (unsigned)written, (unsigned)NEED);
  }

  if (written >= NEED) goto finalize;

  // ---- Phase 2: Re-fetch + offset reads (repeat until complete) ----
  {
    for (int session = 0; session < 20 && written < NEED; session++)
    {
      httpCmd("AT+HTTPTERM", 500);
      delay(300);

      int code = 0, respLen = 0;
      if (!httpFetch(fwUrl, code, respLen))
      {
        Serial.println("[OTA] Re-fetch failed, token may have expired");
        break;
      }

      int timeouts = 0;
      for (int chunk = 0; chunk < 8 && written < NEED && timeouts < 3; chunk++)
      {
        size_t prevWritten = written;
        size_t want = min((size_t)4096, NEED - written);
        int r = readOffsetChunk(written, want, buf, sizeof(buf), written, NEED, lastPct);
        size_t got = written - prevWritten;

        if (r == ReadResult::DATA && got > 0)
        {
          if (Update.write(buf, got) != got)
          {
            reportFirmwareStatus("failed", "Flash");
            Update.abort(); otaInProgress = false; return false;
          }
          timeouts = 0;
        }
        else if (r == ReadResult::END_OF_DATA)
        {
          break;
        }
        else
        {
          timeouts++;
          delay(500);
        }
      }
    }
  }

  if (written < NEED)
  {
    Serial.printf("[OTA] Incomplete: %u/%u\n", (unsigned)written, (unsigned)NEED);
    reportFirmwareStatus("failed", "Incomplete");
    Update.abort(); otaInProgress = false; return false;
  }

finalize:
  // --- Finalize ---
  if (Update.hasError())
  {
    reportFirmwareStatus("failed", "Flash error");
    Update.abort();
    otaInProgress = false;
    return false;
  }

  if (!Update.end())
  {
    reportFirmwareStatus("failed", "Finalize");
    otaInProgress = false;
    return false;
  }

  reportFirmwareStatus("success", version);
  otaStatus = "Completed!";
  Serial.println("[OTA] Done, rebooting...");
  delay(OTA_REBOOT_DELAY_MS);
  ESP.restart();
  return true;
}

inline void checkForOTAUpdate()
{
  if (otaInProgress) return;

  static unsigned long lastCheck = 0;
  unsigned long now = millis();
  if (now - lastCheck < OTA_CHECK_INTERVAL_MS) return;
  lastCheck = now;

  if (!gsmReady) return;

  String fwUrl, fwVersion;
  size_t fwSize = 0;
  if (checkOTAUpdate(fwUrl, fwVersion, fwSize))
  {
    Serial.println("[OTA] Update available: " + fwVersion);
    performOTA(fwUrl, fwVersion, fwSize);
  }
}
