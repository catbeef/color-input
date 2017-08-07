import color from './color';

import { getLanguage } from './color-language';
import { cssColorStringToRGB, rgbToHexString } from './parse-color';

import template, {
  CONTAINER_ID, DESC_ID, GUTTER_ID, OUTER_ID,
  TEXT_DATA_ID, TEXT_INPUT_ID, TEXT_INPUT_LABEL_ID, TEXT_INPUT_ROW_ID,
  XY_ALERT_ID, XY_CANVAS_ID, XY_ID, XY_NUB_ID,
  Z_CANVAS_ID, Z_ID, Z_NUB_ID,
  DEFAULT_GUTTER_WIDTH, DEFAULT_Z_AXIS_WIDTH,
  INITIAL_NUB_MOVEMENT_DURATION
} from './color-input-template';

const ARROW_KEYS = new Set([
  'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'
]);

const DIRECTION_PROP        = 'direction';
const GUTTER_WIDTH_PROP     = '--color-input-gutter-width';
const HIGH_RES_PROP         = '--color-input-high-res';
const INPUT_POSITION_PROP   = '--color-input-field-position';
const LABEL_VISIBILITY_PROP = '--color-input-label-visibility';
const X_DIRECTION_PROP      = '--color-input-x-axis-direction';
const Y_DIRECTION_PROP      = '--color-input-y-axis-direction';
const Z_DIRECTION_PROP      = '--color-input-z-axis-direction';
const Z_POSITION_PROP       = '--color-input-z-axis-position';
const Z_WIDTH_PROP          = '--color-input-z-axis-width';

const DEFAULT_AXIS_DIRECTION   = 'ascending';
const DEFAULT_DIRECTION        = 'ltr';
const DEFAULT_INPUT_POSITION   = 'bottom';
const DEFAULT_LABEL_VISIBILITY = 'none';
const DEFAULT_RESOLUTION       = 'false';
const DEFAULT_Z_POSITION       = 'end';

const CSS_PROPERTIES = [
  [ DIRECTION_PROP,        DEFAULT_DIRECTION        ],
  [ GUTTER_WIDTH_PROP,     DEFAULT_GUTTER_WIDTH     ],
  [ HIGH_RES_PROP,         DEFAULT_RESOLUTION       ],
  [ INPUT_POSITION_PROP,   DEFAULT_INPUT_POSITION   ],
  [ LABEL_VISIBILITY_PROP, DEFAULT_LABEL_VISIBILITY ],
  [ X_DIRECTION_PROP,      DEFAULT_AXIS_DIRECTION   ],
  [ Y_DIRECTION_PROP,      DEFAULT_AXIS_DIRECTION   ],
  [ Z_DIRECTION_PROP,      DEFAULT_AXIS_DIRECTION   ],
  [ Z_POSITION_PROP,       DEFAULT_Z_POSITION       ],
  [ Z_WIDTH_PROP,          DEFAULT_Z_AXIS_WIDTH     ]
];

const LUMINANCE_OFFSET     = 4 / 7;
const LUMINANCE_THRESHOLD  = 2 / 3;

