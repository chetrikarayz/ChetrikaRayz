#pragma once

#include <Arduino.h>
#include "firmware.h"

// ============================================================
// SWAPPER RELAY + FEEDBACK CONTROL
// All pins/timing come from firmware.h.
// ============================================================

extern unsigned long switchDelayMs;
extern char activePhase;

inline void initRelays()
{
    // Latch the OFF level into the output register BEFORE switching the
    // pin to OUTPUT mode. On most MCUs (including ESP32) digitalWrite()
    // can be called on a pin still in INPUT mode; it just preloads the
    // output register. Doing this first (rather than pinMode() first)
    // removes the brief window where the pin could otherwise settle to an
    // undriven/undefined level while the relay driver is already enabled.
    digitalWrite(RELAY_R_PIN, HIGH);
    digitalWrite(RELAY_Y_PIN, HIGH);
    digitalWrite(RELAY_B_PIN, HIGH);

    pinMode(RELAY_R_PIN, OUTPUT);
    pinMode(RELAY_Y_PIN, OUTPUT);
    pinMode(RELAY_B_PIN, OUTPUT);

    pinMode(FB_R, INPUT);
    pinMode(FB_Y, INPUT);
    pinMode(FB_B, INPUT);

    // Re-assert, since pinMode() on some cores can reset output state.
    digitalWrite(RELAY_R_PIN, HIGH);
    digitalWrite(RELAY_Y_PIN, HIGH);
    digitalWrite(RELAY_B_PIN, HIGH);

    activePhase = 'N';
}

inline void allRelaysOff()
{
    digitalWrite(RELAY_R_PIN, HIGH);
    digitalWrite(RELAY_Y_PIN, HIGH);
    digitalWrite(RELAY_B_PIN, HIGH);
    activePhase = 'N';
}

inline bool feedbackR_ON() { return digitalRead(FB_R) == FEEDBACK_ON; }
inline bool feedbackY_ON() { return digitalRead(FB_Y) == FEEDBACK_ON; }
inline bool feedbackB_ON() { return digitalRead(FB_B) == FEEDBACK_ON; }

inline bool verifyAllFeedbackOff()
{
    return digitalRead(FB_R) == FEEDBACK_OFF &&
           digitalRead(FB_Y) == FEEDBACK_OFF &&
           digitalRead(FB_B) == FEEDBACK_OFF;
}

inline bool verifyPhaseFeedback(char phase)
{
    bool r = feedbackR_ON();
    bool y = feedbackY_ON();
    bool b = feedbackB_ON();

    if (phase == 'R') return r && !y && !b;
    if (phase == 'Y') return !r && y && !b;
    if (phase == 'B') return !r && !y && b;
    if (phase == 'N') return !r && !y && !b;

    return false;
}

inline int countRelaysOn()
{
    int count = 0;
    if (digitalRead(RELAY_R_PIN) == LOW) count++;
    if (digitalRead(RELAY_Y_PIN) == LOW) count++;
    if (digitalRead(RELAY_B_PIN) == LOW) count++;
    return count;
}

inline bool safetyCheck()
{
    if (countRelaysOn() > 1)
    {
        Serial.println("[FAULT] Multiple relay outputs ON");
        allRelaysOff();
        return false;
    }

    return true;
}

inline bool switchToPhase(char phase)
{
    phase = toupper(phase);

    if (phase != 'R' && phase != 'Y' && phase != 'B' && phase != 'N')
    {
        Serial.println("[FAULT] Invalid phase");
        return false;
    }

    if (phase == activePhase)
        return verifyPhaseFeedback(phase);

    Serial.print("[SWAPPER] Switching to ");
    Serial.println(phase);

    // Break-before-make.
    allRelaysOff();
    delay(switchDelayMs);

    if (!verifyAllFeedbackOff())
    {
        Serial.println("[FAULT] Existing contactor did not release");
        allRelaysOff();
        return false;
    }

    if (phase == 'N')
    {
        Serial.println("[SWAPPER] All phases OFF");
        return true;
    }

    if (phase == 'R') digitalWrite(RELAY_R_PIN, LOW);
    if (phase == 'Y') digitalWrite(RELAY_Y_PIN, LOW);
    if (phase == 'B') digitalWrite(RELAY_B_PIN, LOW);

    delay(FEEDBACK_SETTLE_MS);

    if (countRelaysOn() != 1)
    {
        Serial.println("[FAULT] Relay interlock violation");
        allRelaysOff();
        return false;
    }

    unsigned long start = millis();
    while (millis() - start < FEEDBACK_TIMEOUT_MS)
    {
        if (verifyPhaseFeedback(phase))
        {
            activePhase = phase;
            Serial.print("[SWAPPER] Phase verified: ");
            Serial.println(activePhase);
            return true;
        }
        delay(20);
    }

    Serial.println("[FAULT] Feedback not confirmed");
    allRelaysOff();
    return false;
}

inline void printRelayStatus()
{
    Serial.println();
    Serial.println("========== SWAPPER STATUS ==========");

    Serial.print("Active Phase: ");
    Serial.println(activePhase);

    Serial.print("R Relay: ");
    Serial.println(digitalRead(RELAY_R_PIN) == LOW ? "ON" : "OFF");
    Serial.print("Y Relay: ");
    Serial.println(digitalRead(RELAY_Y_PIN) == LOW ? "ON" : "OFF");
    Serial.print("B Relay: ");
    Serial.println(digitalRead(RELAY_B_PIN) == LOW ? "ON" : "OFF");

    Serial.print("R Feedback: ");
    Serial.println(feedbackR_ON() ? "ON" : "OFF");
    Serial.print("Y Feedback: ");
    Serial.println(feedbackY_ON() ? "ON" : "OFF");
    Serial.print("B Feedback: ");
    Serial.println(feedbackB_ON() ? "ON" : "OFF");

    Serial.println("====================================");
}
