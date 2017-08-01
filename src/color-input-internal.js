import color from './color';

import { cssColorStringToRGB, rgbToHexString } from './parse-color';

import template, {
  CONTAINER_ID, GUTTER_ID,
  XY_CANVAS_ID, XY_ID, XY_NUB_ID,
  Z_CANVAS_ID, Z_ID, Z_NUB_ID,
  DEFAULT_GUTTER_WIDTH, DEFAULT_Z_AXIS_WIDTH,
  INITIAL_NUB_MOVEMENT_DURATION
} from './color-input-template';

const ARROW_KEYS = new Set([
  'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'
]);

const DIRECTION_PROP    = 'direction';
const GUTTER_WIDTH_PROP = '--color-input-gutter-width';
const HIGH_RES_PROP     = '--color-input-high-res';
const X_DIRECTION_PROP  = '--color-input-x-axis-direction';
const Y_DIRECTION_PROP  = '--color-input-y-axis-direction';
const Z_DIRECTION_PROP  = '--color-input-z-axis-direction';
const Z_POSITION_PROP   = '--color-input-z-axis-position';
const Z_WIDTH_PROP      = '--color-input-z-axis-width';

const DEFAULT_AXIS_DIRECTION = 'ascending';
const DEFAULT_DIRECTION      = 'ltr';
const DEFAULT_RESOLUTION     = 'false';
const DEFAULT_Z_POSITION     = 'end';

const CSS_PROPERTIES = [
  [ DIRECTION_PROP,    DEFAULT_DIRECTION      ],
  [ GUTTER_WIDTH_PROP, DEFAULT_GUTTER_WIDTH   ],
  [ HIGH_RES_PROP,     DEFAULT_RESOLUTION     ],
  [ X_DIRECTION_PROP,  DEFAULT_AXIS_DIRECTION ],
  [ Y_DIRECTION_PROP,  DEFAULT_AXIS_DIRECTION ],
  [ Z_DIRECTION_PROP,  DEFAULT_AXIS_DIRECTION ],
  [ Z_POSITION_PROP,   DEFAULT_Z_POSITION     ],
  [ Z_WIDTH_PROP,      DEFAULT_Z_AXIS_WIDTH   ]
];

const LUMINANCE_OFFSET     = 4 / 7;
const LUMINANCE_THRESHOLD  = 2 / 3;
const SELECTION_GRACE_ZONE = 20;

const Z_AXIS_POSITIONS = new Set([
  'bottom', 'end', 'left', 'right', 'start', 'top'
]);

const getObservedProperties = decl => ([ key, defaultVal ]) => [
  key,
  decl.getPropertyValue(key).trim() || defaultVal
];

