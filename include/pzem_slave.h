#pragma once

#include <PZEM004Tv30.h>
#include "data_types.h"

// Single UART bus — all PZEMs wired in parallel on GPIO16 (RX) / GPIO17 (TX)
// Each meter is assigned a unique Modbus address:
//   0x01 = R Phase, 0x02 = Y Phase, 0x03 = B Phase, 0x04 = Neutral

HardwareSerial PZEMSerial(2);

PZEM004Tv30 pzem1(PZEMSerial, 16, 17, 0x01);
PZEM004Tv30 pzem2(PZEMSerial, 16, 17, 0x02);
PZEM004Tv30 pzem3(PZEMSerial, 16, 17, 0x03);
PZEM004Tv30 pzem4(PZEMSerial, 16, 17, 0x04);

PZEMData pzemCache[4];

uint8_t currentMeter = 0;
unsigned long slaveLastReadTime = 0;
const unsigned long SLAVE_READ_INTERVAL = 100;

PZEM004Tv30* const meters[4] = { &pzem1, &pzem2, &pzem3, &pzem4 };

void readMeter(PZEM004Tv30 &meter, PZEMData &data)
{
  data.voltage = safeValue(meter.voltage());

  if (data.voltage <= 0)
  {
    data.voltage = data.current = data.power = data.energy = data.frequency = data.pf = 0;
    return;
  }

  data.current   = safeValue(meter.current()) * CT_RATIO;
  data.power     = safeValue(meter.power()) * CT_RATIO;
  data.energy    = safeValue(meter.energy()) * CT_RATIO;
  data.frequency = safeValue(meter.frequency());
  data.pf        = safeValue(meter.pf());
}

void initSlavePZEMs()
{
  PZEMSerial.begin(9600, SERIAL_8N1, 16, 17);

  for (uint8_t i = 0; i < 4; i++)
    readMeter(*meters[i], pzemCache[i]);
}

void loopSlaveRead()
{
  if (millis() - slaveLastReadTime >= SLAVE_READ_INTERVAL)
  {
    slaveLastReadTime = millis();

    readMeter(*meters[currentMeter], pzemCache[currentMeter]);

    currentMeter++;
    if (currentMeter >= 4)
      currentMeter = 0;
  }
}
