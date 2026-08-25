#include <ArduinoJson.h>
#include <PZEM004Tv30.h>

#define FW_VERSION     "2.0.0"

#include "../include/simcom_gsm.h"
#include "../include/ota.h"

#include <Preferences.h>
Preferences prefs;

void savePhase(const String& phase)
{
    prefs.begin("swapper", false);
    prefs.putString("lastPhase", phase);
    prefs.end();
}

String loadPhase()
{
    prefs.begin("swapper", true);
    String phase = prefs.getString("lastPhase", "NONE");
    prefs.end();
    return phase;
}

// ======================================================
// GLOBAL VARIABLE DEFINITIONS
// ======================================================

String deviceID;

HardwareSerial SerialGSM(1);
bool gsmReady = false;
unsigned long lastGSMRetry = 0;

// OTA state
bool otaInProgress = false;
String otaStatus;

// ======================================================
// HARDWARE PINS
// ======================================================

#define RELAY_R 16
#define RELAY_Y 17
#define RELAY_B 18

#define FB_R 36
#define FB_Y 39
#define FB_B 34

#define PZEM_RX 33
#define PZEM_TX 32

#define LED_PIN 2

// ======================================================
// RELAY MODE
// ======================================================

bool RELAY_ACTIVE_LOW = true;

uint8_t relayON()
{
    return RELAY_ACTIVE_LOW ? LOW : HIGH;
}

uint8_t relayOFF()
{
    return RELAY_ACTIVE_LOW ? HIGH : LOW;
}

// ======================================================
// FEEDBACK TYPE CONFIGURATION
// ======================================================

bool FEEDBACK_ACTIVE_HIGH = false;

bool feedbackON(uint8_t pin)
{
    return FEEDBACK_ACTIVE_HIGH ?
           digitalRead(pin) :
           !digitalRead(pin);
}

// ======================================================
// TIMERS
// ======================================================

constexpr uint32_t PZEM_INTERVAL_MS      = 1000;
constexpr uint32_t TELEMETRY_INTERVAL_MS = 1000;
constexpr uint32_t COMMAND_INTERVAL_MS   = 3000;
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 60000;
constexpr uint32_t GSM_RETRY_INTERVAL_MS = 10000;

uint32_t switchDelayMs                    = 10000;
constexpr uint32_t CONTACTOR_SETTLE_MS   = 1000;

// ======================================================
// PZEM
// ======================================================

HardwareSerial PZEMSerial(2);
PZEM004Tv30 pzem(PZEMSerial, PZEM_RX, PZEM_TX);

struct PzemData
{
    float voltage = 0;
    float current = 0;
    float power = 0;
    float energy = 0;
    float frequency = 0;
    float pf = 0;
};

PzemData house;

float energyOffset = 0;

// ======================================================
// SYSTEM STATE
// ======================================================

String currentPhase = "NONE";

bool faultActive = false;
bool lastFaultState = false;

unsigned long lastPzemRead = 0;
unsigned long lastTelemetry = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastHeartbeat = 0;

// ======================================================
// FEEDBACK HELPERS
// ======================================================

uint8_t getFeedbackCount()
{
    return feedbackON(FB_R) +
           feedbackON(FB_Y) +
           feedbackON(FB_B);
}

void printFeedbackStatus()
{
    Serial.println("\n===== FEEDBACK =====");

    Serial.print("R : ");
    Serial.println(feedbackON(FB_R) ? "ON" : "OFF");

    Serial.print("Y : ");
    Serial.println(feedbackON(FB_Y) ? "ON" : "OFF");

    Serial.print("B : ");
    Serial.println(feedbackON(FB_B) ? "ON" : "OFF");

    Serial.println("====================");
}

// ======================================================
// RELAY CONTROL
// ======================================================

void allOff()
{
    digitalWrite(RELAY_R, relayOFF());
    digitalWrite(RELAY_Y, relayOFF());
    digitalWrite(RELAY_B, relayOFF());

    currentPhase = "NONE";
    savePhase(currentPhase);
}

void setRelay(String phase)
{
    allOff();

    if (phase == "R")
        digitalWrite(RELAY_R, relayON());
    else if (phase == "Y")
        digitalWrite(RELAY_Y, relayON());
    else if (phase == "B")
        digitalWrite(RELAY_B, relayON());
}

// ======================================================
// SAFETY SYSTEM
// ======================================================

void raiseFault(String reason)
{
    if (faultActive) return;
    faultActive = true;

    Serial.println();
    Serial.println("================================");
    Serial.println("FAULT DETECTED");
    Serial.println(reason);
    Serial.println("================================");

    allOff();
}

