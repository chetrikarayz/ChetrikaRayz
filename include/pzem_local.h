#pragma once

#include <PZEM004Tv30.h>
#include "data_types.h"

extern HardwareSerial SerialPZEM_N;
extern PZEM004Tv30 pzemN;
extern float vN, iN, pN, eN, fN, pfN;

inline void initLocalPZEM()
{
  SerialPZEM_N.begin(9600, SERIAL_8N1, 16, 17);
}

inline void readMeter(PZEM004Tv30 &pzem,
                      float &V,
                      float &I,
                      float &P,
                      float &E,
                      float &F,
                      float &PF)
{
  V = pzem.voltage();

  if (isnan(V) || V <= 0)
  {
    V = I = P = E = F = PF = 0;
    return;
  }

  I  = pzem.current() * CT_RATIO;
  P  = pzem.power() * CT_RATIO;
  E  = pzem.energy() * CT_RATIO;
  F  = pzem.frequency();
  PF = pzem.pf();

  if (isnan(I)) I = 0;
  if (isnan(P)) P = 0;
  if (isnan(E)) E = 0;
  if (isnan(F)) F = 0;
  if (isnan(PF)) PF = 0;
}
