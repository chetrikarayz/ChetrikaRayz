#pragma once

#include "data_types.h"

void printData(const char *name, PZEMData &d)
{
  Serial.println();
  Serial.println(name);

  Serial.print("Voltage : ");
  Serial.println(d.voltage);

  Serial.print("Current : ");
  Serial.println(d.current);

  Serial.print("Power   : ");
  Serial.println(d.power);

  Serial.print("Energy  : ");
  Serial.println(d.energy);

  Serial.print("Freq    : ");
  Serial.println(d.frequency);

  Serial.print("PF      : ");
  Serial.println(d.pf);
}