void clearFault()
{
    faultActive = false;
    safetyCheck();

    if (!faultActive)
        Serial.println("FAULT CLEARED");
    else
        Serial.println("FAULT STILL PRESENT");

    sendTelemetry();
}

void safetyCheck()
{
    if (currentPhase == "NONE")
    {
        if (getFeedbackCount() > 0)
            raiseFault("CONTACTOR STUCK ON - ALL SHOULD BE OFF");
    }
    else if (currentPhase == "R")
    {
        if (!feedbackON(FB_R))
            raiseFault("R PHASE FEEDBACK MISSING");
        if (feedbackON(FB_Y))
            raiseFault("Y FEEDBACK SHOULD BE OFF");
        if (feedbackON(FB_B))
            raiseFault("B FEEDBACK SHOULD BE OFF");
    }
    else if (currentPhase == "Y")
    {
        if (feedbackON(FB_R))
            raiseFault("R FEEDBACK SHOULD BE OFF");
        if (!feedbackON(FB_Y))
            raiseFault("Y PHASE FEEDBACK MISSING");
        if (feedbackON(FB_B))
            raiseFault("B FEEDBACK SHOULD BE OFF");
    }
    else if (currentPhase == "B")
    {
        if (feedbackON(FB_R))
            raiseFault("R FEEDBACK SHOULD BE OFF");
        if (feedbackON(FB_Y))
            raiseFault("Y FEEDBACK SHOULD BE OFF");
        if (!feedbackON(FB_B))
            raiseFault("B PHASE FEEDBACK MISSING");
    }
}

// ======================================================
// PHASE SWITCHING
// ======================================================

bool switchPhase(String phase)
{
    if (faultActive)
    {
        Serial.println("FAULT LOCKOUT ACTIVE");
        return false;
    }

    if (phase == currentPhase)
    {
        Serial.println("Already on requested phase");
        return true;
    }

    Serial.println("\nOpening all contactors");
    allOff();
    delay(switchDelayMs);

    if (getFeedbackCount() > 0)
    {
        raiseFault("CONTACTOR STUCK AFTER OFF COMMAND");
        return false;
    }

    setRelay(phase);
    delay(CONTACTOR_SETTLE_MS);

    if (getFeedbackCount() != 1)
    {
        raiseFault("INTERLOCK FAILURE");
        return false;
    }

    if (phase == "R" && !feedbackON(FB_R))
    {
        raiseFault("R FEEDBACK MISSING");
        return false;
    }
    if (phase == "Y" && !feedbackON(FB_Y))
    {
        raiseFault("Y FEEDBACK MISSING");
        return false;
    }
    if (phase == "B" && !feedbackON(FB_B))
    {
        raiseFault("B FEEDBACK MISSING");
        return false;
    }

    currentPhase = phase;
    savePhase(currentPhase);

    Serial.print("PHASE CHANGED TO : ");
    Serial.println(currentPhase);
    printFeedbackStatus();

    sendTelemetry();

    return true;
}

// ======================================================
// TELEMETRY
// ======================================================

void sendTelemetry()
{
    if (!gsmReady) return;

    JsonDocument doc;

    doc["device_id"] = deviceID;
    doc["fw_version"] = FW_VERSION;
    doc["current_phase"] = currentPhase;
    doc["fault"] = faultActive;
    doc["voltage"] = house.voltage;
    doc["current"] = house.current;
    doc["power"] = house.power;
    doc["energy"] = max(0.0f, house.energy - energyOffset);
    doc["frequency"] = house.frequency;
    doc["pf"] = house.pf;
    doc["fb_r"] = feedbackON(FB_R);
    doc["fb_y"] = feedbackON(FB_Y);
    doc["fb_b"] = feedbackON(FB_B);

    String payload;
    serializeJson(doc, payload);

    if (httpPost(API_DATA_PATH, payload, nullptr))
    {
        Serial.println("Telemetry Sent");
    }
    else
    {
        Serial.println("Telemetry Failed");
        gsmReady = false;
        lastGSMRetry = millis();
    }
}

// ======================================================
// HEARTBEAT
// ======================================================

void sendHeartbeat()
{
    if (!gsmReady) return;

    JsonDocument doc;

    doc["device_id"] = deviceID;
    doc["fw_version"] = FW_VERSION;
    doc["phase"] = currentPhase;
    doc["gsm"] = "connected";
    doc["heap"] = ESP.getFreeHeap();
    doc["uptime"] = millis() / 1000;

    String payload;
    serializeJson(doc, payload);

    if (httpPost("/api/heartbeat?api_key=" DEVICE_API_KEY, payload, nullptr))
    {
        Serial.println("Heartbeat Sent");
    }
    else
    {
        Serial.println("Heartbeat Failed");
        gsmReady = false;
        lastGSMRetry = millis();
    }
}

