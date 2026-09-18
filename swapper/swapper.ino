#include <Arduino.h>
#include <Preferences.h>
#include <PZEM004Tv30.h>
#include <ArduinoJson.h>
#include <Update.h>

#include "firmware.h"
#include "device_id.h"
#include "pzem_local.h"
#include "swapper_relay.h"
#include "simcom_gsm.h"

// ============================================================
// CHETRIKA RAYZ - SIM ONLY PHASE SWAPPER
// ============================================================
// Network:
//   SIMCOM / A7677S ONLY
//
// USB Serial:
//   R
//   Y
//   B
//   OFF
//   SWAP R
//   SWAP Y
//   SWAP B
//   STATUS
//   APN <apn>
//   DELAY <milliseconds>
//   DATA
//   GSM
//   RESTART
//   HELP
//
// Safety:
//   - Break-before-make
//   - Only one relay may be ON
//   - Physical feedback is verified
//   - Feedback is ACTIVE LOW
//   - Any feedback failure forces all relays OFF
//
// ALL HARDWARE PINS ARE DEFINED ONLY IN firmware.h.
// All headers live in this sketch folder (no shared ../include).
// ============================================================

String deviceID;
String gsmAPN = DEFAULT_GSM_APN;

char activePhase = 'N';
unsigned long switchDelayMs = DEFAULT_SWITCH_DELAY_MS;

HardwareSerial SerialPZEM_N(2);
PZEM004Tv30 pzemN(SerialPZEM_N, PZEM_RX_PIN, PZEM_TX_PIN);
HardwareSerial SerialGSM(1);

float voltage = 0;
float current = 0;
float power = 0;
float energy = 0;
float frequency = 0;
float pf = 0;
bool meterValid = false;

// Telemetry reports max(0, energy - energyOffset); the reset_energy
// cloud command re-zeros the counter without touching the meter.
float energyOffset = 0;

bool gsmReady = false;
unsigned long lastGSMRetry = 0;
unsigned long lastSend = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastPZEMRead = 0;
unsigned long lastOTACheck = 0;

// Cloud link arming flag. Devices flashed with the placeholder API key
// still connect (matching the fleet's existing behaviour); boot only prints
// a provisioning WARNING instead of blocking. See checkProvisioning().
bool cloudArmed = true;

const unsigned long SEND_INTERVAL_MS = 0UL;
const unsigned long COMMAND_POLL_INTERVAL_MS = 1000UL;
const unsigned long HEARTBEAT_INTERVAL_MS = 60000UL;
const unsigned long GSM_RETRY_INTERVAL_MS = 30000UL;

String serialLine;

// Forward declarations: these are referenced before they are defined,
// and not every build system runs the IDE's auto-prototype pass.
bool performOTA(const String &url, size_t expectedSize, const String &expectedMd5);

// True if s is exactly 32 lowercase/uppercase hex characters (an MD5 hex
// digest). Used to sanity-check a backend-supplied hash before handing it
// to Update.setMD5(), which itself just returns false on anything invalid.
bool isValidMd5Hex(const String &s)
{
  if (s.length() != 32) return false;
  for (size_t i = 0; i < s.length(); i++)
    if (!isHexadecimalDigit(s.charAt(i))) return false;
  return true;
}
void fetchDeviceConfig();

// ============================================================
// SETTINGS
// ============================================================

void loadSettings()
{
  Preferences p;
  p.begin("swapper", true);

  gsmAPN = p.getString("apn", DEFAULT_GSM_APN);
  switchDelayMs = p.getULong("delay", DEFAULT_SWITCH_DELAY_MS);

  p.end();

  if (gsmAPN.length() == 0)
    gsmAPN = DEFAULT_GSM_APN;

  if (switchDelayMs < 500 || switchDelayMs > 30000)
    switchDelayMs = DEFAULT_SWITCH_DELAY_MS;
}

