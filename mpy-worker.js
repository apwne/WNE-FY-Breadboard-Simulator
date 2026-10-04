// Runs MicroPython (official WebAssembly build) in a background thread for the Breadboard Simulator.
// machine.Pin / PWM / ADC / Timer and time are replaced with versions that drive the simulated Pico.
import { loadMicroPython } from './micropython/micropython.mjs';

let inputs = new Float64Array(40).fill(NaN); // [0..29] GPIO volts (NaN = floating), [30..34] ADC counts
let sleeper = null;                           // Int32Array on shared memory, used to sleep without spinning
const pulls = {};                             // GPIO number -> 'pu' | 'pd' | 'in', as set by the program
let pending = {}, outBuf = [], lastFlush = 0, t0 = 0;

function flush(force) {
  const now = performance.now();
  if (!force && now - lastFlush < 16) return;
  lastFlush = now;
  if (Object.keys(pending).length) { postMessage({ t: 'pins', pins: pending }); pending = {}; }
  if (outBuf.length) postMessage({ t: 'out', lines: outBuf.splice(0).slice(-300) });
}

function wait(ms) {
  flush(true);
  const end = performance.now() + ms;
  for (;;) {
    const left = end - performance.now();
    if (left <= 0) break;
    if (sleeper) Atomics.wait(sleeper, 0, 0, left);
  }
}

const sim = {
  pin(name, mode, v) {
    if (name !== 'LED') pulls[+name.slice(2)] = mode;
    pending[name] = mode === 'out' ? { m: v ? 'out1' : 'out0' } : { m: mode };
    flush(false);
  },
  pwm(name, f, d) {
    pulls[+name.slice(2)] = 'out';
    pending[name] = { m: 'pwm', f: Math.round(f * 100) / 100, d: Math.round(d * 1000) / 1000 };
    flush(false);
  },
  read(g) {
    flush(false);
    const v = inputs[g];
    if (Number.isNaN(v)) return pulls[g] === 'pu' ? 1 : pulls[g] === 'pd' ? 0 : (Math.random() < 0.5 ? 1 : 0);
    return v > 1.65 ? 1 : 0;
  },
  adc(ch) {
    flush(false);
    const u = inputs[30 + ch];
    if (Number.isNaN(u)) return Math.floor(Math.random() * 65536);
    return Math.max(0, Math.min(65535, Math.round(u + Math.random() * 8 - 4)));
  },
  wait(ms) { wait(ms); },
  ticks_ms() { return Math.floor(performance.now() - t0); },
  ticks_us() { return Math.floor((performance.now() - t0) * 1000); },
  now_ms() { return Date.now(); },
  reset() { flush(true); postMessage({ t: 'reset' }); },
};

const SCHED_PY = `import _sim
_timers = []
_irqs = []

def _now():
    return int(_sim.ticks_ms())

def _service():
    now = _now()
    for t in list(_timers):
        if t._active and now >= t._next:
            if t._mode == 1:
                t._next += t._period
                if t._next <= now:
                    t._next = now + t._period
            else:
                t._active = False
                _timers.remove(t)
            if t._cb:
                t._cb(t)
    for p in list(_irqs):
        v = int(_sim.read(p._id))
        if v != p._last:
            p._last = v
            if (v and p._trig & 8) or ((not v) and p._trig & 4):
                p._handler(p)

def _sleep_ms(ms):
    end = _now() + int(ms)
    while True:
        _service()
        left = end - _now()
        if left <= 0:
            break
        step = left
        if _irqs:
            step = min(step, 2)
        for t in _timers:
            if t._active:
                step = min(step, max(1, t._next - _now()))
        _sim.wait(step)

def _idle():
    while _timers or _irqs:
        _sleep_ms(200)
`;

const TIME_PY = `import _sim
from _simsched import _sleep_ms

def sleep(s):
    _sleep_ms(s * 1000)

def sleep_ms(ms):
    _sleep_ms(ms)

def sleep_us(us):
    _sleep_ms(us / 1000)

def ticks_ms():
    return int(_sim.ticks_ms())

def ticks_us():
    return int(_sim.ticks_us())

def ticks_cpu():
    return int(_sim.ticks_us())

def ticks_add(t, delta):
    return t + delta

def ticks_diff(t1, t2):
    return t1 - t2

def time():
    return int(_sim.now_ms() // 1000)

def time_ns():
    return int(_sim.now_ms()) * 1000000
`;

