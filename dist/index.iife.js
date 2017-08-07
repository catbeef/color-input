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

const hcl = (b, i, xH, yC, zL, noClamp) => {
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

  const rr = MAX_BYTE *
    (R <= RGB_PIV2 ? RGB_DIV0 * R : RGB_DIV1 * (R ** RGB_POW2) - RGB_OFF);

  const gg = MAX_BYTE *
    (G <= RGB_PIV2 ? RGB_DIV0 * G : RGB_DIV1 * (G ** RGB_POW2) - RGB_OFF);

  const bb = MAX_BYTE *
    (V <= RGB_PIV2 ? RGB_DIV0 * V : RGB_DIV1 * (V ** RGB_POW2) - RGB_OFF);

  if (noClamp && (Math.max(rr, gg, bb) > 0xFF || Math.min(rr, gg, bb) < 0)) {
    b[i] = b[i + 1] = b[i + 2] = 0;
  } else {
    b[i]     = rr;
    b[i + 1] = gg;
    b[i + 2] = bb;
  }
};

window.hcl = (h, c, l) => {
  const arr = new Uint8Array(3);
  hcl(arr, 0, h, c, l, false);
  return arr;
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

const lab = (b, i, xL, yA, zB, noClamp) => {
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

  const rr = MAX_BYTE *
    (R <= RGB_PIV2 ? RGB_DIV0 * R : RGB_DIV1 * (R ** RGB_POW2) - RGB_OFF);

  const gg = MAX_BYTE *
    (G <= RGB_PIV2 ? RGB_DIV0 * G : RGB_DIV1 * (G ** RGB_POW2) - RGB_OFF);

  const bb = MAX_BYTE *
    (V <= RGB_PIV2 ? RGB_DIV0 * V : RGB_DIV1 * (V ** RGB_POW2) - RGB_OFF);

  if (noClamp && (Math.max(rr, gg, bb) > 0xFF || Math.min(rr, gg, bb) < 0)) {
    b[i] = b[i + 1] = b[i + 2] = 0;
  } else {
    b[i]     = rr;
    b[i + 1] = gg;
    b[i + 2] = bb;
  }
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
  [
    'hcl', hcl, rgbToHCL,
    'hue', 'chroma', 'luminance',
    [ 0, 360 ], [ 0, 134 ], [ 0, 134 ]
  ],
  [
    'hsl', hsl, rgbToHSL,
    'hue', 'saturation', 'luminosity',
    [ 0, 360 ], [ 0, 100 ], [ 0, 100 ]
  ],
  [
    'hsv', hsv, rgbToHSV,
    'hue', 'saturation', 'value',
    [ 0, 360 ], [ 0, 100 ], [ 0, 100 ]
  ],
  [
    'lab', lab, rgbToLAB,
    'lightness', 'red to green', 'blue to yellow',
    [ 0, 100 ], [ -110, 110 ], [ -110, 110 ]
  ],
  [
    'rgb', rgb, rgbToRGB,
    'red', 'green', 'blue',
    [ 0x00, 0xFF ], [ 0x00, 0xFF ], [ 0x00, 0xFF ]
  ]
];

var color = pairs.reduce((acc, data) => {
  let [ name ] = data;
  const [ , write, fromRGB, lX, lY, lZ, mmX, mmY, mmZ ] = data;
  const [ x, y, z ] = name;

  acc[name] = {
    name,
    labels: [ lX, lY, lZ ],
    minMax: [ mmX, mmY, mmZ ],
    write,
    fromRGB
  };

  name = [ x, z, y ].join('');
  acc[name] = {
    name,
    labels: [ lX, lZ, lY ],
    minMax: [ mmX, mmZ, mmY ],
    write: (b, i, X, Y, Z, n) => write(b, i, X, Z, Y, n),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ x, z, y ];
    }
  };

  name = [ y, x, z ].join('');
  acc[name] = {
    name,
    labels: [ lY, lX, lZ ],
    minMax: [ mmY, mmX, mmZ ],
    write: (b, i, X, Y, Z, n) => write(b, i, Y, X, Z, n),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ y, x, z ];
    }
  };

  name = [ y, z, x ].join('');
  acc[name] = {
    name,
    labels: [ lY, lZ, lX ],
    minMax: [ mmY, mmZ, mmX ],
    write: (b, i, X, Y, Z, n) => write(b, i, Z, X, Y, n),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ y, z, x ];
    }
  };

  name = [ z, x, y ].join('');
  acc[name] = {
    name,
    labels: [ lZ, lX, lY ],
    minMax: [ mmZ, mmX, mmY ],
    write: (b, i, X, Y, Z, n) => write(b, i, Y, Z, X, n),
    fromRGB: (r, g, b) => {
      const [ x, y, z ] = fromRGB(r, g, b);
      return [ z, x, y ];
    }
  };

  name = [ z, y, x ].join('');
  acc[name] = {
    name,
    labels: [ lZ, lY, lX ],
    minMax: [ mmZ, mmY, mmX ],
    write: (b, i, X, Y, Z, n) => write(b, i, Z, Y, X, n),
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

var ar = {
  // Axis Words

  blue         : 'أزرق',
  blueToYellow : 'الأزرق إلى الأصفر',
  chroma       : 'صفاء',
  green        : 'أخضر',
  hue          : 'صبغة',
  lightness    : 'إضاءة',
  luminance    : 'إضاءة',
  luminosity   : 'إضاءة',
  red          : 'أحمر',
  redToGreen   : 'الأحمر إلى الأخضر',
  saturation   : 'إشباع',
  value        : 'قيمة',

  // Directions

  instruction  : 'واثنين من المدخلات على أساس السهم وإدخال النص',
  leftAndRight : 'يسار و يمين',
  prefix       : 'إختر لون',
  upAndDown    : 'صعودا وهبوطا',

  // Color Words

  colors: [
  ]
};

var de = {
  // Axis Words

  blue         : 'Blau',
  blueToYellow : 'Blau bis Gelb',
  chroma       : 'Buntheit',
  green        : 'Grün',
  hue          : 'Farbton',
  lightness    : 'Helligkeit',
  luminance    : 'Leuchtdichte',
  luminosity   : 'Helligkeit',
  red          : 'Rot',
  redToGreen   : 'Rot bis Grün',
  saturation   : 'Farbsättigung',
  value        : 'Hellwert',

  // Directions

  instruction  : 'Zwei Pfeiltasten-basierte Eingänge und eine Texteingabe',
  leftAndRight : 'links und rechts',
  prefix       : 'Wähle Farbe',
  upAndDown    : 'oben und unten',

  // Color Words

  colors: [
  ]
};

var enUS = {
  // Axis Words

  blue         : 'blue',
  blueToYellow : 'blue to yellow',
  chroma       : 'chroma',
  green        : 'green',
  hue          : 'hue',
  lightness    : 'lightness',
  luminance    : 'luminance',
  luminosity   : 'luminosity',
  red          : 'red',
  redToGreen   : 'red to green',
  saturation   : 'saturation',
  value        : 'value',

  // Directions

  instruction  : 'two arrow-key based inputs and a text input',
  leftAndRight : 'left and right',
  prefix       : 'select color',
  upAndDown    : 'up and down',

  // Color Words

  colors: [
    [ '#000000', 'black' ],
    [ '#FF0000', 'red' ]
  ]
};

var enGB = Object.assign({}, enUS, {
  prefix: 'select colour',
  colors: enUS
    .colors
    .map(([ value, label ]) => [ value, label.replace(/\bgray\b/, 'grey') ])
});

var es = {
  // Axis Words

  blue         : 'azul',
  blueToYellow : 'azul a amarillo',
  chroma       : 'croma', // cromaticidad may be better, but both are used
  green        : 'verde',
  hue          : 'matiz',
  lightness    : 'brillo',
  luminance    : 'luminancia',
  luminosity   : 'luminosidad',
  red          : 'red',
  redToGreen   : 'roja a verde',
  saturation   : 'saturación',
  value        : 'valor',

  // Directions

  instruction  : 'dos entradas de teclas de flecha y una entrada de texto',
  leftAndRight : 'izquierda y derecha',
  prefix       : 'seleccionar el color',
  upAndDown    : 'arriba y abajo',

  // Color Words

  colors: [
  ]
};

var fr = {
  // Axis Words

  blue         : 'bleu',
  blueToYellow : 'bleu à jaune',
  chroma       : 'chroma',
  green        : 'vert',
  hue          : 'teinte',
  lightness    : 'clarté',
  luminance    : 'lumière',
  luminosity   : 'luminosité',
  red          : 'rouge',
  redToGreen   : 'rouge à vert',
  saturation   : 'saturation',
  value        : 'valeur',

  // Directions

  instruction  : 'deux entrées de touches fléchées et une entrée de texte',
  leftAndRight : 'gauche et droite',
  prefix       : 'choisissez la couleur',
  upAndDown    : 'haut et bas',

  // Color Words

  colors: [
  ]
};

var ja = {
  // Axis Words

  blue         : '青',
  blueToYellow : '青から黄色へ',
  chroma       : '彩度',
  green        : '緑',
  hue          : '色相',
  lightness    : '輝度',
  luminance    : '明度',
  luminosity   : '輝度',
  red          : '赤',
  redToGreen   : '赤から緑',
  saturation   : '飽和',
  value        : '値',

  // Directions

  instruction  : '2つの矢印キー入力とテキスト入力',
  leftAndRight : '左右',
  prefix       : '色を選択',
  upAndDown    : '上下',

  // Color Words

  colors: [
  ]
};

var pt = {
  // Axis Words

  blue         : 'azul',
  blueToYellow : 'azul para amarelo',
  chroma       : 'croma',
  green        : 'verde',
  hue          : 'matiz',
  lightness    : 'brilho',
  luminance    : 'luminância',
  luminosity   : 'brilho',
  red          : 'vermelho',
  redToGreen   : 'vermelho para verde',
  saturation   : 'saturação',
  value        : 'valor',

  // Directions

  instruction  : 'duas entradas de teclas de seta e uma entrada de texto',
  leftAndRight : 'esquerda e direita',
  prefix       : 'selecione a cor',
  upAndDown    : 'para cima e para baixo',

  // Color Words

  colors: [
  ]
};

var ru = {
  // Axis Words

  blue         : 'синий',
  blueToYellow : 'от синего до желтого',
  chroma       : 'цветность',
  green        : 'зелёный',
  hue          : 'тон',
  lightness    : 'светлота',
  luminance    : 'светлота',
  luminosity   : 'светлота',
  red          : 'красный',
  redToGreen   : 'от красного до зеленого',
  saturation   : 'насыщенный',
  value        : 'яркость',

  // Directions

  instruction  : 'два входа со стрелочной клавишей и ввод текста',
  leftAndRight : 'влево и вправо',
  prefix       : 'выбрать цвет',
  upAndDown    : 'вверх и вниз',

  // Color Words

  colors: []
};

var zh = {
  // Axis Words

  blue         : '蓝色',
  blueToYellow : '蓝色至黄色',
  chroma       : '色度',
  green        : '绿色',
  hue          : '色相',
  lightness    : '亮度',
  luminance    : '亮度',
  luminosity   : '亮度',
  red          : '红',
  redToGreen   : '红色到绿色',
  saturation   : '饱和度',
  value        : '明度',

  // Directions

  instruction  : '两个基于箭头键的输入和一个文本输入',
  leftAndRight : '左和右',
  prefix       : '选择颜色',
  upAndDown    : '上下',

  // Color Words

  colors: [
  ]
};

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
window.rgbToHexString = x => rgbToHexString(Array.from(x));

const STRING_KEYS = [
  'blue', 'blueToYellow', 'chroma', 'green', 'hue', 'instruction',
  'leftAndRight', 'lightness', 'luminance', 'luminosity', 'prefix', 'red',
  'redToGreen', 'saturation', 'upAndDown', 'value'
];

const registry = new Map([
  [ 'ar', ar ],
  [ 'de', de ],
  [ 'en-GB', enGB ],
  [ 'en-US', enUS ],
  [ 'es', es ],
  [ 'fr', fr ],
  [ 'ja', ja ],
  [ 'pt', pt ],
  [ 'ru', ru ],
  [ 'zh', zh ]
]);

const registerLanguage = (name, definition) => {
  [ name ] = Intl.getCanonicalLocales(name);

  const parent = registry.get(name.slice(0, 2)) || enUS;

  const entry = Object.assign({}, parent, definition);

  for (const stringKey of STRING_KEYS) {
    if (typeof entry[stringKey] !== 'string') {
      throw new TypeError(
        `Language definition property ${ stringKey } must have a string value`
      );
    }
  }

  if (!entry.colors || !entry.colors[Symbol.iterator]) {
    throw new TypeError(`Language definition property colors must be an array`);
  }

  const colors = Array.from(entry.colors);

  if (colors.some(pair => !Array.isArray(pair))) {
    throw new TypeError(`Language colors must be string pairs`);
  }

  if (colors.some(([ value ]) => !cssColorStringToRGB(value))) {
    throw new TypeError(`Language color values must be valid CSS`);
  }

  if (colors.some(([ , name ]) => typeof name !== 'string')) {
    throw new TypeError(`Language color names must be non-empty strings`);
  }

  if (new Set(colors.map(([ , name ]) => name)).size !== colors.length) {
    throw new TypeError(`Language color names must not be duplicated`);
  }

  entry.colors = colors.map(([ value, label ]) => [
    cssColorStringToRGB(value),
    label
  ]);

  registry.set(name, entry);
};

const getLanguage = () =>
  registry.get(navigator.languages.find(id => registry.has(id)) || 'en-US');

const CONTAINER_ID        = 'CI_CONTAINER';
const DESC_ID             = 'CI_DESC';
const GUTTER_ID           = 'CI_GUTTER';
const OUTER_ID            = 'CI_OUTER';
const TEXT_DATA_ID        = 'CI_TEXT_DATA';
const TEXT_INPUT_ID       = 'CI_TEXT_INPUT';
const TEXT_INPUT_LABEL_ID = 'CI_TEXT_INPUT_LABEL';
const TEXT_INPUT_ROW_ID   = 'CI_TEXT_INPUT_ROW';
const XY_CANVAS_ID        = 'CI_XY_CANVAS';
const XY_ALERT_ID         = 'CI_XY_ALERT';
const XY_ID               = 'CI_XY';
const XY_NUB_ID           = 'CI_XY_NUB';
const Z_CANVAS_ID         = 'CI_Z_CANVAS';
const Z_ID                = 'CI_Z';
const Z_NUB_ID            = 'CI_Z_NUB';

const DEFAULT_GUTTER_WIDTH          = '20px';
const DEFAULT_SLIDER_RADIUS         = '13px';
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
//
// The translateZ(0) hack is used on the canvases because of Chrome-level
// rendering bugs that appear on some computers when moving an element in front
// of a canvas. It’s unfortunate but I don’t think it’s avoidable.
//
// The outline properties are tricky. You’ll see -webkit-focus-ring-color in
// there, which naturally works only in webkit browsers, but since only webkit
// browsers currently support web components, for the moment this is alright.
// The trouble is that doing this:
//
//   outline: var(--color-input-z-focus-outline)
//
// when the var isn’t defined and no default value is supplied does not do the
// intuitive thing (i.e., nothing). Instead it clears the value entirely! I’m
// not sure if this is a bug or prescribed behavior. In addition, there’s no CSS
// value that can be set that _doesn’t_ change the value; "initial" actually
// switches it to a black outline, as do inherit and (unsurprisingly) unset.
// Therefore the act of trying to set the value always leads to a change in the
// value, and we need to set the browser default explicitly.
//
// In the future when firefox or edge support web components, we’ll likely need
// to make this a programmatically assigned style to get around these issues.

var template = Object.assign(document.createElement('template'), {
  innerHTML: `
    <style>
      :host {
        contain          : strict;
        display          : block;
        height           : 245px;
        width            : 275px;
      }

      #${ OUTER_ID } {
        display          : flex;
        flex-direction   : column;
        height           : 100%;
        outline-offset   : -5px; ${ '' /* will be truncated otherwise */ }
        width            : 100%;
      }

      #${ OUTER_ID }.dragging {
        cursor           : -webkit-grabbing;
        cursor           : grabbing;
      }

      #${ CONTAINER_ID } {
        box-sizing       : border-box;
        display          : flex;
        flex             : 1 0 0;
        left             : 0;
        overflow         : hidden;
        padding          : var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        );
        position         : relative;
        top              : 0;
        user-select      : none;
      }

      #${ GUTTER_ID } {
        flex             : 0 0 ${ DEFAULT_GUTTER_WIDTH };
      }

      #${ XY_CANVAS_ID },
      #${ Z_CANVAS_ID } {
        cursor           : pointer;
        height           : 100%;
        transform        : translateZ(0);
        width            : 100%;
      }

      .dragging #${ XY_CANVAS_ID },
      .dragging #${ Z_CANVAS_ID } {
        cursor           : -webkit-grabbing;
        cursor           : grabbing;
      }

      #${ XY_CANVAS_ID } {
        border           : var(--color-input-xy-border);
        border-radius    : var(--color-input-xy-border-radius);
      }

      #${ XY_CANVAS_ID }:focus {
        outline          : var(
          --color-input-xy-focus-outline,
          -webkit-focus-ring-color auto 5px
        );
        outline-offset   : var(--color-input-xy-focus-outline-offset, 0px);
      }

      #${ Z_CANVAS_ID } {
        border           : var(--color-input-z-border);
        border-radius    : var(--color-input-z-border-radius);
      }

      #${ Z_CANVAS_ID }:focus {
        outline          : var(
          --color-input-z-focus-outline,
          -webkit-focus-ring-color auto 5px
        );
        outline-offset   : var(--color-input-z-focus-outline-offset, 0px);
      }

      #${ XY_ID },
      #${ Z_ID } {
        align-items      : center;
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
        cursor           : -webkit-grab;
        cursor           : grab;
        height           : calc(2 * var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        ));
        margin-bottom    : calc(0px - var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        ));
        position         : absolute;
        transform        : scale(var(--color-input-slider-scale, 0.667));
        transform-origin : center;
        transition       : transform 80ms ease, border-color 100ms ease;
        width            : calc(2 * var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        ));
      }

      .dragging-xy #${ XY_NUB_ID },
      .dragging-z #${ Z_NUB_ID } {
        cursor           : -webkit-grabbing;
        cursor           : grabbing;
        transform        : none;
      }

      #${ XY_NUB_ID }.initial-movement,
      #${ Z_NUB_ID }.initial-movement {
        transition:
          background-color 80ms  ease,
          border-color     100ms ease,
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

      #${ Z_NUB_ID }.vertical {
        margin-left      : calc(0px - var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        ));
      }

      #${ TEXT_INPUT_LABEL_ID } {
        display: none;
      }

      #${ TEXT_INPUT_ROW_ID } {
        display: flex;
        margin           : var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        );
        margin-top       : calc(
          var(--color-input-gutter-width, ${ DEFAULT_GUTTER_WIDTH }) -
          var(--color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS })
        );
      }

      #${ TEXT_INPUT_ID } {

        /* Proxied vars where no default value works fine */
        border-color     : var(--color-input-field-border-color);
        border-radius    : var(--color-input-field-border-radius);
        height           : var(--color-input-field-height);
        letter-spacing   : var(--color-input-field-letter-spacing);
        text-align       : var(--color-input-field-text-align);
        text-shadow      : var(--color-input-field-text-shadow);

        ${ '' /*
          Proxied vars that need a default or else they behave like unset... it
          seems a bit arbitrary, is this not some sort of bug? As with outline
          above, we need to include the webkit defaults explicitly, which is
          okay as a stopgap, but presents a problem in the long term... */ }

        background       : var(--color-input-field-background, white);
        border-style     : var(--color-input-field-border-style, inset);
        border-width     : var(--color-input-field-border-width, 2px);
        color            : var(--color-input-field-color, initial);
        font             : var(--color-input-field-font, 11px system-ui);
        padding          : var(--color-input-field-padding, 1px);

        -webkit-appearance: var(
          --color-input-field-webkit-appearance, textfield
        );
      }

      #${ TEXT_INPUT_ID }:focus {
        outline          : var(
          --color-input-field-focus-outline,
          -webkit-focus-ring-color auto 5px
        );
        outline-offset   : var(--color-input-field-focus-outline-offset, 0px);
      }

      .dragging #${ TEXT_INPUT_ID } {
        cursor           : -webkit-grabbing;
        cursor           : grabbing;
      }

      .speech-only,
      #${ TEXT_INPUT_ROW_ID }.speech-only {
        clip-path: inset(100%);
        clip: rect(1px, 1px, 1px, 1px);
        display: inline-block;
        height: 1px;
        margin: 0;
        overflow: hidden;
        position: absolute;
        white-space: nowrap;
        width: 1px;
      }
    </style>

    <datalist id="${ TEXT_DATA_ID }">
    </datalist>

    <div
      aria-describedby="${ DESC_ID }"
      id="${ OUTER_ID }"
      tabindex="0">

      <div
        class="speech-only"
        id="${ DESC_ID }">
      </div>

      <div id="${ CONTAINER_ID }">

        <div id="${ XY_ID }">
          <canvas
            height="0"
            id="${ XY_CANVAS_ID }"
            tabindex="0"
            width="0">
          </canvas>
          <div id="${ XY_NUB_ID }"></div>
          <div
            class="speech-only"
            id="${ XY_ALERT_ID }">
          </div>
        </div>

        <div id="${ GUTTER_ID }"></div>

        <div id="${ Z_ID }">
          <canvas
            aria-orientation="vertical"
            role="slider"
            height="0"
            id="${ Z_CANVAS_ID }"
            tabindex="0"
            width="0">
          </canvas>
          <div id="${ Z_NUB_ID }"></div>
        </div>
      </div>

      <div id="${ TEXT_INPUT_ROW_ID }">
        <span
          aria-hidden="true"
          id="${ TEXT_INPUT_LABEL_ID }"
          role="presentation">
        </span>
        <input
          id="${ TEXT_INPUT_ID }"
          list="${ TEXT_DATA_ID }"
          type="text">
      </div>
    </div>
  `
});

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

var colorAccess = mode => {
  const [ x, y, z ] = mode.name;
  const [ [ xMin, xMax ], [ yMin, yMax ], [ zMin, zMax ] ] = mode.minMax;

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

const PRIVATE = new WeakMap();

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

// This is the entrypoint for ES and CJS. It causes no pollution of either the
// global scope or the global registry; rather, it exposes two named exports:
//
// ColorInputElement : the element constructor itself — which could be modified
//                     or subclassed for further customization
// register()        : a convenience function for adding the element to the
//                     registry. It permits overriding the name.

const register = (name='color-input') => {
  customElements.define(name, ColorInputElement);
};

// This is the entry point for the IIFE target, producing a result suitable for
// inclusion as a script rather than a module. Therefore it automatically
// registers the element under its default name.

register();

}());