const INPUT_POSITIONS = new Set([
  'top', 'bottom', 'none'
]);

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
    this.$datalist  = tree.getElementById(TEXT_DATA_ID);
    this.$desc      = tree.getElementById(DESC_ID);
    this.$gutter    = tree.getElementById(GUTTER_ID);
    this.$input     = tree.getElementById(TEXT_INPUT_ID);
    this.$inputRow  = tree.getElementById(TEXT_INPUT_ROW_ID);
    this.$label     = tree.getElementById(TEXT_INPUT_LABEL_ID);
    this.$outer     = tree.getElementById(OUTER_ID);
    this.$xy        = tree.getElementById(XY_ID);
    this.$xyAlert   = tree.getElementById(XY_ALERT_ID);
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
    // this space. The noClamp property shadows the clamp content attribute and
    // if it’s true, imaginary colors will be blacked out instead of clamped.
    // The _raf property is the unique ID of the currently queued RAF, so that
    // we can cancel it on disconnection; the _rafFn is the render loop that
    // sets that value. The _deregs array holds event listener dereg functions
    // that should be called on disconnection.

    this.barePercent = undefined;
    this.colorAccess = new Map();
    this.degrees     = undefined;
    this.lang        = undefined;
    this.mode        = color.hlc;
    this.noClamp     = false;
    this.percent     = undefined;
    this._deregs     = new Set();
    this._raf        = undefined;
    this._grabStyle  = undefined;

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

    this.css           = new Map();
    this.highRes       = false;
    this.highResAuto   = window.devicePixelRatio > 1;
    this.horizontal    = true;
    this.inputPosition = DEFAULT_INPUT_POSITION;
    this.labelVisible  = false;
    this.xDescending   = false;
    this.yDescending   = false;
    this.zDescending   = false;
    this.zPosition     = 'end';

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

    this._dragging      = false;
    this._renderXY      = true;
    this._renderZ       = true;
    this._terminateDrag = undefined;
    this._transientX    = undefined;
    this._transientY    = undefined;
    this._transientZ    = undefined;
    this._xyMouseDown   = undefined;
    this._zMouseDown    = undefined;

    // BOOTSTRAPPING ///////////////////////////////////////////////////////////

    shadow.append(tree);
  }

  addGrab() {
    if (!this._grabStyle) {
      this._grabStyle = Object.assign(document.createElement('style'), {
        innerText: `* { cursor: not-allowed !important; }`
      });
    }

    document.head.appendChild(this._grabStyle);
  }

  connect() {
    this._rafFn();
    this.listenForFocus();
    this.listenForInput();
    this.listenForKeyboard();
    this.listenForMouseDownOnCanvas();
    this.listenForMouseDownOnNubs();
    this.listenForLanguage();
    this.updateLabels();
  }

  disconnect() {
    cancelAnimationFrame(this._raf);
    this._deregs.forEach(fn => fn());
    this._deregs.clear();
    this._grabStyle = undefined;
    this.removeGrab();
  }

  effectiveSelectionAsRGB() {
    const { mode, effectiveX, effectiveY, effectiveZ } = this;
    const buffer = new Uint8ClampedArray(3);

    mode.write(buffer, 0, effectiveX, effectiveY, effectiveZ, false);

    return buffer;
  }

  getGraceZone() {
    return Number.parseFloat(window.getComputedStyle(this.$container).padding);
  }

  getLabelXY(prefix) {
    return (
      `${ prefix }: ` +
      `${ this.xWord } (${ this.lang.leftAndRight }), ` +
      `${ this.yWord } (${ this.lang.upAndDown })`
    );
  }

  getLabelZ(prefix) {
    return `${ prefix }: ${ this.zWord }`;
  }

  inGraceZone(clientX, clientY, $canvas) {
    const { bottom, left, right, top } = $canvas.getBoundingClientRect();

    const graceZone = this.getGraceZone();

    return (
      clientX + graceZone >= left &&
      clientX - graceZone <= right &&
      clientY + graceZone >= top &&
      clientY - graceZone <= bottom
    );
  }

  listenForFocus() {
    const focus = () => {
      this.$xyAlert.setAttribute('role', 'alert'); // VoiceOver needs this.
      this.$xyAlert.setAttribute('aria-live', 'polite');
    };

    const blur  = () => {
      this.$xyAlert.removeAttribute('role');
      this.$xyAlert.removeAttribute('aria-live');
    };

    this.$xyCanvas.addEventListener('focus', focus);
    this.$xyCanvas.addEventListener('blur', blur);

    this._deregs
      .add(() => this.$xyCanvas.removeEventListener('focus', focus))
      .add(() => this.$xyCanvas.removeEventListener('blur', blur));
  }

  listenForInput() {
    // Text input change is the simplest event to handle, since we only need to
    // let it trigger an update, as would occur if setting $host.value directly.
    // The exceptional case is that we may need to translate an autocomplete
    // selection to its hex value if it was typed but not expressly selected.

    const change = () => {
      let { value } = this.$input;

      const match = this.lang.colors.find(([ , name ]) => name === value);

      if (match) [ value ] = match;

      this.$host.value = value;
    };

    this.$input.addEventListener('change', change);

    this._deregs
      .add(() => this.$input.removeEventListener('change', change));
  }

  listenForKeyboard() {
    // We’re interested in keyboard control in three places: xy, z, and the
    // outer container for both. The behavior for xy and z is not identical
    // because z is always constrained in one or another direction depending on
    // the layout, while xy is always able to move in any direction. The outer
    // handler captures an escape key press; that should cancel any active
    // dragging, restoring the user’s selection before the drag began.

    const outerKey = event => {
      if (event.defaultPrevented) return;

      if (this._dragging && event.key === 'Escape') {
        if (this._terminateDrag) this._terminateDrag();
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

    this.$xyCanvas.addEventListener('keydown', xyKey);
    this.$zCanvas.addEventListener('keydown', zKey);
    this.$outer.addEventListener('keydown', outerKey);

    this._deregs
      .add(() => this.$xyCanvas.removeEventListener('keydown', xyKey))
      .add(() => this.$zCanvas.removeEventListener('keydown', zKey))
      .add(() => this.$outer.removeEventListener('keydown', outerKey));
  }

  listenForLanguage() {
    const languageChange = () => {
      this.lang = getLanguage();

      const bare = new Intl.NumberFormat(navigator.languages, {
        maximumFractionDigits: 1,
        style: 'decimal'
      });

      const percent = new Intl.NumberFormat(navigator.languages, {
        maximumFractionDigits: 1,
        style: 'percent'
      });

      const degrees = new Intl.NumberFormat(navigator.languages, {
        maximumFractionDigits: 0,
        style: 'decimal'
      });

      this.barePercent = x => bare.format(x * 100);

      this.percent = x => percent.format(x);

      this.degrees = x => `${ degrees.format(x * 360) }°`;

      while (this.$datalist.firstChild) {
        this.$datalist.removeChild(this.$datalist.firstChild);
      }

      for (const [ value, label ] of this.lang.colors) {
        this.$datalist.appendChild(
          Object.assign(document.createElement('option'), { label, value })
        );
      }

      this.updateLabels();
    };

    window.addEventListener('languagechange', languageChange);

    this._deregs
      .add(() => window.removeEventListener('languagechange', languageChange));

    languageChange();
  }

  listenForMouseDownOnCanvas() {
    // A bit of meta BS here to avoid duplicating a rather large chunk — the
    // handling of the canvas mouse down events is indentical aside from the
    // portion broken out into 'setQTentativelyFromEvent', but there are quite a
    // few property pairs involved to reverse for each case.

    for (const [ id, complementID ] of [ [ 'xy', 'z' ], [ 'z', 'xy' ] ]) {
      let timeout;

      const axisValuePairs = [ ...id ].map(axisChar => [
        `${ axisChar }AxisValue`,
        `_transient${ axisChar.toUpperCase() }`
      ]);

      const dragClass =
        `dragging-${ id }`;

      const renderKey =
        `_render${ complementID.toUpperCase() }`;

      const tentativeSetKey =
        `set${ id.toUpperCase() }TentativelyFromEvent`;

      const transientKeys = axisValuePairs
        .map(([ , transientKey ]) => transientKey);

      const {
        [`$${ id }Canvas`]: $canvas,
        [`$${ id }Nub`]: $nub,
        $outer
      } = this;

      const mouseDown = this[`_${ id }MouseDown`] = event => {
        clearTimeout(timeout);

        this[tentativeSetKey](event);
        this._dragging = true;
        this.addGrab();

        $outer.classList.add('dragging', dragClass);
        $nub.classList.add('initial-movement');

        timeout = setTimeout(
          () => $nub.classList.remove('initial-movement'),
          INITIAL_NUB_MOVEMENT_DURATION
        );

        const mouseMove = ({ clientX, clientY }) => {
          const { bottom, left, right, top } = $canvas.getBoundingClientRect();

          const offsetX = Math.min(Math.max(left, clientX), right) - left;
          const offsetY = Math.min(Math.max(top, clientY), bottom) - top;

          this[tentativeSetKey]({ offsetX, offsetY });
        };

        const mouseUp = ({ clientX, clientY }) => {
          if (this.inGraceZone(clientX, clientY, $canvas)) {

            for (const [ axisValueKey, transientKey ] of axisValuePairs) {
              this[axisValueKey] = this[transientKey];
            }

            this[renderKey] = true;

            this.signalChange();
          }

          this._terminateDrag();
        };

        const terminateDrag = this._terminateDrag = () => {
          document.removeEventListener('blur', terminateDrag);
          document.removeEventListener('mousemove', mouseMove);
          document.removeEventListener('mouseup', mouseUp);

          this.removeGrab();

          $canvas.removeEventListener('blur', terminateDrag);

          this.$outer.classList.remove('dragging', dragClass);

          this._deregs.delete(terminateDrag);

          this[renderKey]     = true;
          this._dragging      = false;
          this._terminateDrag = undefined;

          for (const transientKey of transientKeys) {
            this[transientKey] = undefined;
          }
        };

        document.addEventListener('blur', terminateDrag);
        document.addEventListener('mousemove', mouseMove);
        document.addEventListener('mouseup', mouseUp);

        $canvas.addEventListener('blur', terminateDrag);

        this._deregs.add(terminateDrag);
      };

      $canvas.addEventListener('mousedown', mouseDown);

      this._deregs
        .add(() => $canvas.removeEventListener('mousedown', mouseDown));
    }

    this._deregs.add(() => this._xyMouseDown = this._zMouseDown = undefined);
  }

  listenForMouseDownOnNubs() {
    // While the nubs themselves are not focusable elements, they require a
    // distinct mouse input listener because they may extend over the edge of
    // the canvases. The area of the nub outside the canvas should also be a
    // target to begin dragging. We capture these events, clamp the offset
    // values so that they fall within the canvas proper, and artifically call
    // the handlers for the regular canvas mousedown events with the in-bounds
    // values.

    for (const id of [ 'xy', 'z' ]) {
      const $canvas      = this[`$${ id }Canvas`];
      const $nub         = this[`$${ id }Nub`];
      const mouseDownKey = `_${ id }MouseDown`;

      const mouseDown = event => {
        const { clientX, clientY } = event;
        const { bottom, left, right, top } = $canvas.getBoundingClientRect();

        const offsetX = Math.min(Math.max(left, clientX), right) - left;
        const offsetY = Math.min(Math.max(top, clientY), bottom) - top;

        $canvas.focus();
        event.preventDefault();
        this[mouseDownKey]({ offsetX, offsetY });
      };

      $nub.addEventListener('mousedown', mouseDown);

      this._deregs.add(() => $nub.removeEventListener('mousedown', mouseDown));
    }
  }

  removeGrab() {
    if (this._grabStyle) {
      this._grabStyle.remove();
    }
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
    const { noClamp, xDescending, yDescending, effectiveZ: z } = this;
    const { data, height, width } = this.xyImage;
    const { write } = this.mode;

    const lastHeight = height - 1;
    const lastWidth  = width - 1;

    let i = 0;

    for (let r = 0; r < height; r++) {
      const y = yDescending ? r / lastHeight || 0 : 1 - (r / lastHeight || 0);

      for (let c = 0; c < width; c++) {
        const x = c / lastWidth || 0;

        write(data, i, xDescending ? 1 - x : x, y, z, noClamp);

        i += 4;
      }
    }

    this.xyContext.putImageData(this.xyImage, 0, 0);
    //console.timeEnd('renderXY');
  }

  renderZ() {
    //console.time('renderZ');
    const { noClamp, effectiveX: x, effectiveY: y, mode: { write } } = this;
    const { data } = this.zImage;
    const { length } = data;

    const lastLength = length - 4;
    const offset     = this.horizontal !== this.zDescending;

    for (let i = 0; i < length; i += 4) {
      const z = i / lastLength || 0;
      write(data, i, x, y, offset ? 1 - z : z, noClamp);
    }

    this.zContext.putImageData(this.zImage, 0, 0);
    //console.timeEnd('renderZ');
  }

  selectionAsRGB() {
    const { mode, xAxisValue, yAxisValue, zAxisValue } = this;
    const buffer = new Uint8ClampedArray(3);

    mode.write(buffer, 0, xAxisValue, yAxisValue, zAxisValue, false);

    return buffer;
  }

  setDefaultValue(value) {
    this.defaultValue = cssColorStringToRGB(value);

    if (!this.dirty) {
      this.setSelectionFromRGB(this.defaultValue || [ 0, 0, 0 ]);
      this.hasValue = Boolean(this.defaultValue);
      this.$input.value = this.$host.value;
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
  }

  setGutterAndZWidthFromCSS(gutterChanged) {
    const gutterWidth = this.css.get(GUTTER_WIDTH_PROP);
    const zWidth      = this.css.get(Z_WIDTH_PROP);

    if (gutterChanged) {
      this.$gutter.style.flexBasis = gutterWidth;
    }

    this.$z.style.flexBasis = `calc(${ zWidth } - (${ gutterWidth } / 2))`;
  }

  setInputPositionFromCSS() {
    let value = this.css.get(INPUT_POSITION_PROP);

    if (!INPUT_POSITIONS.has(value)) value = DEFAULT_INPUT_POSITION;

    if (this.inputPosition === value) return;

    if (this.inputPosition === 'none') {
      this.$inputRow.classList.remove('speech-only');
    }

    this.inputPosition = value;

    switch (value) {
      case 'bottom':
        this.$outer.style.flexDirection = 'column';
        return;
      case 'none':
        this.$inputRow.classList.add('speech-only');
        return;
      case 'top':
        this.$outer.style.flexDirection = 'column-reverse';
    }
  }

  setLabelVisibilityFromCSS() {
    const labelVisible = this.css.get(LABEL_VISIBILITY_PROP) === 'visible';

    // Note that the visual label is distinct from the explicit aria labelling,
    // and setting it to 'display: none' does not affect the access tree, as it
    // is a less-verbose presentational alternative to begin with.

    if (this.labelVisible !== labelVisible) {
      this.labelVisible = labelVisible;
      this.$label.style.display = labelVisible ? 'block' : 'none';
    }
  }

  setOrientationFromCSS(orientationChanged, directionChanged) {
    if (orientationChanged) {
      const raw = this.css.get(Z_POSITION_PROP);
      const val = Z_AXIS_POSITIONS.has(raw) ? raw : DEFAULT_Z_POSITION;
      const horizontal = val !== 'top' && val !== 'bottom';

      if (horizontal !== this.horizontal) {
        this.$zNub.classList[horizontal ? 'remove' : 'add']('vertical');

        this.$zCanvas.setAttribute(
          'aria-orientation',
          horizontal ? 'vertical' : 'horizontal'
        );

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

    color.hcl.write(rgb, 0, ...hcl, false);

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

  signalChange(valueUnset=false) {
    if (this.noClamp) {
      const { mode, xAxisValue, yAxisValue, zAxisValue } = this;
      const arr = [];

      mode.write(arr, 0, xAxisValue, yAxisValue, zAxisValue, false);

      if (arr.some(n => n > 0xFF || n < 0x00)) {
        [ this.xAxisValue, this.yAxisValue, this.zAxisValue ] =
          this.mode.fromRGB(...Uint8ClampedArray.from(arr));

        this._renderXY = true;
        this._renderZ  = true;
      }
    }

    this.updateValueLabels();

    this.hasValue     = !valueUnset;
    this.dirty        = true;
    this.$input.value = this.$host.value;

    this.$host.dispatchEvent(new CustomEvent('change'));
  }

  updateFromCSS() {
    const decl    = window.getComputedStyle(this.$container);
    const styles  = CSS_PROPERTIES.map(getObservedProperties(decl));
    const changed = new Map(styles.filter(([ k, v ]) => this.css.get(k) !== v));

    if (!changed.size) return;

    this.css = new Map(styles);

    const directionChanged       = changed.has(DIRECTION_PROP);
    const gutterWidthChanged     = changed.has(GUTTER_WIDTH_PROP);
    const highResChanged         = changed.has(HIGH_RES_PROP);
    const inputPositionChanged   = changed.has(INPUT_POSITION_PROP);
    const labelVisibilityChanged = changed.has(LABEL_VISIBILITY_PROP);
    const orientationChanged     = changed.has(Z_POSITION_PROP);
    const xDirectionChanged      = changed.has(X_DIRECTION_PROP);
    const yDirectionChanged      = changed.has(Y_DIRECTION_PROP);
    const zDirectionChanged      = changed.has(Z_DIRECTION_PROP);
    const zWidthChanged          = changed.has(Z_WIDTH_PROP);

    if (inputPositionChanged)
      this.setInputPositionFromCSS();

    if (labelVisibilityChanged)
      this.setLabelVisibilityFromCSS();

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

  updateLabels() {
    const hasAria = this.$host.hasAttribute('aria-label');

    const label = hasAria
      ? this.$host.getAttribute('aria-label')
      : this.lang.prefix;

    if (!hasAria && !this.$host.hasAttribute('tabindex')) {
      this.$outer.setAttribute('aria-label', label);
    } else {
      this.$outer.removeAttribute('aria-label');
    }

    this.$desc.innerText = this.lang.instruction;
    this.$label.innerText = label;
    this.$input.setAttribute('aria-label', label);
    this.$xyCanvas.setAttribute('aria-label', this.getLabelXY(label));
    this.$zCanvas.setAttribute('aria-label', this.getLabelZ(label));

    this.updateValueLabels();
  }

  updateTabIndex() {
    if (this.$host.hasAttribute('tabindex')) {
      this.$outer.removeAttribute('tabindex');
    } else {
      this.$outer.setAttribute('tabindex', '0');
    }
  }

  updateValueLabels() {
    this.$zCanvas
      .setAttribute('aria-valuenow', this.barePercent(this.zAxisValue));

    this.$zCanvas
      .setAttribute('aria-valuetext', this.zAxisValueLanguage);

    this.$xyAlert.innerText =
      `${ this.xWord }: ` +
      `${ this.xAxisValueLanguage }; ` +
      `${ this.yWord }: ` +
      `${ this.yAxisValueLanguage }`;
  }
}

for (const [ index, axisChar ] of [ 'x', 'y', 'z' ].entries()) {
  const transientKey = `_transient${ axisChar.toUpperCase() }`;
  const valueKey = `${ axisChar }AxisValue`;

  Object.defineProperties(ColorInputInternal.prototype, {
    [`${ axisChar }AxisValueLanguage`]: {
      get() {
        if (this.mode.labels[index] === 'hue') {
          return this.degrees(this[valueKey]);
        }

        return this.percent(this[valueKey]);
      }
    },

    [`${ axisChar }Word`]: {
      get() {
        return this.lang[this.mode.labels[index]];
      }
    },

    [`effective${ axisChar.toUpperCase() }`]: {
      get() {
        return this[transientKey] !== undefined
          ? this[transientKey]
          : this[valueKey];
      }
    }
  });
}

for (const id of [ 'xy', 'z' ]) {
  for (const dimension of [ 'height', 'width' ]) {

    const canvasKey = `$${ id }Canvas`;
    const key       = id + dimension[0].toUpperCase() + dimension.slice(1);

    Object.defineProperty(ColorInputInternal.prototype, key, {
      get() {
        return this.highRes
          ? this[canvasKey][dimension] / 2
          : this[canvasKey][dimension];
      }
    });
  }
}

export default ColorInputInternal;