class ColorInputInternal {
  constructor(shadow, host) {
    // SHADOW DOM //////////////////////////////////////////////////////////////
    //
    // There are a variety of shadow dom elements which we will need to refer to
    // during rendering updates.

    const tree = document.importNode(template.content, true);

    this.$host      = host;
    this.$container = tree.getElementById(CONTAINER_ID);
    this.$gutter    = tree.getElementById(GUTTER_ID);
    this.$xy        = tree.getElementById(XY_ID);
    this.$xyCanvas  = tree.getElementById(XY_CANVAS_ID);
    this.$xyNub     = tree.getElementById(XY_NUB_ID);
    this.$z         = tree.getElementById(Z_ID);
    this.$zCanvas   = tree.getElementById(Z_CANVAS_ID);
    this.$zNub      = tree.getElementById(Z_NUB_ID);

    // GENERAL /////////////////////////////////////////////////////////////////
    //
    // Broad aspects of state that are hard to otherwise classify. The
    // colorAccess map is a private cache of the hcl, rgb etc objects that are
    // exposed as part of the public element interface. The mode is an object
    // which represents the current color space and supplies methods to convert
    // generic XYZ values into RGB and to convert RGB into generic XYZ within
    // this space. The _raf property is the unique ID of the currently queued
    // RAF, so that we can cancel it on disconnection; the _rafFn is the render
    // loop that sets that value. The _deregs array holds event listener dereg
    // functions that should be called on disconnection.

    this.colorAccess = new Map();
    this.mode        = color.hlc;
    this._deregs     = new Set();
    this._raf        = undefined;

    this._rafFn = () => {
      this.render();
      this._raf = requestAnimationFrame(this._rafFn);
    };

    // VALUE-RELATED STATE /////////////////////////////////////////////////////
    //
    // The exposed value (in the <input> sense) is normally derived from the
    // x, y and z axis values as interpreted by the current mode. However the
    // input itself may have no value (hasValue: false) at initialization or if
    // the value is programmatically set to null, undefined, etc. The dirty flag
    // determines what behavior applies w/ regard to the defaultValue (taken
    // from the value content attribute); we recreate the behavior of <input>,
    // which allows updating the effective value via the content attribute but
    // only up until user input or programmatic input occurs, unless later
    // reset.

    this.defaultValue = undefined;
    this.dirty        = false;
    this.hasValue     = false;

    // CSS-DERIVED STATE ///////////////////////////////////////////////////////
    //
    // On each RAF we check the values of certain custom CSS properties to
    // determine if there are any changes which we need to respond to. The css
    // property itself is a map that stores the last known values; if the next
    // check is identical (and it usually will be), then we can abort the CSS
    // update quickly. Most of the other properties hold normalized
    // representations of the same (we cannot rely on the user CSS to always
    // hold valid values). The exceptions are highResAuto, which holds the value
    // which corresponds to the 'auto' setting for --color-input-high-res and
    // horizontal, which is just to help us avoid repeatedly checking whether
    // zPosition implies a horizontal or vertical orientation for the locations
    // of the xy plane and z slider.

    this.css         = new Map();
    this.highRes     = false;
    this.highResAuto = window.devicePixelRatio > 1;
    this.horizontal  = true;
    this.xDescending = false;
    this.yDescending = false;
    this.zDescending = false;
    this.zPosition   = 'end';

    // CANVAS CONTEXTS & IMAGEDATA /////////////////////////////////////////////

    this.xyContext = this.$xyCanvas.getContext('2d', { alpha: false });
    this.xyImage   = this.xyContext.createImageData(1, 1);
    this.zContext  = this.$zCanvas.getContext('2d', { alpha: false });
    this.zImage    = this.zContext.createImageData(1, 1);

    this.zImage.data.fill(0xFF);
    this.xyImage.data.fill(0xFF);

    // SELECTION STATE /////////////////////////////////////////////////////////
    //
    // The current selection is modeled as generic x y and z properties that are
    // numbers from 0 to 1, without consideration of the actual color space or
    // meanings of the axes.

    this.xAxisValue = 0;
    this.yAxisValue = 0;
    this.zAxisValue = 0;

    // TRANSIENT STATE /////////////////////////////////////////////////////////
    //
    // The following properties are used between or during "render", which fires
    // on a RAF loop. The render function may not actually need to update
    // anything, and the determination of what to redraw or what styles to
    // update is based on these properties and css properties which are read in
    // each RAF. The transient x y and z properties describe the current
    // “uncommitted” value, that is, during active dragging, before a mouseup.

    this._dragging   = false;
    this._renderXY   = true;
    this._renderZ    = true;
    this._transientX = undefined;
    this._transientY = undefined;
    this._transientZ = undefined;

    // BOOTSTRAPPING ///////////////////////////////////////////////////////////

    shadow.append(tree);

    this.setLabels();
  }

  get effectiveX() {
    return this._transientX !== undefined ? this._transientX : this.xAxisValue;
  }

  get effectiveY() {
    return this._transientY !== undefined ? this._transientY : this.yAxisValue;
  }

  get effectiveZ() {
    return this._transientZ !== undefined ? this._transientZ : this.zAxisValue;
  }

  get xyHeight() {
    return this.highRes ? this.$xyCanvas.height / 2 : this.$xyCanvas.height;
  }

  get xyWidth() {
    return this.highRes ? this.$xyCanvas.width / 2 : this.$xyCanvas.width;
  }

  get zHeight() {
    return this.highRes ? this.$zCanvas.height / 2 : this.$zCanvas.height;
  }

  get zWidth() {
    return this.highRes ? this.$zCanvas.width / 2 : this.$zCanvas.width;
  }

