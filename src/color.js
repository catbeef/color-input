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
  [ 'hcl', hcl, rgbToHCL ],
  [ 'hsl', hsl, rgbToHSL ],
  [ 'hsv', hsv, rgbToHSV ],
  [ 'lab', lab, rgbToLAB ],
  [ 'rgb', rgb, rgbToRGB ]
];

export default pairs.reduce((acc, [ name, write, fromRGB ]) => {
  const [ x, y, z ] = name;

  acc[name] = { name, write, fromRGB };

  name = [ x, z, y ].join('');
  acc[name] = {
    name,
    write: (b, i, X, Y, Z) => write(b, i, X, Z, Y),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ x, z, y ];
    }
  };

  name = [ y, x, z ].join('');
  acc[name] = {
    name,
    write: (b, i, X, Y, Z) => write(b, i, Y, X, Z),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ y, x, z ];
    }
  };

  name = [ y, z, x ].join('');
  acc[name] = {
    name,
    write: (b, i, X, Y, Z) => write(b, i, Z, X, Y),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ y, z, x ];
    }
  };

  name = [ z, x, y ].join('');
  acc[name] = {
    name,
    write: (b, i, X, Y, Z) => write(b, i, Y, Z, X),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ z, x, y ];
    }
  };

  name = [ z, y, x ].join('');
  acc[name] = {
    name,
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
