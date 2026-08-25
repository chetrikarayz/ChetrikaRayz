#pragma once

#include <PZEM004Tv30.h>
#include "firmware.h"
#include "data_types.h"  // CT_RATIO is defined once here

extern HardwareSerial SerialPZEM_N;
extern PZEM004Tv30 pzemN;

extern float voltage, current, power, energy, frequency, pf;
extern bool meterValid;

inline void initLocalPZEM()
{
  SerialPZEM_N.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);
}

inline void readMeter(PZEM004Tv30 &pzem,
                      float &V, float &I, float &P, float &E,
                      float &F, float &PF)
{
  float rawV = pzem.voltage();

  // A bad/NaN read from the PZEM (e.g. a single noisy UART frame) used to
  // zero out V/I/P/E/F/PF here. That made a single glitch look like a real
  // power-loss / zero-energy event in telemetry sent to the cloud, and threw
  // away a perfectly good previous reading. Instead, keep the last known
  // good values and just flag the sample as invalid; the caller can still
  // decide to alarm on repeated invalid reads if needed.
  if (isnan(rawV) || rawV <= 0)
  {
    meterValid = false;
    return;
  }

  float rawI = pzem.current();
  float rawP = pzem.power();
  float rawE = pzem.energy();
  float rawF = pzem.frequency();
  float rawPF = pzem.pf();

  V = rawV;
  I = isnan(rawI) ? 0 : rawI;
  P = isnan(rawP) ? 0 : rawP;
  E = isnan(rawE) ? 0 : rawE;
  F = isnan(rawF) ? 0 : rawF;
  PF = isnan(rawPF) ? 0 : rawPF;

  // Keep the original project's CT scaling for current/power/energy.
  I *= CT_RATIO;
  P *= CT_RATIO;
  E *= CT_RATIO;

  meterValid = true;
}