  connect() {
    this._rafFn();
    this.listen();
  }

  disconnect() {
    cancelAnimationFrame(this._raf);
    this._deregs.forEach(fn => fn());
    this._deregs.clear();
  }

  effectiveSelectionAsRGB() {
    const { mode, effectiveX, effectiveY, effectiveZ } = this;
    const buffer = new Uint8ClampedArray(3);

    mode.write(buffer, 0, effectiveX, effectiveY, effectiveZ);

    return buffer;
  }

  listen() {
    let _terminateDrag, xyTimeout, zTimeout;

    const xyMouseDown = event => {
      clearTimeout(xyTimeout);

      this.setXYTentativelyFromEvent(event);
      this._dragging = true;
      this.$xyNub.classList.add('dragging', 'initial-movement');

      xyTimeout = setTimeout(
        () => this.$xyNub.classList.remove('initial-movement'),
        INITIAL_NUB_MOVEMENT_DURATION
      );

      const terminateDrag = () => {
        document.removeEventListener('blur', terminateDrag);
        document.removeEventListener('mousemove', mousemove);
        document.removeEventListener('mouseup', mouseup);

        this.$xyCanvas.removeEventListener('blur', terminateDrag);

        this.$xyNub.classList.remove('dragging');
        this._deregs.delete(terminateDrag);

        this._dragging   = false;
        this._renderZ    = true;
        this._transientX = undefined;
        this._transientY = undefined;

        _terminateDrag = undefined;
      };

      const mousemove = ({ clientX, clientY }) => {
        const { bottom, left, right, top } =
          this.$xyCanvas.getBoundingClientRect();

        const offsetX = Math.min(Math.max(left, clientX), right) - left;
        const offsetY = Math.min(Math.max(top, clientY), bottom) - top;

        this.setXYTentativelyFromEvent({ offsetX, offsetY });
      };

      const mouseup = ({ clientX, clientY }) => {
        const { bottom, left, right, top } =
          this.$xyCanvas.getBoundingClientRect();

        const isSelection =
          clientX + SELECTION_GRACE_ZONE >= left &&
          clientX - SELECTION_GRACE_ZONE <= right &&
          clientY + SELECTION_GRACE_ZONE >= top &&
          clientY - SELECTION_GRACE_ZONE <= bottom;

        if (isSelection) {
          this.xAxisValue = this._transientX;
          this.yAxisValue = this._transientY;
          this._renderZ   = true;
          this.signalChange();
        }

        terminateDrag();
      };

      document.addEventListener('blur', terminateDrag);
      document.addEventListener('mousemove', mousemove);
      document.addEventListener('mouseup', mouseup);

      this.$xyCanvas.addEventListener('blur', terminateDrag);

      _terminateDrag = terminateDrag;

      this._deregs.add(terminateDrag);
    };

    const xyNubMouseDown = event => {
      const { clientX, clientY } = event;

      const { bottom, left, right, top } =
        this.$xyCanvas.getBoundingClientRect();

      const offsetX = Math.min(Math.max(left, clientX), right) - left;
      const offsetY = Math.min(Math.max(top, clientY), bottom) - top;

      this.$xyCanvas.focus();

      event.preventDefault();

      xyMouseDown({ offsetX, offsetY });
    };

    const zMouseDown = event => {
      clearTimeout(zTimeout);

      this.setZTentativelyFromEvent(event);
      this._dragging = true;
      this.$zNub.classList.add('dragging', 'initial-movement');

      zTimeout = setTimeout(
        () => this.$zNub.classList.remove('initial-movement'),
        INITIAL_NUB_MOVEMENT_DURATION
      );

      const terminateDrag = () => {
        document.removeEventListener('blur', terminateDrag);
        document.removeEventListener('mousemove', mousemove);
        document.removeEventListener('mouseup', mouseup);

        this.$zCanvas.removeEventListener('blur', terminateDrag);

        this.$zNub.classList.remove('dragging');
        this._deregs.delete(terminateDrag);

        this._dragging   = false;
        this._renderXY   = true;
        this._transientZ = undefined;

        _terminateDrag = undefined;
      };

      const mousemove = ({ clientX, clientY }) => {
        const { bottom, left, right, top } =
          this.$zCanvas.getBoundingClientRect();

        const offsetX = Math.min(Math.max(left, clientX), right) - left;
        const offsetY = Math.min(Math.max(top, clientY), bottom) - top;

        this.setZTentativelyFromEvent({ offsetX, offsetY });
      };

      const mouseup = ({ clientX, clientY }) => {
        const { bottom, left, right, top } =
          this.$zCanvas.getBoundingClientRect();

        const isSelection =
          clientX + SELECTION_GRACE_ZONE >= left &&
          clientX - SELECTION_GRACE_ZONE <= right &&
          clientY + SELECTION_GRACE_ZONE >= top &&
          clientY - SELECTION_GRACE_ZONE <= bottom;

        if (isSelection) {
          this.zAxisValue = this._transientZ;
          this._renderXY  = true;
          this.signalChange();
        }

        terminateDrag();
      };

      document.addEventListener('blur', terminateDrag);
      document.addEventListener('mousemove', mousemove);
      document.addEventListener('mouseup', mouseup);

      this.$zCanvas.addEventListener('blur', terminateDrag);

      _terminateDrag = terminateDrag;

      this._deregs.add(terminateDrag);
    };

    const zNubMouseDown = event => {
      const { clientX, clientY } = event;

      const { bottom, left, right, top } =
        this.$zCanvas.getBoundingClientRect();

      const offsetX = Math.min(Math.max(left, clientX), right) - left;
      const offsetY = Math.min(Math.max(top, clientY), bottom) - top;

      this.$zCanvas.focus();

      event.preventDefault();

      zMouseDown({ offsetX, offsetY });
    };

    const containerKey = event => {
      if (event.defaultPrevented) return;

      if (this._dragging && event.key === 'Escape') {
        if (_terminateDrag) _terminateDrag();
        event.preventDefault();
      }
    };

    const xyKey = event => {
      if (!ARROW_KEYS.has(event.key) || this._dragging) return;

      const [ increaseXKey, decreaseXKey ] = this.xDescending
        ? [ 'ArrowLeft', 'ArrowRight' ]
        : [ 'ArrowRight', 'ArrowLeft' ];

      const [ increaseYKey, decreaseYKey ] = this.yDescending
        ? [ 'ArrowDown', 'ArrowUp' ]
        : [ 'ArrowUp', 'ArrowDown' ];

      const increment = event.shiftKey ? 0.1 : 0.01;

      switch (event.key) {
        case increaseXKey:
          this.xAxisValue = Math.min(1, this.xAxisValue + increment);
          this._renderZ = true;
          this.signalChange();
          break;
        case decreaseXKey:
          this.xAxisValue = Math.max(0, this.xAxisValue - increment);
          this._renderZ = true;
          this.signalChange();
          break;
        case increaseYKey:
          this.yAxisValue = Math.min(1, this.yAxisValue + increment);
          this._renderZ = true;
          this.signalChange();
          break;
        case decreaseYKey:
          this.yAxisValue = Math.max(0, this.yAxisValue - increment);
          this._renderZ = true;
          this.signalChange();
          break;
      }

      event.preventDefault();
    };

    const zKey = event => {
      if (!ARROW_KEYS.has(event.key) || this._dragging) return;

      const keys = this.horizontal
        ? [ 'ArrowUp', 'ArrowDown' ]
        : [ 'ArrowRight', 'ArrowLeft' ];

      if (this.zDescending) keys.reverse();

      const [ increaseKey, decreaseKey ] = keys;

      const increment = event.shiftKey ? 0.1 : 0.01;

      switch (event.key) {
        case increaseKey:
          this.zAxisValue = Math.min(1, this.zAxisValue + increment);
          this._renderXY = true;
          this.signalChange();
          break;
        case decreaseKey:
          this.zAxisValue = Math.max(0, this.zAxisValue - increment);
          this._renderXY = true;
          this.signalChange();
          break;
      }

      event.preventDefault();
    };

    this.$xyCanvas.addEventListener('mousedown', xyMouseDown);
    this.$xyCanvas.addEventListener('keydown', xyKey);
    this.$xyNub.addEventListener('mousedown', xyNubMouseDown);
    this.$zCanvas.addEventListener('mousedown', zMouseDown);
    this.$zCanvas.addEventListener('keydown', zKey);
    this.$zNub.addEventListener('mousedown', zNubMouseDown);
    this.$container.addEventListener('keydown', containerKey);

    this._deregs
      .add(() => this.$xyCanvas.removeEventListener('mousedown', xyMouseDown))
      .add(() => this.$xyCanvas.removeEventListener('keydown', xyKey))
      .add(() => this.$xyNub.removeEventListener('mousedown', xyNubMouseDown))
      .add(() => this.$zCanvas.removeEventListener('mousedown', zMouseDown))
      .add(() => this.$zCanvas.removeEventListener('keydown', zKey))
      .add(() => this.$zNub.removeEventListener('mousedown', zNubMouseDown))
      .add(() => this.$container.removeEventListener('keydown', containerKey));
  }