// ======================================================
// COMMAND POLLING
// ======================================================

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
        Serial.println("JSON Parse Failed");
        return;
    }

    if (doc["command"].isNull())
        return;

    const char* cmdType = doc["command"]["type"];

    if (!cmdType)
        return;

    Serial.print("Command Type: ");
    Serial.println(cmdType);

    if (strcmp(cmdType, "swap_phase") == 0)
    {
        const char* phase = doc["command"]["params"]["phase"];
        if (!phase) return;

        if (strcmp(phase, "R") == 0)      switchPhase("R");
        else if (strcmp(phase, "Y") == 0) switchPhase("Y");
        else if (strcmp(phase, "B") == 0) switchPhase("B");
        else if (strcmp(phase, "NONE") == 0)
        {
            allOff();
            delay(CONTACTOR_SETTLE_MS);
            if (getFeedbackCount() > 0)
                raiseFault("CONTACTOR STUCK AFTER NONE COMMAND");
            sendTelemetry();
        }
    }
    else if (strcmp(cmdType, "restart") == 0)
    {
        Serial.println("Server Restart Command");
        delay(1000);
        ESP.restart();
    }
    else if (strcmp(cmdType, "clear_fault") == 0)
    {
        Serial.println("Clear Fault Command");
        clearFault();
    }
    else if (strcmp(cmdType, "set_switch_delay") == 0)
    {
        uint32_t newDelay = (uint32_t)doc["command"]["params"]["delay_ms"];
        if (newDelay >= 500 && newDelay <= 30000)
        {
            switchDelayMs = newDelay;
            Serial.print("Switch delay updated to: ");
            Serial.print(switchDelayMs);
            Serial.println(" ms");
        }
        else
        {
            Serial.println("Invalid switch delay (must be 500-30000ms)");
        }
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
        Serial.println("[CMD] Resetting energy counter");
        energyOffset = house.energy;
    }
}

// ======================================================
// PZEM READING
// ======================================================

void readPZEM()
{
    house.voltage = pzem.voltage();

    if (isnan(house.voltage) || house.voltage < 50)
    {
        memset(&house, 0, sizeof(house));
        return;
    }

    house.current   = pzem.current();
    house.power     = pzem.power();
    house.energy    = pzem.energy();
    house.frequency = pzem.frequency();
    house.pf        = pzem.pf();

    if (isnan(house.current))   house.current = 0;
    if (isnan(house.power))     house.power = 0;
    if (isnan(house.energy))    house.energy = 0;
    if (isnan(house.frequency)) house.frequency = 0;
    if (isnan(house.pf))        house.pf = 0;
    Serial.print("PZEM read at ");
    Serial.println(millis());
}

// ======================================================
// STATUS
// ======================================================

void printStatus()
{
    Serial.println();
    Serial.println("========== DPS STATUS ==========");

    Serial.print("Device ID : ");
    Serial.println(deviceID);

    Serial.print("Phase     : ");
    Serial.println(currentPhase);

    Serial.print("Fault     : ");
    Serial.println(faultActive ? "YES" : "NO");

    Serial.print("GSM       : ");
    Serial.println(gsmReady ? "CONNECTED" : "DISCONNECTED");

    Serial.println();

    Serial.printf("Voltage   : %.1f V\n", house.voltage);
    Serial.printf("Current   : %.3f A\n", house.current);
    Serial.printf("Power     : %.1f W\n", house.power);
    Serial.printf("Energy    : %.3f kWh\n", house.energy);
    Serial.printf("Freq      : %.1f Hz\n", house.frequency);
    Serial.printf("PF        : %.2f\n", house.pf);

    Serial.println();

    printFeedbackStatus();
}

// ======================================================
// SERIAL COMMANDS
// ======================================================

void handleSerial()
{
    if (!Serial.available())
        return;

    char cmd = toupper(Serial.read());

    while (Serial.available())
        Serial.read();

    switch (cmd)
    {
    case 'R':
        switchPhase("R");
        break;
    case 'Y':
        switchPhase("Y");
        break;
    case 'B':
        switchPhase("B");
        break;
    case 'N':
        allOff();
        delay(CONTACTOR_SETTLE_MS);
        if (getFeedbackCount() > 0)
            raiseFault("CONTACTOR STUCK AFTER OFF COMMAND");
        Serial.println("ALL CONTACTORS OFF");
        sendTelemetry();
        break;
    case 'X':
        clearFault();
        break;
    case 'S':
        printStatus();
        break;
    case 'F':
        printFeedbackStatus();
        break;
    case 'H':
        Serial.println();
        Serial.println("===== COMMANDS =====");
        Serial.println("R = Switch R");
        Serial.println("Y = Switch Y");
        Serial.println("B = Switch B");
        Serial.println("N = All OFF");
        Serial.println("S = Full Status");
        Serial.println("F = Feedback");
        Serial.println("X = Reset Fault");
        Serial.println("====================");
        break;
    }
}