void saveAPN()
{
  Preferences p;
  p.begin("swapper", false);
  p.putString("apn", gsmAPN);
  p.end();
}

void saveDelay()
{
  Preferences p;
  p.begin("swapper", false);
  p.putULong("delay", switchDelayMs);
  p.end();
}

void savePhase(char phase)
{
  Preferences p;
  p.begin("swapper", false);
  p.putString("lastPhase", String(phase));
  p.end();
}

char loadPhase()
{
  Preferences p;
  p.begin("swapper", true);
  String phase = p.getString("lastPhase", "N");
  p.end();

  // A single-char value is this firmware's own; anything longer is a
  // legacy entry such as "NONE" and simply means all-off.
  if (phase.length() != 1)
    return 'N';

  char c = toupper(phase.charAt(0));
  return (c == 'R' || c == 'Y' || c == 'B') ? c : 'N';
}

// ============================================================
// GSM
// ============================================================

bool startSIM()
{
  Serial.println("[SIM] Starting A7677S...");
  Serial.printf("[SIM] APN: %s\n", gsmAPN.c_str());

  SerialGSM.end();
  delay(100);

  SerialGSM.begin(
    GSM_BAUD,
    SERIAL_8N1,
    GSM_RX_PIN,
    GSM_TX_PIN
  );

  delay(300);

  gsmReady = initGSM();

  if (gsmReady)
  {
    Serial.println("[SIM] GSM READY");
    return true;
  }

  Serial.println("[SIM] GSM initialization FAILED");
  return false;
}

void maintainSIM(unsigned long now)
{
  if (gsmReady)
    return;

  if (now - lastGSMRetry >= GSM_RETRY_INTERVAL_MS)
  {
    lastGSMRetry = now;
    if (startSIM())
      fetchDeviceConfig();
  }
}

// ============================================================
// LOCAL PHASE COMMAND
// ============================================================

bool executePhaseCommand(const String &phaseText)
{
  String phase = phaseText;
  phase.trim();
  phase.toUpperCase();

  char requested = 'N';

  if (phase == "OFF" || phase == "NONE" || phase == "N" || phase == "0")
    requested = 'N';
  else if (phase == "R")
    requested = 'R';
  else if (phase == "Y")
    requested = 'Y';
  else if (phase == "B")
    requested = 'B';
  else
    return false;

  bool ok = switchToPhase(requested);
  printRelayStatus();

  if (ok)
    savePhase(activePhase);

  return ok;
}

// ============================================================
// SERIAL COMMANDS
// ============================================================

