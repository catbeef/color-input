import ar   from './languages/ar';
import de   from './languages/de';
import enGB from './languages/en-GB';
import enUS from './languages/en-US';
import es   from './languages/es';
import fr   from './languages/fr';
import ja   from './languages/ja';
import pt   from './languages/pt';
import ru   from './languages/ru';
import zh   from './languages/zh';

import { cssColorStringToRGB } from './parse-color';

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

export const registerLanguage = (name, definition) => {
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

export const getLanguage = () =>
  registry.get(navigator.languages.find(id => registry.has(id)) || 'en-US');
