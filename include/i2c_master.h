#pragma once

#include <Wire.h>
#include "data_types.h"

#define SLAVE_I2C_ADDR 0x08

extern PZEMData slavePZEM1;
extern PZEMData slavePZEM2;
extern PZEMData slavePZEM3;

inline bool getSlavePZEM(uint8_t id, PZEMData &dest)
{
  Wire.beginTransmission(SLAVE_I2C_ADDR);
  Wire.write(id);

  if (Wire.endTransmission() != 0)
    return false;

  int received = Wire.requestFrom(SLAVE_I2C_ADDR, (int)sizeof(PZEMData));

  if (received != sizeof(PZEMData))
  {
    while (Wire.available())
      Wire.read();
    return false;
  }

  size_t bytesRead = Wire.readBytes(
    (uint8_t *)&dest,
    sizeof(PZEMData)
  );

  return (bytesRead == sizeof(PZEMData));
}