const MACHINE_PY = `import _sim
from _simsched import _timers, _irqs, _sleep_ms

_HEADER = set(range(0, 23)) | {26, 27, 28}

class Pin:
    IN = 0
    OUT = 1
    OPEN_DRAIN = 2
    ALT = 3
    PULL_UP = 1
    PULL_DOWN = 2
    IRQ_FALLING = 4
    IRQ_RISING = 8

    def __init__(self, id, mode=-1, pull=-1, *, value=None):
        if isinstance(id, Pin):
            id = id._id
        if isinstance(id, str):
            u = id.upper()
            if u in ("LED", "WL_GPIO0"):
                id = "LED"
            elif u.startswith("GP") and u[2:].isdigit():
                id = int(u[2:])
            else:
                raise ValueError("unknown pin " + repr(id))
        if id != "LED":
            if id in (23, 24, 25, 29):
                raise ValueError("GP%d is used inside the Pico W and is not on the header" % id)
            if id not in _HEADER:
                raise ValueError("invalid pin %r: use GP0-GP22, GP26-GP28 or 'LED'" % (id,))
        self._id = id
        self._mode = Pin.IN
        self._pull = None
        self._v = 0
        self._handler = None
        self._trig = 0
        self._last = 0
        self.init(mode, pull, value=value)

    def _name(self):
        return "LED" if self._id == "LED" else "GP%d" % self._id

    def _drives(self):
        return self._id == "LED" or self._mode in (Pin.OUT, Pin.OPEN_DRAIN)

    def init(self, mode=-1, pull=-1, *, value=None):
        if mode != -1:
            self._mode = mode
        if pull != -1:
            self._pull = pull
        if value is not None:
            self._v = 1 if value else 0
        if self._drives():
            _sim.pin(self._name(), "out", self._v)
        else:
            _sim.pin(self._name(), "pu" if self._pull == Pin.PULL_UP else "pd" if self._pull == Pin.PULL_DOWN else "in", 0)

    def value(self, v=None):
        if v is None:
            if self._drives():
                return self._v
            return int(_sim.read(self._id))
        self._v = 1 if v else 0
        if self._drives():
            _sim.pin(self._name(), "out", self._v)

    def __call__(self, v=None):
        return self.value(v)

    def on(self):
        self.value(1)

    def off(self):
        self.value(0)

    high = on
    low = off

    def toggle(self):
        self.value(0 if self._v else 1)

    def irq(self, handler=None, trigger=12, hard=False):
        if self._id == "LED":
            raise ValueError("the LED pin has no IRQ")
        if self in _irqs:
            _irqs.remove(self)
        self._handler = handler
        self._trig = trigger
        if handler:
            self._last = int(_sim.read(self._id))
            _irqs.append(self)

    def __repr__(self):
        return "Pin(%s, mode=%s)" % (self._name(), "OUT" if self._drives() else "IN")


class PWM:
    def __init__(self, dest, *, freq=None, duty_u16=None, duty_ns=None, invert=False):
        if not isinstance(dest, Pin):
            dest = Pin(dest)
        if dest._id == "LED":
            raise ValueError("the Pico W LED cannot do PWM")
        self._pin = dest
        self._f = 1000
        self._d = 0
        self.init(freq=freq, duty_u16=duty_u16, duty_ns=duty_ns)

    def init(self, *, freq=None, duty_u16=None, duty_ns=None):
        if freq is not None:
            self._check(freq)
            self._f = freq
        if duty_u16 is not None:
            self._d = duty_u16
        if duty_ns is not None:
            self._d = duty_ns * self._f * 65535 / 1000000000
        self._push()

    def _check(self, f):
        if not 8 <= f <= 62500000:
            raise ValueError("freq must be between 8 Hz and 62.5 MHz")

    def _push(self):
        self._d = max(0, min(65535, int(self._d)))
        _sim.pwm(self._pin._name(), self._f, self._d / 65535 * 100)

    def freq(self, f=None):
        if f is None:
            return self._f
        self._check(f)
        self._f = f
        self._push()

    def duty_u16(self, d=None):
        if d is None:
            return self._d
        self._d = d
        self._push()

    def duty_ns(self, ns=None):
        if ns is None:
            return int(self._d * 1000000000 / (65535 * self._f))
        self._d = ns * self._f * 65535 / 1000000000
        self._push()

    def deinit(self):
        _sim.pin(self._pin._name(), "in", 0)

    def __repr__(self):
        return "PWM(%s, freq=%s, duty_u16=%d)" % (self._pin._name(), self._f, self._d)


class ADC:
    CORE_TEMP = 4

    def __init__(self, src):
        if isinstance(src, Pin):
            src = src._id
        if src in (26, 27, 28, 29):
            ch = src - 26
        elif src in (0, 1, 2, 3, 4):
            ch = src
        else:
            raise ValueError("ADC needs GP26, GP27, GP28 or channel 0-4")
        self._ch = ch

    def read_u16(self):
        return int(_sim.adc(self._ch))


class Timer:
    ONE_SHOT = 0
    PERIODIC = 1

    def __init__(self, id=-1, *, mode=1, period=-1, freq=-1, callback=None, tick_hz=1000):
        self._active = False
        if callback is not None:
            self.init(mode=mode, period=period, freq=freq, callback=callback)

    def init(self, *, mode=1, period=-1, freq=-1, callback=None, tick_hz=1000):
        if freq > 0:
            period = 1000 / freq
        if period <= 0:
            raise ValueError("give a period (ms) or freq (Hz)")
        self._mode = mode
        self._period = max(1, int(period))
        self._cb = callback
        self._next = int(_sim.ticks_ms()) + self._period
        self._active = True
        if self not in _timers:
            _timers.append(self)

    def deinit(self):
        self._active = False
        if self in _timers:
            _timers.remove(self)


class _NotSimulated:
    def __init__(self, *args, **kwargs):
        raise NotImplementedError(type(self).__name__ + " is not simulated: this lab has no I2C, SPI or UART devices")

class I2C(_NotSimulated):
    pass

class SoftI2C(_NotSimulated):
    pass

class SPI(_NotSimulated):
    pass

class SoftSPI(_NotSimulated):
    pass

class UART(_NotSimulated):
    pass

def freq(f=None):
    return 150000000 if f is None else None

def reset():
    _sim.reset()
    raise SystemExit

soft_reset = reset

def idle():
    _sleep_ms(1)

def lightsleep(ms=0):
    _sleep_ms(ms)

deepsleep = lightsleep

def unique_id():
    return b"\\xe6\\x61\\x38\\x48\\x2b\\x5c\\x1a\\x2f"

def disable_irq():
    return 0

def enable_irq(state=0):
    pass
`;

