// This is the entry point for the IIFE target, producing a result suitable for
// inclusion as a script rather than a module. Therefore it automatically
// registers the element under its default name.

import { register } from './index';

register();
