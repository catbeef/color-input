import { PRIVATE } from './color-input-element';
import { rgbToHexString } from './parse-color';

export default mode => {
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
