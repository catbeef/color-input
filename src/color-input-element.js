import ColorInputInternal from './color-input-internal';
import color              from './color';
import colorAccess        from './color-access';

import { registerLanguage } from './color-language';
import { cssColorStringToRGB, rgbToHexString } from './parse-color';

export const PRIVATE = new WeakMap();

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

    priv.updateLabels();

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
      priv.signalChange();
    } else {
      priv.signalChange(true);
    }
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
      case 'aria-label':
        PRIVATE.get(this).updateLabels();
        return;
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
      'aria-label',
      'clamp',
      'mode',
      'name',
      'tabindex',
      'value'
    ])
  },
  registerLanguage: {
    value: registerLanguage
  }
});

Object.defineProperties(ColorInputElement.prototype, {
  hcl: colorAccess(color.hcl),
  hsl: colorAccess(color.hsl),
  hsv: colorAccess(color.hsv),
  lab: colorAccess(color.lab),
  rgb: colorAccess(color.rgb)
});

Object.freeze(ColorInputElement);
Object.freeze(ColorInputElement.prototype);

export default ColorInputElement;
