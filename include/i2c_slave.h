#pragma once

#include <Wire.h>
#include "data_types.h"

#define SLAVE_ADDR 0x08

extern PZEMData pzemCache[4];

volatile uint8_t requestedID = 1;

void receiveEvent(int howMany)
{
  if (howMany >= 1)
    requestedID = Wire.read();
}

void requestEvent()
{
  if (requestedID >= 1 && requestedID <= 4)
  {
    Wire.write(
      (uint8_t *)&pzemCache[requestedID - 1],
      sizeof(PZEMData)
    );
  }
}