  render() {
    this.updateFromCSS();
    this.updateFromDimensions();

    if (this._renderZ || this._renderXY) {
      this.setXYZNubColors();
    }

    if (this._renderZ) {
      this._renderZ = false;
      this.setXYNubPosition();
      this.renderZ();
    }

    if (this._renderXY) {
      this._renderXY = false;
      this.setZNubPosition();
      this.renderXY();
    }
  }

  renderXY() {
    //console.time('renderXY');
    const { xDescending, yDescending, effectiveZ: z } = this;
    const { data, height, width } = this.xyImage;
    const { write } = this.mode;

    const lastHeight = height - 1;
    const lastWidth  = width - 1;

    let i = 0;

    for (let r = 0; r < height; r++) {
      const y = yDescending ? r / lastHeight || 0 : 1 - (r / lastHeight || 0);

      for (let c = 0; c < width; c++) {
        const x = c / lastWidth || 0;

        write(data, i, xDescending ? 1 - x : x, y, z);

        i += 4;
      }
    }

    this.xyContext.putImageData(this.xyImage, 0, 0);
    //console.timeEnd('renderXY');
  }

  renderZ() {
    //console.time('renderZ');
    const { effectiveX: x, effectiveY: y, mode: { write } } = this;
    const { data } = this.zImage;
    const { length } = data;

    const lastLength = length - 4;
    const offset     = this.horizontal !== this.zDescending;

    for (let i = 0; i < length; i += 4) {
      const z = i / lastLength || 0;
      write(data, i, x, y, offset ? 1 - z : z);
    }

    this.zContext.putImageData(this.zImage, 0, 0);
    //console.timeEnd('renderZ');
  }