void executeLocalCommand(const String &command)
{
  String cmd = command;
  cmd.trim();

  if (cmd.length() == 0)
    return;

  String upper = cmd;
  upper.toUpperCase();

  // ----------------------------------------------------------
  // HELP
  // ----------------------------------------------------------

  if (upper == "HELP")
  {
    Serial.println();
    Serial.println("========== SWAPPER SERIAL COMMANDS ==========");
    Serial.println("R               -> Switch to R phase");
    Serial.println("Y               -> Switch to Y phase");
    Serial.println("B               -> Switch to B phase");
    Serial.println("OFF             -> Turn all phases OFF");
    Serial.println("SWAP R          -> Switch to R");
    Serial.println("SWAP Y          -> Switch to Y");
    Serial.println("SWAP B          -> Switch to B");
    Serial.println("STATUS          -> Relay + feedback + GSM");
    Serial.println("DATA            -> Print PZEM data");
    Serial.println("GSM             -> Show GSM status");
    Serial.println("APN <apn>       -> Change SIM APN");
    Serial.println("DELAY <ms>      -> Change switching delay");
    Serial.println("RESTART         -> Restart ESP32");
    Serial.println("=============================================");
    return;
  }

  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  if (upper == "STATUS")
  {
    printRelayStatus();

    Serial.println();
    Serial.println("===== NETWORK STATUS =====");
    Serial.println("Network Mode : SIM ONLY");
    Serial.printf("GSM Status   : %s\n", gsmReady ? "READY" : "OFFLINE");
    Serial.printf("APN          : %s\n", gsmAPN.c_str());
    Serial.printf("GSM RX Pin   : %d\n", GSM_RX_PIN);
    Serial.printf("GSM TX Pin   : %d\n", GSM_TX_PIN);
    Serial.printf("GSM Baud     : %lu\n", (unsigned long)GSM_BAUD);
    Serial.printf("Switch Delay : %lu ms\n", switchDelayMs);
    Serial.println("==========================");

    Serial.printf(
      "Meter V/I/P/E: %.2f V / %.3f A / %.2f W / %.2f Wh\n",
      voltage,
      current,
      power,
      energy
    );

    return;
  }

  // ----------------------------------------------------------
  // GSM
  // ----------------------------------------------------------

  if (upper == "GSM")
  {
    Serial.printf(
      "[GSM] Status: %s | APN: %s\n",
      gsmReady ? "READY" : "OFFLINE",
      gsmAPN.c_str()
    );

    if (!gsmReady && cloudArmed)
      startSIM();

    return;
  }

  // ----------------------------------------------------------
  // DATA
  // ----------------------------------------------------------

  if (upper == "DATA")
  {
    Serial.printf(
      "V=%.2f V, I=%.3f A, P=%.2f W, E=%.2f Wh, F=%.2f Hz, PF=%.3f\n",
      voltage,
      current,
      power,
      energy,
      frequency,
      pf
    );

    return;
  }

  // ----------------------------------------------------------
  // PHASE COMMANDS
  // ----------------------------------------------------------

  if (
    upper == "R" ||
    upper == "Y" ||
    upper == "B" ||
    upper == "OFF" ||
    upper == "NONE"
  )
  {
    bool ok = executePhaseCommand(upper);

    Serial.println(
      ok ? "[SERIAL] PHASE COMMAND OK"
         : "[SERIAL] PHASE COMMAND FAILED"
    );

    return;
  }

  // ----------------------------------------------------------
  // SWAP COMMAND
  // ----------------------------------------------------------

  if (upper.startsWith("SWAP "))
  {
    String phase = cmd.substring(5);
    phase.trim();

    bool ok = executePhaseCommand(phase);

    Serial.println(
      ok ? "[SERIAL] SWAP OK"
         : "[SERIAL] SWAP FAILED"
    );

    return;
  }

  // ----------------------------------------------------------
  // APN
  // ----------------------------------------------------------

  if (upper.startsWith("APN "))
  {
    gsmAPN = cmd.substring(4);
    gsmAPN.trim();

    if (gsmAPN.length() == 0)
    {
      Serial.println("[SIM] APN cannot be empty");
      return;
    }

    // The APN is embedded unescaped into an AT+CGDCONT="...","...""
    // command string later — reject characters that could break out of
    // that quoted field and corrupt/inject AT commands.
    for (size_t i = 0; i < gsmAPN.length(); i++)
    {
      char c = gsmAPN.charAt(i);
      if (c == '"' || c == '\\' || c == '\r' || c == '\n' || (unsigned char)c < 0x20)
      {
        Serial.println("[SIM] APN contains an invalid character");
        return;
      }
    }

    saveAPN();

    Serial.printf(
      "[SIM] APN saved: %s\n",
      gsmAPN.c_str()
    );

    gsmReady = false;
    startSIM();

    return;
  }

  // ----------------------------------------------------------
  // SWITCH DELAY
  // ----------------------------------------------------------

  if (upper.startsWith("DELAY "))
  {
    unsigned long d =
      strtoul(cmd.substring(6).c_str(), nullptr, 10);

    if (d < 500 || d > 30000)
    {
      Serial.println(
        "[DELAY] Valid range: 500 - 30000 ms"
      );

      return;
    }

    switchDelayMs = d;
    saveDelay();

    Serial.printf(
      "[DELAY] Set to %lu ms\n",
      switchDelayMs
    );

    return;
  }

  // ----------------------------------------------------------
  // RESTART
  // ----------------------------------------------------------

  if (upper == "RESTART")
  {
    Serial.println("[SERIAL] Restarting...");
    delay(300);
    ESP.restart();
    return;
  }

  Serial.println(
    "[SERIAL] Unknown command. Type HELP."
  );
}