// ======================================================
// BOOT CONFIG FETCH
// ======================================================

void fetchDeviceConfig()
{
    if (!gsmReady) return;

    String endpoint = String("/api/device/phase?device_id=") + deviceID
        + "&api_key=" DEVICE_API_KEY;

    String response;
    if (!httpGet(endpoint, &response))
    {
        Serial.println("Config fetch failed");
        return;
    }

    JsonDocument doc;
    if (deserializeJson(doc, response))
    {
        Serial.println("Config JSON parse failed");
        return;
    }

    uint32_t delayVal = doc["switch_delay"];
    if (delayVal >= 500 && delayVal <= 30000)
    {
        switchDelayMs = delayVal;
        Serial.print("Boot config: switch delay = ");
        Serial.print(switchDelayMs);
        Serial.println(" ms");
    }

    const char* phase = doc["phase"];
    if (phase && strcmp(phase, "NONE") != 0)
    {
        Serial.print("Boot config: restoring phase ");
        Serial.println(phase);
        switchPhase(phase);
    }
}

// ======================================================
// SETUP
// ======================================================

void setup()
{
    Serial.begin(115200);

    deviceID = getDeviceID();

    Serial.println();
    Serial.println("================================");
    Serial.println("CHETRIKA RAYZ DPS");
    Serial.println("FW Version: " FW_VERSION);
    Serial.println("Device ID: " + deviceID);
    Serial.println("================================");

    pinMode(RELAY_R, OUTPUT);
    pinMode(RELAY_Y, OUTPUT);
    pinMode(RELAY_B, OUTPUT);
    pinMode(FB_R, INPUT);
    pinMode(FB_Y, INPUT);
    pinMode(FB_B, INPUT);
    pinMode(LED_PIN, OUTPUT);

    allOff();

    PZEMSerial.begin(9600, SERIAL_8N1, PZEM_RX, PZEM_TX);
    SerialGSM.setRxBufferSize(8192);
    SerialGSM.begin(921600, SERIAL_8N1, GSM_RX, GSM_TX);

    delay(CONTACTOR_SETTLE_MS);

    delay(1000);

    if (getFeedbackCount() > 0)
        raiseFault("BOOT FEEDBACK ACTIVE");

    if (!faultActive)
    {
        String lastPhase = loadPhase();
        if (lastPhase != "NONE")
        {
            Serial.print("NVS: restoring last phase ");
            Serial.println(lastPhase);
            switchPhase(lastPhase);
        }
    }

    gsmReady = initGSM();
    Serial.println(gsmReady ? "[DPS] GSM Ready!" : "[DPS] GSM Failed!");

    fetchDeviceConfig();

    Serial.println();
    Serial.println("SYSTEM READY");
    Serial.println("Type H for help");
}

// ======================================================
// LOOP
// ======================================================

void loop()
{
    unsigned long now = millis();

    handleSerial();

    safetyCheck();

    if (faultActive != lastFaultState)
    {
        lastFaultState = faultActive;
        sendTelemetry();
    }

    // PZEM

    if (now - lastPzemRead >= PZEM_INTERVAL_MS)
    {
        lastPzemRead = now;
        readPZEM();
    }

    // Telemetry

    if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS)
    {
        lastTelemetry = now;
        safetyCheck();
        sendTelemetry();
    }

    // Heartbeat

    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS)
    {
        lastHeartbeat = now;
        safetyCheck();
        sendHeartbeat();
    }

    // Commands

    if (now - lastCommandPoll >= COMMAND_INTERVAL_MS)
    {
        lastCommandPoll = now;
        safetyCheck();
        pollCommands();
    }

    // GSM retry (main_master pattern)

    if (!gsmReady && now - lastGSMRetry >= GSM_RETRY_INTERVAL_MS)
    {
        lastGSMRetry = now;
        Serial.println("[DPS] Retrying GSM init...");
        gsmReady = initGSM();
        if (gsmReady) {
            fetchDeviceConfig();
        }
    }

    // LED indicator

    digitalWrite(LED_PIN, gsmReady ? HIGH : (now / 500) % 2);

    delay(1);
}