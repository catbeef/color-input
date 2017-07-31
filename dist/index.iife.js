(function () {
'use strict';

// We mainly have two sets of functions here:
//
// - hcl, hsl, hsv, etc
//   these are all functions that take a buffer and write index, plus the three
//   axis values as numbers from 0-1 (regardless of the natural representation
//   associated with the format) and write an rgb pixel value into the buffer
// - rgbToHCL, rgbToHSL, etc
//   these accept rgb values and return arrays of 0-1 values; the reverse of the
//   first set except without the buffer writing
//
// The color math here is adapted from various sources, especially d3-color.
// It’s adapted — and not DRY — for the sake of perf. Writing directly to image
// data buffers is considerably more efficient than creating intermediate
// objects for every pixel. It mostly matters for HCL and LAB, which are
// considerably more expensive to calculate; every little bit helps to slightly
// expand the (canvas size) threshold above which a draw might exceed the 17ms
// danger line.
//
// The rgbToXXX functions, on the other hand, do not need to be so tight. Rather
// than being used to render hundreds of thousands of pixels, these are used in
// select one-off circumstances
//
// - when the input has been seeded with an initial "value" attribute
// - when the "mode" attribute has been changed dynamically
// - when the value has been assigned dynamically through the element API
// - when using element API color component accessors
//
// The functions are ultimately exported wrapped under a variety of names that
// take care of mapping between axis arguments and their current meanings under
// the selected mode.

const _X0           = 0.4124564;
const _X1           = 0.3575761;
const _X2           = 0.1804375;
const _Y0           = 0.2126729;
const _Y1           = 0.7151522;
const _Y2           = 0.0721750;
const _Z0           = 0.0193339;
const _Z1           = 0.1191920;
const _Z2           = 0.9503041;
const AB_MAX        = 220;
const AB_OFF        = 110;
const B0            = 0.0556434;
const B1            = 0.2040259;
const B2            = 1.0572252;
const DEG2RAD       = Math.PI / 180;
const G0            = -0.9692660;
const G1            = 1.8760108;
const G2            = 0.0415560;
const HALF          = 0.5;
const HUE_S1        = 60;
const HUE_S2        = 120;
const HUE_S3        = 180;
const HUE_S4        = 240;
const MAX_BYTE      = 0xFF;
const MAX_CHROMA    = 134;
const MAX_HUE       = 360;
const MAX_LUMINANCE = 100;
const R0            = 3.2404542;
const R1            = 1.5371385;
const R2            = 0.4985314;
const RAD2DEG       = 180 / Math.PI;
const RGB_DIV0      = 12.92;
const RGB_DIV1      = 1.055;
const RGB_OFF       = 0.055;
const RGB_PIV       = 0.04045;
const RGB_PIV2      = 0.0031308;
const RGB_POW       = 2.4;
const RGB_POW2      = 1 / 2.4;
const T0            = 4 / 29;
const T1            = 6 / 29;
const T2            = 3 * (T1 ** 2);
const T3            = T1 ** 3;
const THIRD         = 1 / 3;
const X0            = 500;
const XN            = 0.950470;
const XYZ_POW       = 3;
const Y0            = 16;
const Y1            = 116;
const Z0            = 200;
const ZN            = 1.088830;

// WRITE FUNCTIONS /////////////////////////////////////////////////////////////

const hcl = (b, i, xH, yC, zL) => {
  const h = xH * MAX_HUE;
  const c = yC * MAX_CHROMA;
  const l = zL * MAX_LUMINANCE;

  // hcl -> lab

  const H = h * DEG2RAD;
  const A = Math.cos(H) * c;
  const B = Math.sin(H) * c;

  // lab -> xyz

  const y = (l + Y0) / Y1;
  const x = Number.isNaN(A) ? y : y + A / X0;
  const z = Number.isNaN(B) ? y : y - B / Z0;
  const Y =       y > T1 ? y ** XYZ_POW : T2 * (y - T0);
  const X = XN * (x > T1 ? x ** XYZ_POW : T2 * (x - T0));
  const Z = ZN * (z > T1 ? z ** XYZ_POW : T2 * (z - T0));

  // xyz -> rgb

  const R = R0 * X - R1 * Y - R2 * Z;
  const G = G0 * X + G1 * Y + G2 * Z;
  const V = B0 * X - B1 * Y + B2 * Z;

  b[i] = MAX_BYTE *
    (R <= RGB_PIV2 ? RGB_DIV0 * R : RGB_DIV1 * (R ** RGB_POW2) - RGB_OFF);

  b[i + 1] = MAX_BYTE *
    (G <= RGB_PIV2 ? RGB_DIV0 * G : RGB_DIV1 * (G ** RGB_POW2) - RGB_OFF);

  b[i + 2] = MAX_BYTE *
    (V <= RGB_PIV2 ? RGB_DIV0 * V : RGB_DIV1 * (V ** RGB_POW2) - RGB_OFF);
};

const hsl = (b, i, xH, s, l) => {
  const h2 = xH * MAX_HUE;
  const m2 = l + (l < HALF ? l : 1 - l) * s;
  const m1 = 2 * l - m2;
  const h1 = h2 >= HUE_S4 ? h2 - HUE_S4 : h2 + HUE_S2;
  const h3 = h2 < HUE_S2 ? h2 + HUE_S4 : h2 - HUE_S2;

  b[i] = MAX_BYTE * (
    h1 < HUE_S1 ? m1 + (m2 - m1) * h1 / HUE_S1 :
    h1 < HUE_S3 ? m2 :
    h1 < HUE_S4 ? m1 + (m2 - m1) * (HUE_S4 - h1) / HUE_S1 :
    m1
  );

  b[i + 1] = MAX_BYTE * (
    h2 < HUE_S1 ? m1 + (m2 - m1) * h2 / HUE_S1 :
    h2 < HUE_S3 ? m2 :
    h2 < HUE_S4 ? m1 + (m2 - m1) * (HUE_S4 - h2) / HUE_S1 :
    m1
  );

  b[i + 2] = MAX_BYTE * (
    h3 < HUE_S1 ? m1 + (m2 - m1) * h3 / HUE_S1 :
    h3 < HUE_S3 ? m2 :
    h3 < HUE_S4 ? m1 + (m2 - m1) * (HUE_S4 - h3) / HUE_S1 :
    m1
  );
};

const hsv = (b, i, h, s, v) => {
  if (s === 0) {
    b[i] = b[i + 1] = b[i + 2] = v * MAX_BYTE;
    return;
  }

  const V = v * MAX_BYTE;
  const H = h === 1 ? 0 : h * 6;
  const X = Math.floor(H);
  const x = H - X;
  const A = V * (1 - s);
  const B = V * (1 - s * x);
  const C = V * (1 - s * (1 - x));

  switch (X) {
    case 0:
      b[i]     = V;
      b[i + 1] = C;
      b[i + 2] = A;
      return;
    case 1:
      b[i]     = B;
      b[i + 1] = V;
      b[i + 2] = A;
      return;
    case 2:
      b[i]     = A;
      b[i + 1] = V;
      b[i + 2] = C;
      return;
    case 3:
      b[i]     = A;
      b[i + 1] = B;
      b[i + 2] = V;
      return;
    case 4:
      b[i]     = C;
      b[i + 1] = A;
      b[i + 2] = V;
      return;
    default:
      b[i]     = V;
      b[i + 1] = A;
      b[i + 2] = B;
  }
};

const lab = (b, i, xL, yA, zB) => {
  const l = xL * MAX_LUMINANCE;
  const A = (yA * AB_MAX) - AB_OFF;
  const B = (zB * AB_MAX) - AB_OFF;

  // lab -> xyz

  const y = (l + Y0) / Y1;
  const x = Number.isNaN(A) ? y : y + A / X0;
  const z = Number.isNaN(B) ? y : y - B / Z0;
  const Y =       y > T1 ? y ** XYZ_POW : T2 * (y - T0);
  const X = XN * (x > T1 ? x ** XYZ_POW : T2 * (x - T0));
  const Z = ZN * (z > T1 ? z ** XYZ_POW : T2 * (z - T0));

  // xyz -> rgb

  const R = R0 * X - R1 * Y - R2 * Z;
  const G = G0 * X + G1 * Y + G2 * Z;
  const V = B0 * X - B1 * Y + B2 * Z;

  b[i] = MAX_BYTE *
    (R <= RGB_PIV2 ? RGB_DIV0 * R : RGB_DIV1 * (R ** RGB_POW2) - RGB_OFF);

  b[i + 1] = MAX_BYTE *
    (G <= RGB_PIV2 ? RGB_DIV0 * G : RGB_DIV1 * (G ** RGB_POW2) - RGB_OFF);

  b[i + 2] = MAX_BYTE *
    (V <= RGB_PIV2 ? RGB_DIV0 * V : RGB_DIV1 * (V ** RGB_POW2) - RGB_OFF);
};

const rgb = (b, i, xR, yG, zB) => {
  b[i]     = Math.round(xR * MAX_BYTE);
  b[i + 1] = Math.round(yG * MAX_BYTE);
  b[i + 2] = Math.round(zB * MAX_BYTE);
};

// INPUT FUNCTIONS /////////////////////////////////////////////////////////////

const rgbToHCL = (r, g, b) => {
  const [ L, A, B ] = rgbToLAB1(r, g, b);

  const h = Math.atan2(B, A) * RAD2DEG;
  const H = h < 0 ? h + MAX_HUE : h;
  const C = Math.sqrt(A * A + B * B);

  return [ H / MAX_HUE, C / MAX_CHROMA, L / MAX_LUMINANCE ];
};

const rgbToHSL = (r, g, b) => {
  const RGB = rgbToRGB(r, g, b);

  const min   = Math.min(...RGB);
  const max   = Math.max(...RGB);
  const delta = max - min;
  const L     = (max + min) / 2 || 0;

  if (delta === 0) return [ 0, 0, L ];

  const S = delta / (L < HALF ? max + min : 2 - max - min);

  const [ deltaR, deltaG, deltaB ] = RGB
    .map(n => (((max - n) / 6) + (delta / 2)) / delta);

  const [ R, G ] = RGB;

  const h =
    R === max ? deltaB - deltaG :
    G === max ? THIRD + deltaR - deltaB :
    THIRD + THIRD + deltaG - deltaR;

  return [ h < 0 ? h + 1 : h > 1 ? h - 1 : h, S, L ];
};

const rgbToHSV = (r, g, b) => {
  const RGB = rgbToRGB(r, g, b);

  const min   = Math.min(...RGB);
  const max   = Math.max(...RGB);
  const delta = max - min;

  if (delta === 0) return [ 0, 0, max ];

  const [ deltaR, deltaG, deltaB ] = RGB
    .map(n => (((max - n) / 6) + (delta / 2)) / delta);

  const [ R, G ] = RGB;

  const h =
    R === max ? deltaB - deltaG :
    G === max ? THIRD + deltaR - deltaB :
    THIRD + THIRD + deltaG - deltaR;

  return [ h < 0 ? h + 1 : h > 1 ? h - 1 : h, delta / max, max ];
};

const rgbToLAB1 = (r, g, b) => {
  const [ R, G, B ] = rgbToRGB(r, g, b);

  const v = R <= RGB_PIV ? R / RGB_DIV0 : ((R + RGB_OFF) / RGB_DIV1) ** RGB_POW;
  const a = G <= RGB_PIV ? G / RGB_DIV0 : ((G + RGB_OFF) / RGB_DIV1) ** RGB_POW;
  const l = B <= RGB_PIV ? B / RGB_DIV0 : ((B + RGB_OFF) / RGB_DIV1) ** RGB_POW;

  const x = (_X0 * v + _X1 * a + _X2 * l) / XN;
  const y =  _Y0 * v + _Y1 * a + _Y2 * l;
  const z = (_Z0 * v + _Z1 * a + _Z2 * l) / ZN;

  const X = x > T3 ? x ** THIRD : x / T2 + T0;
  const Y = y > T3 ? y ** THIRD : y / T2 + T0;
  const Z = z > T3 ? z ** THIRD : z / T2 + T0;

  return [
    Y1 * Y - Y0,
    X0 * (X - Y),
    Z0 * (Y - Z)
  ];
};

const rgbToLAB = (r, g, b) => {
  const [ L, A, B ] = rgbToLAB1(r, g, b);

  return [
    L / 100,
    (A + AB_OFF) / AB_MAX,
    (B + AB_OFF) / AB_MAX
  ];
};

const rgbToRGB = (...rgb) => rgb.map(n => n / MAX_BYTE);

// PERMUTATIONS ////////////////////////////////////////////////////////////////

const pairs = [
  [ 'hcl', hcl, rgbToHCL, 'hue', 'chroma', 'luminance' ],
  [ 'hsl', hsl, rgbToHSL, 'hue', 'saturation', 'luminosity' ],
  [ 'hsv', hsv, rgbToHSV, 'hue', 'saturation', 'value' ],
  [ 'lab', lab, rgbToLAB, 'lightness', 'red to green', 'blue to yellow' ],
  [ 'rgb', rgb, rgbToRGB, 'red', 'green', 'blue' ]
];

var color = pairs.reduce((acc, [ name, write, fromRGB, lX, lY, lZ ]) => {
  const [ x, y, z ] = name;

  acc[name] = { labels: [ lX, lY, lZ ], name, write, fromRGB };

  name = [ x, z, y ].join('');
  acc[name] = {
    name,
    labels: [ lX, lZ, lY ],
    write: (b, i, X, Y, Z) => write(b, i, X, Z, Y),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ x, z, y ];
    }
  };

  name = [ y, x, z ].join('');
  acc[name] = {
    name,
    labels: [ lY, lX, lZ ],
    write: (b, i, X, Y, Z) => write(b, i, Y, X, Z),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ y, x, z ];
    }
  };

  name = [ y, z, x ].join('');
  acc[name] = {
    name,
    labels: [ lY, lZ, lX ],
    write: (b, i, X, Y, Z) => write(b, i, Z, X, Y),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ y, z, x ];
    }
  };

  name = [ z, x, y ].join('');
  acc[name] = {
    name,
    labels: [ lZ, lX, lY ],
    write: (b, i, X, Y, Z) => write(b, i, Y, Z, X),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ z, x, y ];
    }
  };

  name = [ z, y, x ].join('');
  acc[name] = {
    name,
    labels: [ lZ, lY, lX ],
    write: (b, i, X, Y, Z) => write(b, i, Z, Y, X),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ z, y, x ];
    }
  };

  // Note how "yzx" and "zxy" are reversed. This is not intuitive and it took me
  // a while to accept that it is true and not a bug somewhere else — well, I
  // think! But for example "clh" (i.e. "yzx" order) needs hue (z pos) to be
  // first arg (x pos). It’s just ... why do the others map directly? I don’t
  // want to think about this anymore.

  return acc;
}, {});

