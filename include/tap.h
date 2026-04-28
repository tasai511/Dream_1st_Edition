#pragma once

#include <Arduino.h>

enum class TapEvent : uint8_t {
  None,
  Single,
  Double,
};
