import ColorInputInternal from './color-input-internal';
import color              from './color';
import { cssColorStringToRGB, rgbToHexString } from './parse-color';

const PRIVATE = new WeakMap();

const colorAccess = (mode, [ xMin, xMax ], [ yMin, yMax ], [ zMin, zMax ]) => {
  const [ x, y, z ] = mode.name;

  const members = [ [ x, xMin, xMax ], [ y, yMin, yMax ], [ z, zMin, zMax ] ];

  const accessObj = priv => Object.create(
    Object.prototype,
    members.reduce((acc, [ key, min, max ], index) => {
      const size = max - min;

      acc[key] = {
        get() {
          if (priv.hasValue) {
            const value = mode.fromRGB(...priv.selectionAsRGB())[index];
            return (value * max) - min;
          }
        },
        set(val) {
          val = Number(val);
          val = Number.isFinite(val) ? val : 0;
          val = Math.min(max, Math.max(min, val)) + min;

          const xyz = mode.fromRGB(...priv.selectionAsRGB());
          const buf = new Uint8ClampedArray(3);

          xyz[index] = val / size;
          mode.write(buf, 0, ...xyz);

          priv.$host.value = rgbToHexString(Array.from(buf));
        }
      };

      return acc;
    }, {})
  );

  return {
    get() {
      const priv = PRIVATE.get(this);

      if (!priv.colorAccess.has(mode)) {
        priv.colorAccess.set(mode, accessObj(priv));
      }

      return priv.colorAccess.get(mode);
    }
  };
};

class ColorInputElement extends HTMLElement {
  constructor() {
    super();

    PRIVATE.set(this, new ColorInputInternal(
      this.attachShadow({ mode: 'open' }),
      this
    ));
  }

  get clamp() {
    return !PRIVATE.get(this).clamp;
  }

  set clamp(value) {
    const noClamp = value === false;
    const priv = PRIVATE.get(this);

    if (priv.noClamp !== noClamp) {
      priv.noClamp   = noClamp;
      priv._renderXY = true;
      priv._renderZ  = true;
    }

    const clamp = String(!noClamp);

    if (clamp !== (this.getAttribute('clamp') || '').toLowerCase().trim()) {
      this.setAttribute('clamp', clamp);
    }
  }

  get mode() {
    return PRIVATE.get(this).mode.name;
  }

  set mode(modeStr) {
    const mode = color[String(modeStr).toLowerCase()] || color.hlc;
    const priv = PRIVATE.get(this);

    if (priv.mode === mode) return;

    const rgb = priv.selectionAsRGB();

    priv.mode = mode;

    priv.setSelectionFromRGB(rgb);

    if (this.mode !== (this.getAttribute('mode') || '').toLowerCase().trim()) {
      this.setAttribute('mode', mode.name);
    }
  }

  get value() {
    const priv = PRIVATE.get(this);

    if (priv.hasValue)
      return rgbToHexString([ ...priv.selectionAsRGB() ]);

    return '';
  }

  set value(str) {
    const rgb  = cssColorStringToRGB(String(str));
    const priv = PRIVATE.get(this);

    priv.dirty = true;

    if (rgb) {
      priv.setSelectionFromRGB(rgb);
      priv.hasValue = true;
    } else {
      priv.hasValue = false;
    }

    priv.signalChange();
  }

  get valueAsNumber() {
    const priv = PRIVATE.get(this);

    if (priv.hasValue) {
      return priv.selectionAsRGB().reduce((acc, n) => (acc << 8) + n, 0);
    }

    return NaN;
  }

  set valueAsNumber(val) {
    val = Number(val);

    if (!Number.isInteger(val)) {
      throw new TypeError(
        'Failed to set the \'valueAsNumber\' property on ColorInputElement: ' +
        'The value provided is not an integer.'
      );
    }

    if (val < 0 || val > 0xFFFFFF) {
      throw new RangeError(
        'Failed to set the \'valueAsNumber\' property on ColorInputElement: ' +
        'The value provided is out of range.'
      );
    }

    this.value = `#${ val.toString(16).padStart(6, 0) }`;
  }

  attributeChangedCallback(attrKey, previous, current) {
    current  = (current || '').trim().toLowerCase();
    previous = (previous || '').trim().toLowerCase();

    if (current === previous) return;

    current = current === 'true' || (current === 'false' ? false : current);

    switch (attrKey) {
      case 'clamp':
        this.clamp = current;
        return;
      case 'mode':
        this.mode = current;
        return;
      case 'name':
        this.name = current;
        return;
      case 'tabindex':
        PRIVATE.get(this).updateTabIndex();
        return;
      case 'value':
        PRIVATE.get(this).setDefaultValue(current);
    }
  }

  connectedCallback() {
    PRIVATE.get(this).connect();
  }

  disconnectedCallback() {
    PRIVATE.get(this).disconnect();
  }
}

Object.defineProperties(ColorInputElement, {
  observedAttributes: {
    value: Object.freeze([
      'clamp',
      'mode',
      'name',
      'tabindex',
      'value'
    ])
  }
});

Object.defineProperties(ColorInputElement.prototype, {
  hcl: colorAccess(color.hcl, [ 0, 360 ], [ 0, 134 ], [ 0, 100 ]),
  hsl: colorAccess(color.hsl, [ 0, 360 ], [ 0, 100 ], [ 0, 100 ]),
  hsv: colorAccess(color.hsv, [ 0, 360 ], [ 0, 100 ], [ 0, 100 ]),
  lab: colorAccess(color.lab, [ 0, 100 ], [ -110, 110 ], [ -110, 110 ]),
  rgb: colorAccess(color.rgb, [ 0x00, 0xFF ], [ 0x00, 0xFF ], [ 0x00, 0xFF ])
});

Object.freeze(ColorInputElement);
Object.freeze(ColorInputElement.prototype);

export default ColorInputElement;