void handleSerial()
{
  while (Serial.available())
  {
    char c = Serial.read();

    if (c == '\r')
      continue;

    if (c == '\n')
    {
      executeLocalCommand(serialLine);
      serialLine = "";
    }
    else
    {
      if (serialLine.length() < 160)
        serialLine += c;
    }
  }
}

// ============================================================
// BOOT CONFIG FETCH
// ============================================================
// Server-side source of truth for the switching delay and the phase
// the device should be on right after boot / GSM recovery.

void fetchDeviceConfig()
{
  if (!gsmReady)
    return;

  String endpoint =
    String("/api/device/phase?device_id=") + deviceID +
    "&api_key=" DEVICE_API_KEY;

  String response;
  if (!httpGet(endpoint, &response))
  {
    Serial.println("[CONFIG] Fetch failed");
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, response))
  {
    Serial.println("[CONFIG] JSON parse failed");
    return;
  }

  uint32_t delayVal = doc["switch_delay"] | 0;
  if (delayVal >= 500 && delayVal <= 30000)
  {
    switchDelayMs = delayVal;
    Serial.printf("[CONFIG] Switch delay: %u ms\n", (unsigned)switchDelayMs);
  }

  const char *phase = doc["phase"];
  if (phase && strlen(phase) == 1 &&
      (phase[0] == 'R' || phase[0] == 'Y' || phase[0] == 'B'))
  {
    Serial.print("[CONFIG] Restoring phase ");
    Serial.println(phase);
    executePhaseCommand(phase);
  }
}

// ============================================================
// CLOUD COMMAND RESULT
// ============================================================

void sendCommandResult(
  const String &commandId,
  bool ok,
  const String &result
)
{
  if (!gsmReady || commandId.length() == 0)
    return;

  JsonDocument doc;

  doc["status"] = ok ? "executed" : "failed";
  doc["result"] = result;

  String payload;
  serializeJson(doc, payload);

  String path =
    "/api/commands/" +
    commandId +
    "/result?api_key=" +
    String(DEVICE_API_KEY);

  httpPost(path, payload, nullptr);
}

// ============================================================
// CLOUD COMMAND PROCESSOR
// ============================================================

