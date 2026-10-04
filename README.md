# Breadboard Simulator

Developed by **Dr. Arnab Purkayastha**, Western New England University, for First-Year Introduction to Engineering students.

A browser-based breadboard simulator for practising first-year circuit wiring. It is one HTML file with nothing to install.

**Open it:** https://apwne.github.io/WNE-FY-Breadboard-Simulator/

## What's in it

- **Breadboard:** full-size, 63 columns with split rails. Drag parts from the bin; pins snap into holes. Drag between two holes to draw a wire.
- **Parts:**
  - Raspberry Pi Pico 2 WH, with a pin panel that stands in for MicroPython code
  - Kitronik Motor Driver Board for Pico
  - LD1117-3.3 regulator
  - Resistors, LEDs, 10K thermistor
  - Slide switch, micro switch
  - Standard (SG-5010) and continuous-rotation servos
  - IR distance sensor (10–80 cm), DC gear motor
  - Bench power supply, digital multimeter
- **Simulation:** DC circuit simulation with live voltages and currents. LEDs glow with current and burn out without a resistor. Short circuits, overloaded GPIO pins and 5 V on a Pico pin are flagged.
- **Multimeter:** DC volts, DC current (in series), resistance, continuity (with beep), diode test and PWM frequency.
- **Live schematic:** draws itself from the breadboard wiring, with net labels and live voltages.
- **Show strips:** reveals the hidden metal strips under the holes, coloured by voltage.
- **Challenges:** automatically checked tasks in three groups:
  - *Build it:* wire a circuit yourself.
  - *Fix the fault:* repair a pre-built broken circuit.
  - *Measure it:* use the multimeter and type the reading. Values are randomised on each restart.
- **Examples:** 17 ready-made circuits.

Work and challenge progress are saved in each student's own browser.

## Notes

- The simulation is DC only. PWM appears as its average voltage on LEDs and motors, and as a pulse width on servos.
- The Kitronik board is a block diagram. Its pin map (motor 1 on GP2/GP3, motor 2 on GP6/GP7; GP0, GP1, GP27, GP28, 3V and GND on the header) comes from the product listing.

## Running locally

Open `index.html` in any modern browser.

## Credit

© 2026 Arnab Purkayastha, Western New England University. All rights reserved. Please contact the author before reusing or redistributing this work.
