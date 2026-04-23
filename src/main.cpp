#include <Arduino.h>

void setup() {
  pinMode(PIN_PA6, OUTPUT);
}

void loop() {
  digitalWrite(PIN_PA6, HIGH);
  delay(200);
  digitalWrite(PIN_PA6, LOW);
  delay(200);
}