  selectionAsRGB() {
    const { mode, xAxisValue, yAxisValue, zAxisValue } = this;
    const buffer = new Uint8ClampedArray(3);

    mode.write(buffer, 0, xAxisValue, yAxisValue, zAxisValue);

    return buffer;
  }

  setDefaultValue(value) {
    this.defaultValue = cssColorStringToRGB(value);

    if (!this.dirty) {
      this.setSelectionFromRGB(this.defaultValue || [ 0, 0, 0 ]);
      this.hasValue = Boolean(this.defaultValue);
    }
  }

  setDirectionsFromCSS() {
    const xDescending = this.css.get(X_DIRECTION_PROP) === 'descending';
    const yDescending = this.css.get(Y_DIRECTION_PROP) === 'descending';
    const zDescending = this.css.get(Z_DIRECTION_PROP) === 'descending';

    if (this.xDescending !== xDescending || this.yDescending !== yDescending) {
      this.xDescending = xDescending;
      this.yDescending = yDescending;
    }

    if (this.zDescending !== zDescending) {
      this.zDescending = zDescending;
    }

    this._renderXY   = true;
    this._renderZ    = true;

    this.setLabels();
  }

  setGutterAndZWidthFromCSS(gutterChanged) {
    const gutterWidth = this.css.get(GUTTER_WIDTH_PROP);
    const zWidth      = this.css.get(Z_WIDTH_PROP);

    if (gutterChanged) {
      this.$gutter.style.flexBasis = gutterWidth;
    }

    this.$z.style.flexBasis = `calc(${ zWidth } - (${ gutterWidth } / 2))`;
  }

