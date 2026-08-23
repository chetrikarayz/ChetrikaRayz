#pragma once

#include <Arduino.h>

#define RELAY_R 25
#define RELAY_Y 26
#define RELAY_B 27

#define SWITCH_DELAY_MS 3000

extern char activePhase;

inline void initRelays()
{
  pinMode(RELAY_R, OUTPUT);
  pinMode(RELAY_Y, OUTPUT);
  pinMode(RELAY_B, OUTPUT);

  digitalWrite(RELAY_R, HIGH);
  digitalWrite(RELAY_Y, HIGH);
  digitalWrite(RELAY_B, HIGH);
}

inline void allRelaysOff()
{
  digitalWrite(RELAY_R, HIGH);
  digitalWrite(RELAY_Y, HIGH);
  digitalWrite(RELAY_B, HIGH);
}

inline int countRelaysOn()
{
  int count = 0;
  if (digitalRead(RELAY_R) == LOW) count++;
  if (digitalRead(RELAY_Y) == LOW) count++;
  if (digitalRead(RELAY_B) == LOW) count++;
  return count;
}

inline bool safetyCheck()
{
  int onCount = countRelaysOn();

  if (onCount > 1)
  {
    Serial.println("FAULT: Multiple contactors ON");
    allRelaysOff();
    activePhase = 'N';
    return false;
  }
  return true;
}

inline void switchToPhase(char phase)
{
  if (phase == activePhase)
  {
    Serial.println("Already on requested phase");
    return;
  }

  Serial.print("Switching to phase: ");
  Serial.println(phase);

  allRelaysOff();
  delay(SWITCH_DELAY_MS);

  safetyCheck();

  if (phase == 'R')
    digitalWrite(RELAY_R, LOW);
  else if (phase == 'Y')
    digitalWrite(RELAY_Y, LOW);
  else if (phase == 'B')
    digitalWrite(RELAY_B, LOW);
  else
    return;

  delay(100);

  if (countRelaysOn() != 1)
  {
    Serial.println("FAULT: Interlock violation");
    allRelaysOff();
    activePhase = 'N';
    return;
  }

  activePhase = phase;
  Serial.print("Switched to phase: ");
  Serial.println(activePhase);
}

inline void printRelayStatus()
{
  Serial.println();
  Serial.println("===== DPS STATUS =====");
  Serial.print("Active Phase: ");
  Serial.println(activePhase);
  Serial.print("Relay R: ");
  Serial.println(digitalRead(RELAY_R) == LOW ? "ON" : "OFF");
  Serial.print("Relay Y: ");
  Serial.println(digitalRead(RELAY_Y) == LOW ? "ON" : "OFF");
  Serial.print("Relay B: ");
  Serial.println(digitalRead(RELAY_B) == LOW ? "ON" : "OFF");
  Serial.println("======================");
}