void processCloudCommand(
  const String &commandId,
  const String &cmdType,
  JsonVariant params
)
{
  if (cmdType == "restart")
  {
    sendCommandResult(
      commandId,
      true,
      "Restarting"
    );

    delay(500);
    ESP.restart();

    return;
  }

  if (cmdType == "swap_phase")
  {
    String phase =
      params["phase"] | "NONE";

    phase.toUpperCase();

    bool ok =
      executePhaseCommand(phase);

    sendCommandResult(
      commandId,
      ok,
      ok
        ? "Phase switched successfully"
        : "Phase switch failed"
    );

    return;
  }

  if (cmdType == "set_switch_delay")
  {
    unsigned long d =
      params["delay_ms"] |
      (unsigned long)DEFAULT_SWITCH_DELAY_MS;

    if (d < 500 || d > 30000)
    {
      sendCommandResult(
        commandId,
        false,
        "delay_ms must be 500..30000"
      );

      return;
    }

    switchDelayMs = d;
    saveDelay();

    sendCommandResult(
      commandId,
      true,
      "Switch delay updated"
    );

    return;
  }

  if (cmdType == "clear_fault")
  {
    allRelaysOff();

    bool ok = safetyCheck();

    sendCommandResult(
      commandId,
      ok,
      ok
        ? "Fault cleared"
        : "Relay fault remains"
    );

    return;
  }

  if (cmdType == "reset_energy")
  {
    energyOffset = energy;

    sendCommandResult(
      commandId,
      true,
      "Energy counter reset"
    );

    return;
  }

  if (cmdType == "ota")
  {
    String fwUrl = params["firmware_url"] | "";
    String version = params["version"] | "";
    size_t fwSize = (size_t)((unsigned long)(params["size"] | 0UL));
    String fwMd5 = params["md5"] | "";

    if (fwUrl.length() == 0 || version.length() == 0 || fwSize == 0)
    {
      sendCommandResult(
        commandId,
        false,
        "OTA params incomplete - push a firmware version first"
      );

      return;
    }

    // Do not start flashing while a relay fault is active — a mid-swap or
    // interlock-violation condition is not the moment to also be reflashing
    // the MCU driving that hardware.
    if (!safetyCheck())
    {
      sendCommandResult(
        commandId,
        false,
        "Relay safety check failed before OTA"
      );

      reportFirmwareStatus("failed", "relay safety check failed before OTA");

      return;
    }

    Serial.printf(
      "[CMD] OTA: %s v%s (%u bytes)\n",
      fwUrl.c_str(),
      version.c_str(),
      (unsigned)fwSize
    );

    // Ack now — flash + reboot below ends this session anyway.
    sendCommandResult(commandId, true, "OTA update starting");

    bool ok = performOTA(fwUrl, fwSize, fwMd5);

    reportFirmwareStatus(ok ? "success" : "failed", version);

    if (ok)
    {
      Serial.println("[OTA] Restarting into new firmware...");
      delay(500);
      ESP.restart();
    }

    return;
  }

  sendCommandResult(
    commandId,
    false,
    "Unsupported command"
  );
}

// ============================================================
// CLOUD POLLING
// ============================================================

void pollCloudCommands()
{
  if (!gsmReady)
    return;

  String path =
    String(API_COMMANDS_PATH) +
    "/" +
    deviceID +
    "?device_id=" +
    deviceID +
    "&api_key=" +
    String(DEVICE_API_KEY);

  String body;

  if (!httpGet(path, &body))
    return;

  if (body.length() == 0)
    return;

  JsonDocument doc;

  DeserializationError err =
    deserializeJson(doc, body);

  if (err)
    return;

  if (doc["command"].isNull())
    return;

  String commandId =
    doc["command"]["id"] | "";

  String commandType =
    doc["command"]["type"] | "";

  if (commandType.length() == 0)
    return;

  Serial.printf(
    "[CLOUD] Command: %s (%s)\n",
    commandType.c_str(),
    commandId.c_str()
  );

  processCloudCommand(
    commandId,
    commandType,
    doc["command"]["params"]
  );
}

// ============================================================
// DATA PAYLOAD
// ============================================================

// The cloud API keys off "current_phase" (values R/Y/B/NONE): it routes the
// single-phase meter fields into the right phase slot and syncs
// Device/PhaseSwapper state from it. "active_phase" is kept for local
// debugging only.
String phaseKey()
{
  return (activePhase == 'N') ? String("NONE") : String(activePhase);
}

String buildDataPayload()
{
  JsonDocument doc;

  String phaseStr = phaseKey();

  doc["device_id"] = deviceID;
  doc["fw_version"] = FW_VERSION;
  doc["mode"] = "SIM";
  doc["active_phase"] = phaseStr;
  doc["current_phase"] = phaseStr;

  doc["voltage"] = voltage;
  doc["current"] = current;
  doc["power"] = power;
  doc["energy"] = max(0.0f, energy - energyOffset);
  doc["frequency"] = frequency;
  doc["pf"] = pf;
  doc["meter_valid"] = meterValid;
  doc["fault"] = !safetyCheck();

  doc["fb_r"] =
    digitalRead(FB_R) == FEEDBACK_ON;

  doc["fb_y"] =
    digitalRead(FB_Y) == FEEDBACK_ON;

  doc["fb_b"] =
    digitalRead(FB_B) == FEEDBACK_ON;

  String payload;

  serializeJson(doc, payload);

  return payload;
}