  setLabels() {
    // let [ labelX, labelY, labelZ ] = this.mode.labels;

    // // TODO: Figure out how to internationalize this and make it more
    // // informative.

    // const xDir = this.xDescending ? 'right' : 'left';
    // const yDir = this.yDescending ? 'top' : 'bottom';

    // const zDir = this.zDescending ?
    //   this.horizontal ? 'top' : 'right' :
    //   this.horizontal ? 'bottom' : 'left';

    // const labelXY = `
    //   ${ labelX } (left & right arrows, increasing from the ${ xDir });
    //   ${ labelY } (up & down arrows, increasing from the ${ yDir })
    // `;

    // labelZ = `
    //   ${ labelZ }
    //   (${ this.horizontal ? 'up & down arrows' : 'left & right arrows' },
    //   increasing from the ${ zDir })
    // `;

    // this.$xyCanvas.setAttribute('aria-label', labelXY);
    // this.$zCanvas.setAttribute('aria-label', labelZ);
  }

  setOrientationFromCSS(orientationChanged, directionChanged) {
    if (orientationChanged) {
      const raw = this.css.get(Z_POSITION_PROP);
      const val = Z_AXIS_POSITIONS.has(raw) ? raw : DEFAULT_Z_POSITION;
      const horizontal = val !== 'top' && val !== 'bottom';

      if (horizontal !== this.horizontal) {
        this.$zNub.classList[horizontal ? 'remove' : 'add']('vertical');
        this.horizontal = horizontal;
        this._renderZ   = true;
      }

      if (this.zPosition === val && !directionChanged) return;

      this.zPosition = val;
    }

    this.$container.style.flexDirection =
      this.zPosition === 'start'  ? 'row-reverse' :
      this.zPosition === 'end'    ? 'row' :
      this.zPosition === 'top'    ? 'column-reverse' :
      this.zPosition === 'bottom' ? 'column' :
      this.zPosition === 'left'
        ? this.css.get(DIRECTION_PROP) === 'ltr' ? 'row-reverse' : 'row'
        : this.css.get(DIRECTION_PROP) === 'rtl' ? 'row-reverse' : 'row';
  }

  setResolutionFromCSS() {
    const raw = this.css.get(HIGH_RES_PROP);
    const val = raw === 'true' || (raw === 'auto' ? this.highResAuto : false);

    if (this.highRes !== val) {
      this.highRes      = val;
      this._renderXY    = true;
      this._renderZ     = true;
    }
  }

  setSelectionFromRGB(rgb) {
    [ this.xAxisValue, this.yAxisValue, this.zAxisValue ] =
      this.mode.fromRGB(...rgb);

    if (!this._dragging) {
      this._renderXY = true;
      this._renderZ = true;
    }
  }

  setXYNubPosition() {
    const x = (this.xDescending ? 1 - this.effectiveX : this.effectiveX) * 100;
    const y = (this.yDescending ? 1 - this.effectiveY : this.effectiveY) * 100;

    this.$xyNub.style.left = `${ x }%`;
    this.$xyNub.style.bottom = `${ y }%`;
  }

  setXYTentativelyFromEvent({ offsetX, offsetY }) {
    const fractionX = offsetX / this.xyWidth || 0;
    const fractionY = offsetY / this.xyHeight || 0;

    // Note that yDescending _prevents_ rather than causes reversal, since the
    // browser’s coordinate system has an upper left origin while the natural
    // origin for a projection like this would be lower left.

    const x = this.xDescending ? 1 - fractionX : fractionX;
    const y = this.yDescending ? fractionY : 1 - fractionY;

    if (this._transientX !== x || this._transientY !== y) {
      this._renderZ    = true;
      this._transientX = x;
      this._transientY = y;
    }
  }

  setXYZNubColors() {
    const rgb = this.effectiveSelectionAsRGB();

    this.$zNub.style.backgroundColor =
    this.$xyNub.style.backgroundColor =
      rgbToHexString([ ...rgb ]);

    const hcl = color.hcl.fromRGB(...rgb);
    const l   = hcl[2];

    if (l < LUMINANCE_THRESHOLD) {
      hcl[2] += (1 - l) * LUMINANCE_OFFSET;
    } else {
      hcl[2] -= l * LUMINANCE_OFFSET;
    }

    color.hcl.write(rgb, 0, ...hcl);

    this.$zNub.style.borderColor =
    this.$xyNub.style.borderColor =
      rgbToHexString([ ...rgb ]);
  }

