#pragma once

#include <Arduino.h>

extern String deviceID;

inline String getDeviceID()
{
  uint64_t mac = ESP.getEfuseMac();
  uint8_t* b = (uint8_t*)&mac;
  char id[13];
  snprintf(id, sizeof(id), "%02X%02X%02X%02X%02X%02X",
    b[5], b[4], b[3], b[2], b[1], b[0]);
  return String(id);
}
