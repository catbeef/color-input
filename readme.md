>  _alpha version — still working on testing accessibility and adding form_
>  _related behaviors, etc_

# \<color-input>

A custom HTML element ("web component") like `<input type="color">` but with
additional features, configurability and styling options, including support for
HCL and other color space modes and text input of values other than hex
notation.

![example in "hlc" mode](example-hlc.png)

There is a [demo page](https://catbeef.github.io/color-input/example.html) — but
be aware this will currently only work in Chrome and Opera.

<!-- MarkdownTOC autolink=true bracket=round depth=3 -->

- [Caveats](#caveats)
  - [Support](#support)
    - [Supported](#supported)
    - [Unsupported](#unsupported)
  - [About Web Components and Forms](#about-web-components-and-forms)
  - [Performance](#performance)
- [Library Usage](#library-usage)
  - [ES Module](#es-module)
  - [Common JS Module](#common-js-module)
  - [Script](#script)
- [HTML Content Attributes](#html-content-attributes)
  - [The `mode` Attribute](#the-mode-attribute)
  - [The `clamp` Attribute](#the-clamp-attribute)
- [IDL Attributes](#idl-attributes)
  - [ColorInputElement.prototype.mode](#colorinputelementprototypemode)
  - [ColorInputElement.prototype.value](#colorinputelementprototypevalue)
  - [ColorInputElement.prototype.valueAsNumber](#colorinputelementprototypevalueasnumber)
  - [ColorInputElement.prototype.%%colorInterface%%](#colorinputelementprototype%25%25colorinterface%25%25)
    - [ColorInputElement.prototype.hcl](#colorinputelementprototypehcl)
    - [ColorInputElement.prototype.hsl](#colorinputelementprototypehsl)
    - [ColorInputElement.prototype.hsv](#colorinputelementprototypehsv)
    - [ColorInputElement.prototype.lab](#colorinputelementprototypelab)
    - [ColorInputElement.prototype.rgb](#colorinputelementprototypergb)
    - [ColorInputElement.registerLanguage\(langCode, definition\)](#colorinputelementregisterlanguagelangcode-definition)
- [Events](#events)
- [CSS Properties](#css-properties)
  - [`--color-input-field-position`](#--color-input-field-position)
  - [`--color-input-gutter-width`](#--color-input-gutter-width)
  - [`--color-input-high-res`](#--color-input-high-res)
  - [`--color-input-label-visibility`](#--color-input-label-visibility)
  - [`--color-input-slider-radius`](#--color-input-slider-radius)
  - [`--color-input-slider-scale`](#--color-input-slider-scale)
  - [`--color-input-x-axis-direction`](#--color-input-x-axis-direction)
  - [`--color-input-y-axis-direction`](#--color-input-y-axis-direction)
  - [`--color-input-z-axis-direction`](#--color-input-z-axis-direction)
  - [`--color-input-z-axis-position`](#--color-input-z-axis-position)
  - [`--color-input-z-axis-width`](#--color-input-z-axis-width)
  - [Additional CSS Properties](#additional-css-properties)
- [Accessibility](#accessibility)
  - [Input Labeling](#input-labeling)
  - [Keyboard Usage](#keyboard-usage)
  - [Text Input for Screen Readers](#text-input-for-screen-readers)
  - [Language](#language)
  - [Challenges](#challenges)
    - [Conflicts Between Different User Needs](#conflicts-between-different-user-needs)
- [ColorInputFormControlElement](#colorinputformcontrolelement)

<!-- /MarkdownTOC -->

## Caveats

### Support

This uses various DOM APIs that fall under the greater Web Component umbrella:
custom `HTMLElement` subclasses, shadow DOM, custom css properties, etc. It does
not include a polyfill or make use of a framework. Therefore it’s only suitable
for use in applications where you know these APIs are guaranteed to be
supported, which at the moment would typically mean Electron apps and Chrome
extensions, not general audience websites.

This project was mainly a way for me to familiarize myself with these upcoming
technologies and to find out what their limitations are, which is why not one
extra moment of my consideration went to the idea of agents lacking support for
some feature or another. So I don’t intend to adapt this to Polymer or any other
framework that kinda-sorta fakes web components for old browsers, but feel free
to fork it.

> *tl;dr:* for a regular website that needs to support older browsers you
> probably cannot use this until c. 2039 AD

#### Supported

- Chrome: of course
- Opera: hey now look at you dawg

#### Unsupported

At the time I write this, Firefox is actively developing support for custom
elements and the related web component APIs, so it will likely be added to the
previous list sooner than later, and I bet they’ll do a baller job.

Safari isn’t supported, but it does basically work there. You could probably
make it viable with a few CSS hacks; mainly what fails there is CSS containment.

Edge hasn’t signalled any development being underway on web components yet, and
it goes without saying that IE doesn’t support any aspect of HTML or Ecmascript
beyond `<div>`, maybe `<marquee>`, and throwing errors.

### About Web Components and Forms

At the moment Chrome’s support for custom elements is pretty great. I found that
I was able to implement an interface that was surpisingly close to that of a
"first class" native element. However there remain some areas of the spec that
are still being worked out. One of these trouble spots concerns elements that
should have the semantics of an `HTMLFormControl` — that is, elements which will
be "seen" by `HTMLFormElement`, `FormData`, etc.

These have in common the usage of an internal, non-ES-layer collection of the
"associated elements" of a form. One could implement support through monkey
patching certain classes and creative use of `Proxy` to some extent, but in
addition to being a bit impractical (there is really a lot of subtle stuff you’d
need to cover, including absurdities like `document.all`, if you really wanted
to be thorough), however you would still be locked out of at least one thing:
form submission (when not effected programmatically). Rather important!

While this element, like any input, can be used without a form, to support this
common need I’ve included a second element, `<color-input-form-control>`. The
reason I didn’t bake it in as an all-in-one is that I wanted to keep the core
element as "ideal" as possible; the helper element is, by necessity, a bit of a
hack and cannot properly leverage the shadow DOM for encapsulation. In the
future, when the API for declaring custom elements as form controls is defined
and implemented, I’ll be able to remove this helper.

### Performance

Computing HCL and LAB colors is a lot more expensive than computing RGB, HSL and
HSV. This only really matters when the user is dragging the z-slider, since that
implies continuous redraws of the x/y plane (in contrast, redrawing the z-axis
is always cheap, since we only need to calculate a single row of pixels). On a
fairly good comp at default sizes, the input has no trouble rendering HCL and
LAB at 60FPS (i.e., it takes less than 16ms), but at larger sizes, in high res
mode, or on a less powerful machine, the xy plane framerate may drop.

To address this in the future I might try to do a little WASMing — seems to fit
the spirit of this "latest DOM tech" exploration project — though I’m unsure if
it will actually lead to a significant difference.

## Library Usage

There are several artifacts to choose from. The first two options give you finer
control, but regardless of which you use, once the element is registered you can
use it like any other HTML element.

### ES Module

If importing the module from another ES module, the exports are
`ColorInputElement` (the element constructor itself) and `register`, a
convenience function that will register the custom element for you. The
`register` function takes, optionally, a name string, if you want to call it
something other than 'color-input'.

This is just `src/index.js`; it is listed in the `module` field in package.json
so tools like Rollup will pick it up automatically.

### Common JS Module

When using with `require()` and CJS modules, you’ll instead get
`dist/index.cjs.js`, which has the same exports but as CJS module properties.

### Script

You can also load `dist/index.iife.js` or `dist/index.iife.min.js` with a
script element. In this case, there’s nothing to export; registration will be
automatic.

## HTML Content Attributes

Most of the content attributes (aka html attributes) mirror those of `<input>`
where applicable:

- `disabled`
- `name`
- `readonly`
- `required`
- `value`
- ...plus any other generic attributes

Note that `value`, as with `<input>`, describes the initial or default value.
The `value` attribute’s value may be any color value as defined by the CSS spec,
provided the browser supports it.

The `readonly` and `disabled` attributes can both be used to prevent user input;
the distinction between these (and the effect of `required`) only becomes
meaningful when used within a form (or more subtly by their effect on tabindex).

In addition there is one unique attribute, `mode`.

### The `mode` Attribute

Like most color inputs, this one uses an XY plane to describe two dimenions of
the color space and a Z slider to describe the third dimension. The mode
attribute determines which color space model to use and which axis is which.

The core modes are HCL, HSL, HSV, LAB, and RGB. However we take the order of the
three key letters to map to X and Y (the plane) and Z (the slider). Thus if you
want RGB but with red vs blue for the plane and green as the slider, the mode
you’d specify would be "rbg".

There are a total of 30 possible mode values (case insensitive).

| Base Mode | Meaning                   | Permutations                         |
|-----------|---------------------------|--------------------------------------|
| HCL       | hue chroma luminance      | hcl hlc chl clh lhc lch              |
| HSL       | hue saturation luminosity | hsl hls shl slh lhs lsh              |
| HSV       | hue saturation value      | hsv hvs shv svh vhs vsh              |
| LAB       | lightness G-R B-Y         | lab lba alb abl bla bal              |
| RGB       | red green blue            | rgb rbg grb gbr brg bgr              |

The default mode is "hlc".

### The `clamp` Attribute

This attribute takes a boolean "true" or "false" value; the default is "true".

Unlike the others modes, LAB and HCL are not normally constrained to the same
set of colors as would be found in the RGB color space. For the purposes of an
HTML color picker that ultimately models hex values, they need to be. That is to
say, these color spaces can describe colors which are imaginary within the sRGB
colorspace, which presents a challenge when it comes to projecting them in a
context that’s limited to the sRGB color space.

There are two ways I know of to deal with that: you can clamp colors to the
nearest (sort of) non-imaginary color or you can simply blank them out. By
default, we clamp them, which in the general case presents the best user
experience; outside of fairly technical contexts, users are unlikely to find it
intuitive or useful that random-seeming chunks of a color-picker are just
"empty", and the clamped presentation still gets the core benefits of HCL in
terms of being more natural for human vision. However by setting `clamp` to
false, you can instead map imaginary colors to black.

## IDL Attributes

(So to speak; there is no real IDL here, but this is the term typically used to
refer to the ES APIs of HTML elements.)

### ColorInputElement.prototype.mode

This corresponds to the [`mode` content attribute](#the-mode-attribute) and is
settable.

### ColorInputElement.prototype.value

This has the same semantics as `HTMLInputElement.prototype.value`. It retrieves
the value if there is one (always as a 7-digit RGB hex) or returns an empty
string if there is not one; if the input isn’t dirty and there is a valid
`value` content attribute, it returns the RGB hex value of that default value.

When assigning to `value`, the input becomes dirty as if a user had interacted
with it. Setting to `undefined`, `null`, or an empty string is legal, unlike the
vendor `<input type="color">` element. If the value is not recognized as a color
(it can be any CSS color) it will not throw, but it will set the value to the
empty string.

Setting `value` programmatically will cause the "selection" to update, i.e. the
GUI will re-render and the selection nubs will move.

### ColorInputElement.prototype.valueAsNumber

As with `<input>` this accessor permits reading and writing the value as a
single number; though coercive, unlike `value` it will potentially throw a
`TypeError` or `RangeError`. When assigning, the value must be an integer in the
range `0x0` to `0xFFFFFF`.

For example:

    colorInputElement.value = 'green';
    colorInputElement.value;                      // "#008000"
    colorInputElement.valueAsNumber;              // 32768
    colorInputElement.valueAsNumber.toString(16); // "8000"
    colorInputElement.valueAsNumber = 16764125;
    colorInputElement.value;                      // "#FFCCDD"

### ColorInputElement.prototype.%%colorInterface%%

For each supported mode, there is a proxy object that exposes the component
parts as readable and assignable properties. It doesn’t matter which mode you’re
actually in; these are always available.

#### ColorInputElement.prototype.hcl

- `ColorInputElement.prototype.hcl.h`: 0 to 360 (hue\*)
- `ColorInputElement.prototype.hcl.c`: 0 to 134 (chroma)
- `ColorInputElement.prototype.hcl.l`: 0 to 100 (luminance)

#### ColorInputElement.prototype.hsl

- `ColorInputElement.prototype.hsl.h`: 0 to 360 (hue)
- `ColorInputElement.prototype.hsl.s`: 0 to 100 (saturation)
- `ColorInputElement.prototype.hsl.l`: 0 to 100 (luminosity)

#### ColorInputElement.prototype.hsv

- `ColorInputElement.prototype.hsv.h`: 0 to 360 (hue)
- `ColorInputElement.prototype.hsv.s`: 0 to 100 (saturation)
- `ColorInputElement.prototype.hsv.v`: 0 to 100 (value)

#### ColorInputElement.prototype.lab

- `ColorInputElement.prototype.lab.l`: 0 to 100 (lightness)
- `ColorInputElement.prototype.lab.a`: -110 to 110 (green-red)
- `ColorInputElement.prototype.lab.b`: -110 to 110 (blue-yellow)

#### ColorInputElement.prototype.rgb

- `ColorInputElement.prototype.rgb.r`: 0 to 255 (red)
- `ColorInputElement.prototype.rgb.g`: 0 to 255 (green)
- `ColorInputElement.prototype.rgb.b`: 0 to 255 (blue)

#### ColorInputElement.registerLanguage(langCode, definition)

It is possible to define languages for use with aria properties using this
static method. The `langCode` argument is a string like `en` or `en-GB`. If you
define a language with the suffix and one without the suffix already exists, it
will extend the unsuffixed version if any values are missing. Otherwise all of
the fields in `definition` must be defined.

See [Accessibility > Language](#language) for more info.

##### Language Definition: Axis Label Fields

These are the words or phrases corresponding to the axes of the various color
models. Note that while 'luminosity' is traditionally used for the 'L' of 'HSL',
it’s not considered particularly accurate; in general not all languages will
have distinct words for the meanings of 'L' in HCL, LAB, and HSL like English
does (unsurprising, since the distinctions are more technical than not).

- `lang.blue`
- `lang.blueToYellow`
- `lang.chroma`
- `lang.green`
- `lang.hue`
- `lang.lightness`
- `lang.luminance`
- `lang.luminosity`
- `lang.red`
- `lang.redToGreen`
- `lang.saturation`
- `lang.value`

##### Language Definition: Direction and Instructional Fields

For the XY plane, for which no corresponding aria role exists, we need to fill
the hole with instructions about keyboard input. Thus for HCL we would compose
this like "hue (left and right), chroma (up and down)".

- `lang.leftAndRight` ("left and right", in the sense of arrow keys)
- `lang.upAndDown` ("up and down", in the sense of arrow keys)

The 'prefix' is a default label to use if one was not expressly provided. It
will appear before the instructions for the individual input elements. The
'instruction' is the hairiest bit because it’s got more hefty grammar in it:
a higher level explanation of what the next three focusable elements are.

- `lang.instruction` ("two arrow-key based inputs and a text input")
- `lang.prefix` ("select color")

##### Language Definition: Autocomplete Colors for Text Input

Each language should include an array of colors in the form `[ value, label ]`.
This array is used to outfit the autocomplete choices for the text field; since
this is mainly to make color input less of a nuisance for screen reader users,
the intention is that the lists be small and should favor simple, common color
names that would be readily discovered by autocomplete. The value string can be
in any color notation. The set of colors is open-ended because what constitutes
"basic colors" varies by language.

The text input also supports arbitrary hex, `rgb()`, etc strings.

- `lang.colors` (`[ [ '#000000', 'black' ], ... ]`)

> \* Note that the 'hue' of HCL is not equivalent to the 'hue' of HSL and HSV.

## Events

Only one event is fired, 'change', when the value changes. You can access the
new value as `event.target.value`.

## CSS Properties

There are a number of CSS properties that allow you to customize the
presentation of the element. Some simply proxy familiar properties down to
elements in the shadow DOM while others have original semantics.

Naturally the element itself can be styled (width, height, etc) like any other.
The default height and width values are 245px and 275px. This is inclusive of
the interior padding which derives from the slider radius, because the slider
requires room around the edges of the panel. When this padding is factored in,
the aggregate effect with all defaults is a 200×200 xy plane and a 25×200
z-axis.

### `--color-input-field-position`

This can be `top`, `bottom` (default) or `none`. It determines the position of
the text-based input. If `none`, the text input is not visible, but it will
remain available for screenreaders.

### `--color-input-gutter-width`

This sets the thickness of the gutter between the XY plane and the Z slider, if
any. By default this is 20px. Any size (px, em, percentage, etc) is fine, but
keep in mind accounting for the sliders.

### `--color-input-high-res`

There are three possible values, `true`, `false` and `auto`. In `auto`
mode, the resolution of the output is determined by the device pixel ratio of
the client.

The default is `false` (not `auto`) because in general you’re not very likely to
want this on. The reason is that most of the visuals are smooth gradations of
color anyway, so the extra resolution does not contribute much at all to how the
output looks. Meanwhile the cost of high res is quite high, since it multiplies
the number of pixel values to calculate by four. That cost is more likely to
become noticeable during dragging in HCL and LAB modes, which are more
computationally expensive. However, when `clamp` is set to false in HCL or LAB,
you may want to also set resolution to auto, because the edges of the color
space may otherwise appear jagged.

I would not recommend enabling this unless the color input is at the default
size or smaller.

### `--color-input-label-visibility`

The possible values are `visible` and `none` (default). This determines whether
the label appears beside the text input visually, and therefore only has an
effect if `--color-input-field-position` is not `none`. The label in question is
that provided through `aria-label`; for more details on issues that come up with
labeling in custom elements, see [input labelling](#input-labeling), but the
tldr is that only `aria-label` is respected, so I’ve allowed it to be
potentially visible as well.

### `--color-input-slider-radius`

This value determines the max size of the sliders — and consequently it also
determines how much padding lives around the color panels. It defaults to 13px.

### `--color-input-slider-scale`

This value must be a floating point number (and should probably be between 0 and
1). When in a neutral state, the slider nubs will be scaled by this factor; the
full radius is only used when the user is actively dragging. You can disable
that effect by setting this value to `1`. The default is `0.667`.

### `--color-input-x-axis-direction`
### `--color-input-y-axis-direction`
### `--color-input-z-axis-direction`

Each of these may be "ascending" (default) or "descending". Ascending means the
value increases as it moves from left to right or from bottom to top.

### `--color-input-z-axis-position`

Valid values are "start", "end", "left", "right", "top" or "bottom". The default
is "end".

The "start" and "end" values indicate a horizontal orientation where the z-axis
is vertical, like "left" and "right"; however, unlike "left" and "right" it is
sensitive to text direction. For example "end" behaves like "right" in a Latin
document and "left" in an Arabic document.

### `--color-input-z-axis-width`

Like `--color-input-gutter-width`, this can be any length value. It describes
the thickness of the z-axis (regardless of whether the slider is horizontal or
vertical) relative to the total area, and therefore by extension it also
influences the size of the xy plane. By default it’s 35px. Note that the gutter,
if present, "cuts into" both the plane and the slider; thus a
`--color-input-z-axis-width` of 50%, if there is a 10px gutter, means the actual
area given to the z-axis would end up being 50% less 5px, such that the plane
and slider would end up equal in size as one would expect for such a value.

### Additional CSS Properties

There are quite a few additional properties available for more granular styling.
This is a best-effort at enabling high customization within the constraints of
a shadow-dom custom element. Currently the spec has a bit of a hole: there’s no
mechanism for exposing specific children for external styling via custom pseudo
elements or pseudo classes. In many cases, custom CSS properties fulfill the
need for internal styling quite well (and in certain ways a more powerful tool).
However as you’ll see below it gets silly when you want to just let people
outright customize, since it’s not practical or realistic to proxy the hundreds
of possible properties that might apply to a given descendent.

There are additional issues. To the extent that they can be inherited
vertically and have selector specificity, custom properties do cascade as usual; 
however, there’s no mechanism to support interrelated CSS properties where a
compound/shorthand property might be partially superceded by a subsequent, more
specific property. For example we can support 'background' or 'background-color'
but not both, because we cannot introspect which should have higher precedence
if both are defined. To deal with this (and to help keep the number of
properties sort of almost reasonable) I’ve preferred the compound versions.
Another issue is pseudoclass states — you’ll see we need to use properties like
`foo-focus-outline` to support `:focus`.

- `--color-input-xy-border`
- `--color-input-xy-border-radius`
- `--color-input-z-border`
- `--color-input-z-border-radius`

The above four properties apply to the xy panel and z slider elements. They
accept the same values as you’d give to `border` etc.

- `--color-input-field-background`
- `--color-input-field-border-color`
- `--color-input-field-border-radius`
- `--color-input-field-border-style`
- `--color-input-field-border-width`
- `--color-input-field-color`
- `--color-input-field-font`
- `--color-input-field-height`
- `--color-input-field-letter-spacing`
- `--color-input-field-padding`
- `--color-input-field-text-align`
- `--color-input-field-text-shadow`
- `--color-input-field-webkit-appearance`

Likewise these can be used to style the text input, if it’s visible. It’s a bit
difficult to determine which properties to proxy for this case; there’s an
enormous number that could potentially be useful, but it’d feel silly to try to
get them all. I think this covers the majority of styling needs, at least. For a
more customized text input than the above allows, for example if you’re using
Material Design or another library that does lots of crazy stuff to inputs, you
can set `--color-input-field-position` to `none` and supply a replacement input
yourself and sync it on change (but if you do, set it to `aria-hidden`, because
it will be redundant for screen readers).

- `--color-input-field-focus-outline-offset`
- `--color-input-field-focus-outline`
- `--color-input-xy-focus-outline-offset`
- `--color-input-xy-focus-outline`
- `--color-input-z-focus-outline-offset`
- `--color-input-z-focus-outline`

These six properties are specific to the `:focus` states of the three elements.

## Accessibility

Making a complex color input accessible by keyboard is easy, but making it
accessible to screen readers is pretty tough — especially with custom elements.

The color input itself is focusable, and its shadow contains three focusable
descendents:

- the xy plane
- the z axis slider
- a conventional text input

### Input Labeling

A current limitation of custom elements (which perhaps will be addressed once
elements can be declared as form elements) is that they can’t support either of
these forms of labelling normally:

    <label>Foo <color-input></color-input></label>
    <label for="foo">Foo</label> <color-input id="foo"></color-input>

However `aria-label` will work correctly. In addition, though it’s a bit of a
semantic stretch, you can make the `aria-label` into a visible element (which
will appear beside the text input) using the css
`--color-input-label-visibility: visible`.

### Keyboard Usage

For users who cannot use a mouse (or any users who want a bit of finer control),
when the first two members are focused, the keyboard arrow keys nudge the value
in the appropriate direction. If the shift key is depressed, the nudge interval
will be larger.

### Text Input for Screen Readers

The text input, which is always available to screen readers even if not visually
displayed (configurable through CSS), supports any CSS color notation but also a
list of simple color names, which will be available as autocomplete options. My
hope was that this might make it a better experience for screen reader users
than having to enter hex notation. More on this stuff follows.

### Language

Since the screen reader solution requires (generated) interior labelling and
messaging, there needed to be a mechanism for using the correct language for a
given document / user. Included are Arabic, German, English, Spanish, French,
Japanese, Portuguese, Russian and Chinese — nine of the ten most common
languages on the Internet (Malay proved too challenging for me). The word lists
are simple, mostly just single noun labels like "lightness"; there’s very little
grammar so this wasn’t as hard as it might have been, but I still likely
butchered some stuff.

The language preferred will be that of the _agent_ (typically the user’s system
language) not that of the document or element context.

See [ColorInputElement.registerLanguage](#colorinputelementregisterlanguagelangcode-definition)
for information about defining additional languages.

### Challenges

I want to document some of the challenges I encountered in case it is useful to
other people, or in case somebody who reads this knows a better way to handle
some of this stuff.

We can say there are three potential usage patterns: visual with mouse, visual
with arrow keys, and text input. A motor-impaired user might be restricted to
the latter two and a visually impaired user might best be served if presented
with only the third.

The last of these may be disabled visually, but will continue to be available to
screen readers. The first two support interaction via mouse or keyboard.

#### Conflicts Between Different User Needs

When I went down the accessibility rabbit hole, once I started mucking about
with real screen readers it became evident that I needed to provide internal
labeling for the xy & z inputs. My earlier plan had been to just make them
`aria-hidden` and expose only the text input to screen readers, since it seems
reasonable to say that most users of screen readers probably don’t want to muck
about with stuff like "chroma sliders". But what I learned is that neither
`aria-hidden` nor `role: presentation` will be respected if an element is
focusable. That is, they don’t actually cause subtrees to be removed from the
access tree, so the elements remain navigable.

There’s a fair amount of discussion about this online and while the current
behavior seems unfortunate to me, it’s understandably a complex issue to solve,
because tab order and focus happens in the DOM, not in the assistive tech; even
if the assistive tech took over tab order, there remains the weird hole that if
a user did use the mouse to select such an element, we’re now in some super
weird state where an element that "doesn’t exist" has focus.

So what happens if you just let it be? When you tab through, a screen reader
will announce that they are "blank":

| Tab             | Screen reader sez...       |
|-----------------|----------------------------|
| _initial focus_ | "Select color"             |
| _tab 1_         | "blank"                    |
| _tab 2_         | "blank"                    |
| _tab 3_         | "Select color: text input" |

To me that felt like a shitty experience. If I could use `tabindex="-1"` for the
first two components, it could be avoided — but that isn’t an option because it
would be no good for people with motor disabilities, who should be able to reach
the plane/slider without clicking. Gah! The more I looked at this stuff the more
I realized how weird it is that we have no way to address distinctions between
user needs like this, but again, I guess it’s a pretty complex problem.

So I figured I needed to bite the bullet and label the xy & z components. Both
were already keyboard accessible, so even if these input options are of
questionable value to the average screen reader user, ultimately it came down to
adding appropriate labelling and messaging. The z slider has the advantage of
already having a suitable aria role, so the messaging is partly taken care of
for us just by using the right aria attributes, but there is no role appropriate
for a continuous plane, meaning we need to hand-roll the messaging.

And then ... well, that’s when it really became a rabbit hole. Generating labels
and messaging for these controls means we’re now in the realm of human language.
As it turns out, there’s more than one of those. I ended up baking in nine
common languages (the text corpus is small, so this seemed reasonable) and
providing an interface for defining others.

## ColorInputFormControlElement

This helper element (explained a bit [above](#about-web-components-and-forms))
can be used to make a ColorInput behave like a form component. The actual
element should be its child:

    <form>
      <color-input-form-control>
        <color-input name="foo"></color-input>
      </color-input-form-control>
    </form>

In order to achieve this behavior, this element needs to place a regular vendor
`<input>` element (hidden) in the light DOM, so it’s not properly encapsulated
or protected from global CSS. It will manage sync between the ColorInputElement
and the hidden HTMLInputElement, which is what the form itself will then pick up
on.