const INVALID_KEYWORDS = new Set([
  '',
  'auto',
  'currentColor',
  'inherit',
  'transparent',
  'unset'
]);

const RGB_HEX_SHORTHAND_PATTERN =
  /^\s*#?([\da-f])([\da-f])([\da-f])\s*$/i;

const RGB_HEX_PATTERN =
  /^\s*#?([\da-f]{2})([\da-f]{2})([\da-f]{2})(?:[\da-f]{2})?\s*$/i;

const RGB_FUNC_NORMALIZED_PATTERN =
  /rgba?\((\d+),\s*(\d+),\s*(\d+)/;

const fillHex = n =>
  (n << 4) + n;

const parseColorViaDOM = str => {
  const div = document.createElement('div');

  Object.assign(div.style, {
    color    : str,
    position : 'absolute'
  });

  document.body.appendChild(div);

  const normalizedRGB = getComputedStyle(div).color;

  div.remove();

  const match = RGB_FUNC_NORMALIZED_PATTERN.exec(normalizedRGB);

  if (match) return match.slice(1).map(parseDec);
};

const parseDec = n => Number
  .parseInt(n);

const parseHex = n => Number
  .parseInt(n, 16);

const rgbValueToHexComponent = n => n
  .toString(16)
  .padStart(2, 0)
  .toUpperCase();

const cssColorStringToRGB = str => {
  if (typeof str === 'string') {

    let match;

    if (match = str.match(RGB_HEX_PATTERN))
      return match.slice(1).map(parseHex);

    if (match = str.match(RGB_HEX_SHORTHAND_PATTERN))
      return match.slice(1).map(parseHex).map(fillHex);

    // We’d like to support all CSS color formats (except inapplicable keywords)
    //
    // Good:
    // - as new notations are added, we support them automatically
    // - no need for maintaining a color keywords list
    // - no need for implementing conversions from hsv, hsl, lch, etc
    //
    // Bad:
    // - an invalid value will still end up giving us a fallback
    // - library capability varies with client capability (though one might
    //   argue this is the correct behavior if we want our component to be
    //   genuinely "DOM-like").

    str = str.trim();

    if (INVALID_KEYWORDS.has(str)) return;

    return parseColorViaDOM(str);
  }
};

const rgbToHexString = rgb =>
  `#${ rgb.map(rgbValueToHexComponent).join('') }`;

const CONTAINER_ID = 'CI_CONTAINER';
const GUTTER_ID    = 'CI_GUTTER';
const XY_CANVAS_ID = 'CI_XY_CANVAS';
const XY_ID        = 'CI_XY';
const XY_NUB_ID    = 'CI_XY_NUB';
const Z_CANVAS_ID  = 'CI_Z_CANVAS';
const Z_ID         = 'CI_Z';
const Z_NUB_ID     = 'CI_Z_NUB';

const DEFAULT_GUTTER_WIDTH          = '20px';
const DEFAULT_SLIDER_RADIUS         = '15px';
const DEFAULT_Z_AXIS_WIDTH          = '35px';
const INITIAL_NUB_MOVEMENT_DURATION = 120;

// A few notes on the CSS:
//
// Flex gives us a few advantages here. It allows us to keep the exposed CSS API
// simpler, it allows us to touch "dir" less because it makes rtl/ltr free, and
// it lets the browser do most of the width calculations we need for the canvas
// contexts for us. Plus it does it all fast and, critically, _prior_ to each
// RAF callback, where we need to inspect any size changes but want to avoid
// causing them ourselves.
//
// The use of absolute positioning on the second-level container (which must not
// be exposed to foreign CSS) lets us ensure that users can set the height of
// the exposed element any way they want in any crazy context without leading to
// (a) states where we stay "propped open" by a previous height or (b) much
// worse, states where the element will become continuously larger on every
// frame! (The latter could happen otherwise because we need to always sync the
// canvas height attribute — not the CSS height property — with the available
// space in the element to maintain the correct context size, and this has a
// side effect, which is that it gives the element an actual height that will
// supercede a flex-basis or percentage height set in CSS _if_ the height would
// otherwise be calculated as zero. Thus setting 100% height on the parent
// element, provided it has an unsized parent itself, would then create a
// feedback loop that continuously expands what "100%" means for the parent.)
//
// The relative positioning in the third-level containers is to permit us to set
// the locations of the (absolutely positioned) nubs.

var template = Object.assign(document.createElement('template'), {
  innerHTML: `
    <style>
      :host {
        contain          : content;
        display          : block;
        height           : 230px;
        width            : 275px;
      }

      #${ CONTAINER_ID } {
        box-sizing       : border-box;
        display          : flex;
        height           : 100%;
        left             : 0;
        outline-offset   : -5px; /* will be truncated otherwise */
        overflow         : hidden;
        padding          : var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        );
        position         : absolute;
        top              : 0;
        user-select      : none;
        width            : 100%;
      }

      #${ GUTTER_ID } {
        flex             : 0 0 ${ DEFAULT_GUTTER_WIDTH };
      }

      #${ XY_CANVAS_ID },
      #${ Z_CANVAS_ID } {
        cursor           : pointer;
        height           : 100%;
        transform        : translateZ(0); /* prevents horrible repaint bugs */
        width            : 100%;
      }

      #${ XY_ID },
      #${ Z_ID } {
        align-items      : center;
        border           : var(--color-input-xy-border);
        border-radius    : var(--color-input-xy-border-radius);
        box-sizing       : border-box;
        display          : flex;
        flex-shrink      : 0;
        justify-content  : center;
        overflow         : visible;
        position         : relative;
      }

      #${ XY_ID } {
        flex-basis       : 0;
        flex-grow        : 1;
      }

      #${ Z_ID } {
        flex-basis       : ${ DEFAULT_Z_AXIS_WIDTH };
      }

      #${ XY_NUB_ID },
      #${ Z_NUB_ID } {
        border-style     : solid;
        border-width     : 2px;
        border-radius    : calc(2 * var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        ));
        bottom           : 0;
        box-sizing       : border-box;
        cursor           : pointer;
        height           : calc(2 * var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        ));
        margin-bottom    : calc(0px - var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        ));
        position         : absolute;
        transform        : scale(var(--color-input-slider-scale, 0.667));
        transform-origin : center;
        transition       : transform 80ms ease, border-color 80ms ease;
        width            : calc(2 * var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        ));
      }

      #${ XY_NUB_ID }.dragging,
      #${ Z_NUB_ID }.dragging {
        transform: none;
      }

      #${ XY_NUB_ID }.initial-movement,
      #${ Z_NUB_ID }.initial-movement {
        transition:
          background-color 80ms  ease,
          border-color     80ms  ease,
          bottom           ${ INITIAL_NUB_MOVEMENT_DURATION }ms ease,
          left             ${ INITIAL_NUB_MOVEMENT_DURATION }ms ease,
          transform        80ms  ease;
      }

      #${ XY_NUB_ID } {
        left             : 0;
        margin-left      : calc(0px - var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        ));
      }

      #${ Z_NUB_ID } {
      }
    </style>

    <div
      id="${ CONTAINER_ID }"
      tabindex="0">

      <div id="${ XY_ID }">
        <canvas
          height="0"
          id="${ XY_CANVAS_ID }"
          tabindex="0"
          width="0">
        </canvas>
        <div id="${ XY_NUB_ID }"></div>
      </div>

      <div id="${ GUTTER_ID }"></div>

      <div id="${ Z_ID }">
        <canvas
          height="0"
          id="${ Z_CANVAS_ID }"
          tabindex="0"
          width="0">
        </canvas>
        <div id="${ Z_NUB_ID }"></div>
      </div>
    </div>
  `
});

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
const SELECTION_GRACE_ZONE = 15;

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

    this.$container.addEventListener('keydown', containerKey);
    this.$xyCanvas.addEventListener('mousedown', xyMouseDown);
    this.$xyCanvas.addEventListener('keydown', xyKey);
    this.$xyNub.addEventListener('mousedown', xyNubMouseDown);
    this.$zCanvas.addEventListener('mousedown', zMouseDown);
    this.$zCanvas.addEventListener('keydown', zKey);
    this.$zNub.addEventListener('mousedown', zNubMouseDown);

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
    const { xAxisValue: x, yAxisValue: y, zAxisValue: z } = this;

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
      this.$zNub.style.left   = '';
      this.$zNub.style.bottom = `${ z }%`;
    } else {
      this.$zNub.style.left   = `${ z }%`;
      this.$zNub.style.bottom = '';
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

    xyHeight = xyHeight || 1, xyWidth = xyWidth || 1;
    zHeight = zHeight || 1, zWidth = zWidth || 1;

    if (this.xyImage.width !== xyWidth || this.xyImage.height !== xyHeight) {
      this._renderXY = true;

      this.$xyCanvas.width  = xyWidth;
      this.$xyCanvas.height = xyHeight;

      this.xyImage = this.xyContext.createImageData(xyWidth, xyHeight);
      this.xyImage.data.fill(0xFF);
    }

    if (this.zImage.width !== zWidth || this.zImage.height !== zHeight) {
      this._renderZ = true;

      this.$zCanvas.width = zWidth;
      this.$zCanvas.height = zHeight;

      this.zImage = this.zContext.createImageData(zWidth, zHeight);
      this.zImage.data.fill(0xFF);
    }
  }
}

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

    priv.setLabels();
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
    current  = (current || '').trim();
    previous = (previous || '').trim();

    if (current === previous) return;

    current = current === 'true' || (current === 'false' ? false : current);

    switch (attrKey) {
      case 'mode':
        this.mode = current;
        return;
      case 'name':
        this.name = current;
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
      'mode',
      'name',
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

// This is the entrypoint for ES and CJS. It causes no pollution of either the
// global scope or the global registry; rather, it exposes two named exports:
//
// ColorInput : the element constructor itself — which could be modified or
//              subclassed for further customization
// register() : a convenience function for adding the element to the registry.
//              It permits overriding the name.

const register = (name='color-input') => {
  customElements.define(name, ColorInputElement);
};

// This is the entry point for the IIFE target, producing a result suitable for
// inclusion as a script rather than a module. Therefore it automatically
// registers the element under its default name.

register();

}());
