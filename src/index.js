// This is the entrypoint for ES and CJS. It causes no pollution of either the
// global scope or the global registry; rather, it exposes two named exports:
//
// ColorInput : the element constructor itself — which could be modified or
//              subclassed for further customization
// register() : a convenience function for adding the element to the registry.
//              It permits overriding the name.

import ColorInputElement from './color-input-element';

const register = (name='color-input') => {
  customElements.define(name, ColorInputElement);
};

export { ColorInputElement, register };