// Wi-Fi is not simulated. These stand-ins only let class libraries such as WNE103 import cleanly.
const NOT_SIMULATED = 'raise OSError("Wi-Fi and network sockets are not simulated in the Breadboard Simulator")';
const STUBS = {
  'network.py': `AP_IF = 1
STA_IF = 0

class WLAN:
    def __init__(self, interface=0):
        ${NOT_SIMULATED}
`,
  'socket.py': `SOL_SOCKET = 1
SO_REUSEADDR = 4

def socket(*args, **kwargs):
    ${NOT_SIMULATED}

def getaddrinfo(*args, **kwargs):
    ${NOT_SIMULATED}
`,
  'uwebsocket.py': `def websocket(*args, **kwargs):
    ${NOT_SIMULATED}
`,
  'uos.py': `from os import *
`,
};

const SETUP_PY = `import sys
sys.path.insert(0, '/sim')
sys.path.insert(0, '/lib')
sys.path.insert(0, '/')
import _simmachine, _simtime
sys.modules['machine'] = _simmachine
sys.modules['time'] = _simtime
sys.modules['utime'] = _simtime
`;

const RUN_PY = `import _simsched
_src = open('/main.py').read()
try:
    _code = compile(_src, 'main.py', 'exec')
except NameError:
    _code = _src
exec(_code, {'__name__': '__main__'})
_simsched._idle()
`;

onmessage = async (e) => {
  const m = e.data;
  if (!m || m.t !== 'run') return;
  if (m.sab) { inputs = new Float64Array(m.sab, 0, 40); sleeper = new Int32Array(m.sab, 320, 1); }
  else if (m.inputs) inputs = Float64Array.from(m.inputs);
  let mp;
  try {
    mp = await loadMicroPython({
      url: new URL('./micropython/micropython.wasm', import.meta.url).href,
      heapsize: 4 * 1024 * 1024,
      linebuffer: true,
      stdout: (s) => { outBuf.push({ k: 'o', s }); flush(false); },
      stderr: (s) => { outBuf.push({ k: 'e', s }); flush(false); },
    });
  } catch (err) {
    postMessage({ t: 'fatal', msg: String(err && err.message || err) });
    return;
  }
  mp.registerJsModule('_sim', sim);
  const FS = mp.FS;
  for (const d of ['/sim', '/lib']) { try { FS.mkdir(d); } catch (_) {} }
  FS.writeFile('/sim/_simsched.py', SCHED_PY);
  FS.writeFile('/sim/_simtime.py', TIME_PY);
  FS.writeFile('/sim/_simmachine.py', MACHINE_PY);
  for (const [name, src] of Object.entries(STUBS)) FS.writeFile('/sim/' + name, src);
  for (const [name, src] of Object.entries(m.libs || {})) FS.writeFile('/lib/' + name, src);
  for (const [name, src] of Object.entries(m.files || {})) FS.writeFile('/' + name, src);
  try { FS.chdir('/'); } catch (_) {}
  t0 = performance.now();
  postMessage({ t: 'started' });
  try {
    mp.runPython(SETUP_PY);
    mp.runPython(RUN_PY);
    flush(true);
    postMessage({ t: 'done' });
  } catch (err) {
    flush(true);
    const msg = String(err && err.message || err);
    if (/SystemExit/.test(msg)) postMessage({ t: 'done' });
    else postMessage({ t: 'error', msg });
  }
};
