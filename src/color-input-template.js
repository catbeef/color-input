import CSS_COLORS from './css-colors';

export const CONTAINER_ID  = 'CI_CONTAINER';
export const GUTTER_ID     = 'CI_GUTTER';
export const OUTER_ID      = 'CI_OUTER';
export const TEXT_DATA_ID  = 'CI_TEXT_DATA';
export const TEXT_INPUT_ID = 'CI_TEXT_INPUT';
export const XY_CANVAS_ID  = 'CI_XY_CANVAS';
export const XY_ID         = 'CI_XY';
export const XY_NUB_ID     = 'CI_XY_NUB';
export const Z_CANVAS_ID   = 'CI_Z_CANVAS';
export const Z_ID          = 'CI_Z';
export const Z_NUB_ID      = 'CI_Z_NUB';

export const DEFAULT_GUTTER_WIDTH          = '20px';
export const DEFAULT_SLIDER_RADIUS         = '13px';
export const DEFAULT_Z_AXIS_WIDTH          = '35px';
export const INITIAL_NUB_MOVEMENT_DURATION = 120;

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

export default Object.assign(document.createElement('template'), {
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
        outline-offset   : -5px; /* will be truncated otherwise */
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

      #${ TEXT_INPUT_ID } {
        margin           : var(
          --color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS }
        );
        margin-top       : calc(
          var(--color-input-gutter-width, ${ DEFAULT_GUTTER_WIDTH }) -
          var(--color-input-slider-radius, ${ DEFAULT_SLIDER_RADIUS })
        );
        speak-as         : spell-out no-punctuation; /* not yet supported? */

        /* Proxied vars where no default value works fine */
        border-color     : var(--color-input-field-border-color);
        border-radius    : var(--color-input-field-border-radius);
        height           : var(--color-input-field-height);
        letter-spacing   : var(--color-input-field-letter-spacing);
        text-align       : var(--color-input-field-text-align);
        text-shadow      : var(--color-input-field-text-shadow);

        /* Proxied vars that need a default or else they behave like unset... */
        /* ...it seems a bit arbitrary, is this not some sort of bug?         */
        /* As with outline above, we need to include the webkit defaults      */
        /* explicitly, which is okay as a stopgap, but presents a problem in  */
        /* the long term...                                                   */

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
    </style>

    <datalist id="${ TEXT_DATA_ID }">
      ${ CSS_COLORS.map(name => `<option value="${ name }">`) }
    </datalist>

    <div
      id="${ OUTER_ID }"
      tabindex="0">

      <div
        aria-hidden="true"
        id="${ CONTAINER_ID }">

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

      <input
        id="${ TEXT_INPUT_ID }"
        list="${ TEXT_DATA_ID }"
        type="text">
    </div>
  `
});
