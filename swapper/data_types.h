#pragma once

#include <math.h>

#define CT_RATIO 1.0f

struct PZEMData
{
  float voltage;
  float current;
  float power;
  float energy;
  float frequency;
  float pf;
};

inline float safeValue(float value)
{
  if (isnan(value))
    return 0.0;
  return value;
}