  setZNubPosition() {
    const z = (this.zDescending ? 1 - this.effectiveZ : this.effectiveZ) * 100;

    if (this.horizontal) {
      this.$zNub.style.left   = 'inherit';
      this.$zNub.style.bottom = `${ z }%`;
    } else {
      this.$zNub.style.left   = `${ z }%`;
      this.$zNub.style.bottom = 'inherit';
    }
  }

  setZTentativelyFromEvent({ offsetX, offsetY }) {
    const [ offset, length ] = this.horizontal
      ? [ offsetY, this.zHeight ]
      : [ offsetX, this.zWidth ];

    const fractionZ = offset / length || 0;

    const z = this.zDescending !== this.horizontal ? 1 - fractionZ : fractionZ;

    if (this._transientZ !== z) {
      this._renderXY   = true;
      this._transientZ = z;
    }
  }

  signalChange() {
    this.dirty = true;
    this.$host.dispatchEvent(new CustomEvent('change'));
  }

  updateFromCSS() {
    const decl    = window.getComputedStyle(this.$container);
    const styles  = CSS_PROPERTIES.map(getObservedProperties(decl));
    const changed = new Map(styles.filter(([ k, v ]) => this.css.get(k) !== v));

    if (!changed.size) return;

    this.css = new Map(styles);

    const directionChanged   = changed.has(DIRECTION_PROP);
    const gutterWidthChanged = changed.has(GUTTER_WIDTH_PROP);
    const highResChanged     = changed.has(HIGH_RES_PROP);
    const orientationChanged = changed.has(Z_POSITION_PROP);
    const xDirectionChanged  = changed.has(X_DIRECTION_PROP);
    const yDirectionChanged  = changed.has(Y_DIRECTION_PROP);
    const zDirectionChanged  = changed.has(Z_DIRECTION_PROP);
    const zWidthChanged      = changed.has(Z_WIDTH_PROP);

    if (orientationChanged || directionChanged)
      this.setOrientationFromCSS(orientationChanged, directionChanged);

    if (gutterWidthChanged || zWidthChanged)
      this.setGutterAndZWidthFromCSS(gutterWidthChanged);

    if (highResChanged)
      this.setResolutionFromCSS();

    if (xDirectionChanged || yDirectionChanged || zDirectionChanged)
      this.setDirectionsFromCSS();
  }

  updateFromDimensions() {
    let { clientWidth: xyWidth, clientHeight: xyHeight } = this.$xy;
    let { clientWidth: zWidth,  clientHeight: zHeight } = this.$z;

    if (this.highRes) {
      xyHeight *= 2, xyWidth *= 2, zHeight *= 2, zWidth *= 2;
    }

    xyHeight = xyHeight || 1;
    xyWidth  = xyWidth || 1;

    zHeight = this.horizontal ? zHeight || 1 : 1;
    zWidth  = this.horizontal ? 1 : zWidth || 1;

    if (this.xyImage.width !== xyWidth || this.xyImage.height !== xyHeight) {
      this._renderXY = true;

      this.$xyCanvas.width  = xyWidth;
      this.$xyCanvas.height = xyHeight;

      this.xyImage = this.xyContext.createImageData(xyWidth, xyHeight);
      this.xyImage.data.fill(0xFF);
    }

    if (this.zImage.width !== zWidth || this.zImage.height !== zHeight) {
      this._renderZ = true;

      this.$zCanvas.width  = zWidth;
      this.$zCanvas.height = zHeight;

      this.zImage = this.zContext.createImageData(zWidth, zHeight);
      this.zImage.data.fill(0xFF);
    }
  }

  updateTabIndex() {
    if (this.$host.hasAttribute('tabindex')) {
      this.$container.removeAttribute('tabindex');
    } else {
      this.$container.setAttribute('tabindex', '0');
    }
  }
}

export default ColorInputInternal;