// ============================================================
// SEND DATA THROUGH SIM
// ============================================================

void sendData()
{
  if (!gsmReady)
    return;

  String payload =
    buildDataPayload();

  bool ok =
    httpPost(
      API_DATA_PATH,
      payload,
      nullptr
    );

  Serial.println(
    ok
      ? "[DATA] SIM SEND OK"
      : "[DATA] SIM SEND FAILED"
  );

  if (!ok)
  {
    gsmReady = false;
    lastGSMRetry = millis();
  }
}

// ============================================================
// HEARTBEAT THROUGH SIM
// ============================================================

void sendHeartbeat()
{
  if (!gsmReady)
    return;

  JsonDocument doc;

  doc["device_id"] = deviceID;
  doc["fw_version"] = FW_VERSION;
  doc["mode"] = "SIM";
  doc["phase"] = phaseKey();
  doc["active_phase"] = String(activePhase);
  doc["fault"] = !safetyCheck();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["uptime"] = millis() / 1000;

  doc["fb_r"] =
    digitalRead(FB_R) == FEEDBACK_ON;

  doc["fb_y"] =
    digitalRead(FB_Y) == FEEDBACK_ON;

  doc["fb_b"] =
    digitalRead(FB_B) == FEEDBACK_ON;

  String payload;

  serializeJson(doc, payload);

  String path =
    "/api/heartbeat?api_key=" +
    String(DEVICE_API_KEY);

  bool ok =
    httpPost(
      path,
      payload,
      nullptr
    );

  Serial.println(
    ok
      ? "[HEARTBEAT] SIM OK"
      : "[HEARTBEAT] SIM FAILED"
  );

  if (!ok)
  {
    gsmReady = false;
    lastGSMRetry = millis();
  }
}

// ============================================================
// OTA UPDATE
// ============================================================
// checkOTAUpdate() and gsmDownloadStream() (simcom_gsm.h) already existed
// in this codebase but nothing ever called them — a device could never
// actually receive a firmware update over the air. This wires them up to
// the ESP32 OTA flash partition via the core Update library.

bool performOTA(const String &url, size_t expectedSize, const String &expectedMd5)
{
  if (expectedSize == 0)
  {
    Serial.println("[OTA] Refusing update with unknown/zero size");
    return false;
  }

  if (expectedMd5.length() > 0)
  {
    if (!isValidMd5Hex(expectedMd5))
    {
      Serial.printf("[OTA] Refusing update: malformed md5 from backend: \"%s\"\n", expectedMd5.c_str());
      return false;
    }
    Serial.printf("[OTA] Expecting MD5: %s\n", expectedMd5.c_str());
  }
  else
  {
    // Not a hard failure — some backend deployments may not populate this
    // yet — but flashing an unverified image onto a device driving live
    // phase relays is worth a loud warning, not a silent pass.
    Serial.println("[OTA] WARNING: no MD5 supplied by backend, flashing WITHOUT integrity verification");
  }

  if (!Update.begin(expectedSize))
  {
    Serial.printf("[OTA] Update.begin failed: %s\n", Update.errorString());
    return false;
  }

  if (expectedMd5.length() > 0 && !Update.setMD5(expectedMd5.c_str()))
  {
    Serial.println("[OTA] Update.setMD5 rejected the supplied hash, aborting");
    Update.abort();
    return false;
  }

  Serial.printf("[OTA] Downloading %u bytes...\n", (unsigned)expectedSize);

  bool writeFailed = false;

  bool streamOk = gsmDownloadStream(
    url,
    [&writeFailed](uint8_t *data, size_t len, size_t totalWritten, size_t totalSize) -> bool
    {
      size_t written = Update.write(data, len);
      if (written != len)
      {
        Serial.printf(
          "[OTA] Flash write failed at %u/%u bytes\n",
          (unsigned)totalWritten,
          (unsigned)totalSize
        );
        writeFailed = true;
        return false; // abort the download
      }

      // A multi-hundred-KB OTA download can take a while even at 921600
      // baud; keep local serial control and the relay safety check alive
      // during that time instead of only responding once it's done.
      handleSerial();
      safetyCheck();

      return true;
    }
  );

  if (!streamOk || writeFailed)
  {
    Update.abort();
    Serial.println("[OTA] Download/flash failed, update aborted");
    return false;
  }

  if (!Update.end(true))
  {
    Serial.printf("[OTA] Update.end failed: %s\n", Update.errorString());
    return false;
  }

  Serial.println("[OTA] Flash complete.");
  return true;
}

