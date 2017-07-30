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

export const cssColorStringToRGB = str => {
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

export const rgbToHexString = rgb =>
  `#${ rgb.map(rgbValueToHexComponent).join('') }`;
