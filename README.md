# Breadboard Simulator

Developed by **Dr. Arnab Purkayastha**, Western New England University, for First-Year Introduction to Engineering students.

A browser-based breadboard simulator for practising first-year circuit wiring and programming the Raspberry Pi Pico in MicroPython. Nothing to install.

**Open it:** https://apwne.github.io/WNE-FY-Breadboard-Simulator/

## What's in it

- **Breadboard:** full-size, 63 columns with split rails. Drag parts from the bin; pins snap into holes. Drag between two holes to draw a wire.
- **Parts:**
  - Raspberry Pi Pico 2 WH
  - Kitronik Motor Driver Board for Pico
  - LD1117-3.3 regulator
  - Resistors, LEDs, 10K thermistor
  - Slide switch, micro switch
  - Standard (SG-5010) and continuous-rotation servos
  - IR distance sensor (10–80 cm), DC gear motor
  - Bench power supply, AA battery pack (6 V), digital multimeter
- **Simulation:** DC circuit simulation with live voltages and currents. LEDs glow with current and burn out without a resistor. Short circuits, overloaded GPIO pins and 5 V on a Pico pin are flagged.
- **MicroPython:** write and run real MicroPython on the simulated Pico. See below.
- **Multimeter:** DC volts, DC current (in series), resistance, continuity (with beep), diode test and PWM frequency.
- **Live schematic:** draws itself from the breadboard wiring, with net labels and live voltages.
- **Show strips:** reveals the hidden metal strips under the holes, coloured by voltage.
- **Challenges:** automatically checked tasks in three groups:
  - *Build it:* wire a circuit yourself.
  - *Fix the fault:* repair a pre-built broken circuit.
  - *Measure it:* use the multimeter and type the reading. Values are randomised on each restart.
- **Examples:** 20 ready-made circuits, including the class servo wiring (servo on GP15, 6 V AA pack, shared ground).

Work, code and challenge progress are saved in each student's own browser.

## Programming the Pico in MicroPython

Press **Code** in the toolbar to open the editor.

- It runs the official MicroPython 1.29 WebAssembly build, so the Python is real MicroPython.
- **`machine` is simulated and wired into the breadboard:**
  - `Pin`: outputs, inputs with pull-up/pull-down, and `irq`.
  - `PWM`: `freq`, `duty_u16` and `duty_ns`. It drives servos, the Kitronik motor driver and LED brightness.
  - `ADC`: reads GP26–GP28 (thermistor, IR sensor) plus the internal temperature channel.
  - `Timer`.
  - `time`: `sleep`, `sleep_ms`, `ticks_ms`, `ticks_diff` and friends.
- **WNE103 class library built in:** `import WNE103` works exactly as in class, with no upload needed:
  - `KitronikPicoMotor`: `motorOn` and `motorOff`.
  - `Servo`: `STServo` and `CONServo`.

  The editor shows it as a read-only tab. Its Wi-Fi functions report that they are not simulated.
- **Libraries:** add or upload your own `.py` files and `import` them.
- **Run, Stop and a time limit** (10 s to 5 min). Stop, the time limit or an error resets every pin to an input, so motors stop.
- **Program target:** programs run on the Pico on the breadboard or on the Pico docked in the Kitronik driver.
- **Starter programs:** WNE103 continuous servo, WNE103 standard servo, WNE103 robot drive (square pattern), WNE103 motor forward and reverse, LED blink, traffic light, Timer blink, servo sweep, continuous servo, motor forward and reverse, motor speed ramp, two motors with a library, a limit switch that stops a motor, switch input, thermistor temperature and IR distance.
- **Not simulated:** Wi-Fi, Bluetooth, I2C, SPI and UART. None of the lab's parts use them.

**Live inputs.** A running program reads switch presses and sensor sliders as they change. That needs the browser's cross-origin isolation, which `coi-sw.js` turns on for GitHub Pages. On hosts without it, programs still run, but they see input values from the moment they started.

## Files

| File | Purpose |
|---|---|
| `index.html` | The simulator |
| `mpy-worker.js` | Runs MicroPython in a background thread and provides the simulated `machine` and `time` modules |
| `micropython/` | MicroPython 1.29 WebAssembly build (`@micropython/micropython-webassembly-pyscript`), MIT licence |
| `coi-sw.js` | Service worker that enables live inputs on GitHub Pages |

## Notes

- The simulation is DC only. PWM appears as its average voltage on LEDs and motors, and as a pulse width on servos.
- The Kitronik Motor Driver Board is a block diagram. GP0, GP1, GP26, GP27, 3V and GND are on screw terminals, as on the real board.
- **Motor pin wiring setting** (select the board):
  - *WNE robot* (default): motor 1 is GP12 forward / GP13 reverse, and motor 2 is GP9 / GP8. These are the pins `KitronikPicoMotor()` in WNE103 uses.
  - *Kitronik standard*: GP3/GP2 and GP6/GP7, the pins in Kitronik's own library.

## Running locally

Browsers only run the MicroPython engine when the page is served over HTTP, so opening `index.html` straight from disk won't work. From this folder, run:

```
python -m http.server 8000
```

then open http://localhost:8000. Live inputs need a server that sends the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers.

## Credit

© 2026 Arnab Purkayastha, Western New England University. All rights reserved. Please contact the author before reusing or redistributing this work.

MicroPython is © Damien P. George and contributors, used under the MIT licence (see `micropython/LICENSE`).