void checkAndPerformOTA()
{
  if (!gsmReady)
    return;

  String url, version, md5;
  size_t size = 0;

  if (!checkOTAUpdate(url, version, size, md5))
    return; // no update available, or the check itself failed

  if (version.length() == 0 || version == FW_VERSION)
  {
    Serial.println("[OTA] Reported version matches running version, skipping");
    return;
  }

  if (size == 0)
  {
    Serial.println("[OTA] No usable size in firmware-check response, skipping");
    reportFirmwareStatus("failed", "missing size in firmware check response");
    return;
  }

  Serial.printf(
    "[OTA] Update available: %s -> %s (%u bytes)\n",
    FW_VERSION,
    version.c_str(),
    (unsigned)size
  );

  reportFirmwareStatus("downloading", version);

  // Do not start flashing while a relay fault is active — a mid-swap or
  // interlock-violation condition is not the moment to also be reflashing
  // the MCU driving that hardware.
  if (!safetyCheck())
  {
    Serial.println("[OTA] Aborting: relay safety check failed");
    reportFirmwareStatus("failed", "relay safety check failed before OTA");
    return;
  }

  bool ok = performOTA(url, size, md5);

  reportFirmwareStatus(ok ? "success" : "failed", version);

  if (ok)
  {
    Serial.println("[OTA] Restarting into new firmware...");
    delay(500);
    ESP.restart();
  }
}

// ============================================================
// PROVISIONING CHECK
// ============================================================
// WARNING ONLY: a device still running the placeholder API key connects
// to the cloud like any other unit. All such devices share one credential,
// so replace DEVICE_API_KEY with a unique key per unit before field
// deployment.

void checkProvisioning()
{
  if (String(DEVICE_API_KEY) == "cms-device-key-default")
  {
    Serial.println();
    Serial.println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    Serial.println("[PROVISIONING] WARNING: DEVICE_API_KEY is the DEFAULT key.");
    Serial.println("[PROVISIONING] Cloud will connect, but this key is shared");
    Serial.println("[PROVISIONING] by every un-provisioned unit. Rebuild with");
    Serial.println("[PROVISIONING] -DDEVICE_API_KEY=\"<unique-key>\" before");
    Serial.println("[PROVISIONING] field deployment.");
    Serial.println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  }
}

// ============================================================
// SETUP
// ============================================================

void setup()
{
  Serial.begin(SERIAL_BAUD);
  delay(500);

  loadSettings();

  deviceID = getDeviceID();

  Serial.println();
  Serial.println("==============================================");
  Serial.println("       CHETRIKA RAYZ - PHASE SWAPPER");
  Serial.println("                SIM ONLY");
  Serial.println("==============================================");

  Serial.printf(
    "Device ID : %s\n",
    deviceID.c_str()
  );

  Serial.printf(
    "Firmware  : %s\n",
    FW_VERSION
  );

  Serial.println();
  Serial.println("PIN CONFIGURATION FROM firmware.h");

  Serial.printf(
    "Relay R   : GPIO %d\n",
    RELAY_R_PIN
  );

  Serial.printf(
    "Relay Y   : GPIO %d\n",
    RELAY_Y_PIN
  );

  Serial.printf(
    "Relay B   : GPIO %d\n",
    RELAY_B_PIN
  );

  Serial.printf(
    "FB R      : GPIO %d (LOW=ON)\n",
    FB_R
  );

  Serial.printf(
    "FB Y      : GPIO %d (LOW=ON)\n",
    FB_Y
  );

  Serial.printf(
    "FB B      : GPIO %d (LOW=ON)\n",
    FB_B
  );

  Serial.printf(
    "PZEM RX   : GPIO %d\n",
    PZEM_RX_PIN
  );

  Serial.printf(
    "PZEM TX   : GPIO %d\n",
    PZEM_TX_PIN
  );

  Serial.printf(
    "GSM RX    : GPIO %d\n",
    GSM_RX_PIN
  );

  Serial.printf(
    "GSM TX    : GPIO %d\n",
    GSM_TX_PIN
  );

  Serial.printf(
    "GSM Baud  : %lu\n",
    (unsigned long)GSM_BAUD
  );

  Serial.printf(
    "LED       : GPIO %d\n",
    LED_PIN
  );

  Serial.println("Network   : SIMCOM / A7677S ONLY");
  Serial.println("==============================================");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Hardware initialization.
  initRelays();
  allRelaysOff();

  initLocalPZEM();
  readMeter(pzemN, voltage, current, power, energy, frequency, pf);
  lastPZEMRead = millis();

  // Restore whatever phase was commanded before the last reboot. The
  // switch itself verifies physical feedback; a stuck contactor fails
  // safely and leaves everything OFF instead of restoring.
  char restoredPhase = loadPhase();
  if (restoredPhase != 'N')
  {
    Serial.print("[NVS] Restoring last phase ");
    Serial.println(restoredPhase);
    switchToPhase(restoredPhase);
  }

  checkProvisioning();

  // SIM ONLY — bring up the modem/cloud link (default-key devices get a
  // warning above but still connect).
  if (cloudArmed)
  {
    startSIM();

    if (gsmReady)
      fetchDeviceConfig();
  }

  Serial.println();
  Serial.println("SIM ONLY MODE READY.");
  Serial.println("Type HELP for serial commands.");
}

// ============================================================
// MAIN LOOP
// ============================================================

void loop()
{
  unsigned long now = millis();

  // Serial control is always available.
  handleSerial();

  // Maintain SIM connection.
  if (cloudArmed)
    maintainSIM(now);

  // Read PZEM. Throttled: each read is 6 sequential Modbus transactions
  // over a 9600 baud UART and previously ran unthrottled on every ~10ms
  // loop() pass, needlessly hammering the meter and dominating loop timing.
  if (now - lastPZEMRead >= PZEM_READ_INTERVAL_MS)
  {
    lastPZEMRead = now;
    readMeter(pzemN, voltage, current, power, energy, frequency, pf);
  }

  // Continuous safety check.
  safetyCheck();

  if (cloudArmed)
  {
    // Send telemetry.
    if (now - lastSend >= SEND_INTERVAL_MS)
    {
      lastSend = now;
      sendData();
    }

    // Poll backend commands.
    if (now - lastCommandPoll >= COMMAND_POLL_INTERVAL_MS)
    {
      lastCommandPoll = now;
      pollCloudCommands();
    }

    // Heartbeat.
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS)
    {
      lastHeartbeat = now;
      sendHeartbeat();
    }

    // Firmware update check.
    if (now - lastOTACheck >= OTA_CHECK_INTERVAL_MS)
    {
      lastOTACheck = now;
      checkAndPerformOTA();
    }
  }

  // LED indicator: solid when cloud link is up, blinking otherwise.
  digitalWrite(LED_PIN, gsmReady ? HIGH : ((now / 500) % 2));

  delay(10);
}
