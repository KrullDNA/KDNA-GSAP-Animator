=== KDNA GSAP Animator ===
Author: Krull Design & Advertising
Version: 1.5.20
Requires: WordPress with Elementor (portfolio templates)
Companion to: KDNA Seamless Portfolio Scroll

WHAT IT DOES
Runs KDNA's three scroll-driven portfolio animations on GSAP and ScrollTrigger,
tuned from one settings page. It is built to rebuild its animations when a new
project is injected into the page by the KDNA Seamless Portfolio Scroll, so every
effect fires on AJAX-loaded content as well as on first load. It animates
Elementor containers that already carry the effect classes; it adds no markup of
its own and has no front-end widget.

THE THREE EFFECTS
1. Side-sliding rows  imgSliderLeft, imgSliderRight
   Two full-width rows drift sideways in opposite directions as the page scrolls,
   not pinned, reversing on the way back up. The rows are driven directly from
   their live on-screen position, so they track the scrollbar one to one and
   cannot jerk when the page recalculates (see SIDE-SLIDING ROWS below).
2. Image enlarge      gridEnlarge, imgEnlarge, imgGrow1 to imgGrow7
   Pins the grid. The centre image grows to fill the screen while the outer
   images scale up and fly outward off the screen together.
3. Diagonal images    diagImgs, diag1 to diag4, diagGrow
   Pins the section. The columns drift vertically in alternation, then the
   feature image pops out, rotates to horizontal and scales to fill the screen.

WHERE IT RUNS
Single pages of the configured post types (default: portfolio), the same pages
the seamless scroll runs on. The engine then wires only elements that carry an
effect class, so it costs nothing on pages without one.

SETTINGS
Settings > KDNA GSAP Animator. Every value that shapes the effects is here:
smoothing, ease, the mobile breakpoint and reference width, and each effect's
from and to, trigger start and end, scale, travel and offsets. The defaults match
the agreed behaviour, so it works out of the box. After saving, run Elementor >
Tools > Regenerate CSS & Data and clear your page cache.

MOBILE
At the phone breakpoint (tablet behaves as desktop) the whole composition keeps
its desktop proportions and is scaled to the device width, with no responsive
reflow, and the motion is clipped to its box. The non-pinned rows use a transform
scale (see Desktop reference width); the pinned effects compute their fills to the
device width and clip in their box, because a transform-scaled ancestor would
break ScrollTrigger pinning. The result is consistent across the three.

INTEGRATION WITH THE SEAMLESS SCROLL
The engine listens for the kdna:content-added event the seamless scroll
dispatches after appending a project, and reads the new project from
event.detail.container. A MutationObserver is kept as a fallback for when that
event is not dispatched. New content is wired in isolation, stale triggers are
killed, pins are rebuilt cleanly (never duplicated), and only the new triggers
are refreshed (existing animations are never snapped).

Injected content is wired in two waits, so it is measured against the final
layout and nothing on screen jumps. First the engine waits for the scroll to
settle (the page is at rest, so the unavoidable refresh GSAP runs when it lays
out a new pin spacer moves nothing). Then it waits for the injected panel itself
to stop resizing, because the seamless scroll injects each project's stylesheet
(its 160vh hero, its images and so on) just after it hands over the content, so
the panel reflows immediately after. Only once the panel has settled does the
engine build, so the pin heights and the diagonal feature's centring are measured
once, correctly, and the section does not jump when it is reached. The settle is
detected with a ResizeObserver (with a safety timeout); before the first scroll,
and where no ResizeObserver exists, the build is immediate.

FILTERS (for the developer)
- kdna_gsap_post_types         (array of post types to load the engine on)
- kdna_gsap_should_enqueue     (bool, force the engine on or off for a request)
- kdna_gsap_content_selectors  (array of selectors for the content wrapper, used
                                to place the MutationObserver fallback)

DEBUGGING
Add ?kdna_debug=1 to a portfolio URL, or tick Debug logging on the settings page,
for detailed engine activity in the browser console. The key init and re-init
lines are always logged so the engine can be confirmed.

TROUBLESHOOTING THE PINNED EFFECTS
Three common environment problems are handled automatically:
- A CSS transition on the pinned element (a theme/Elementor hover transition,
  transition:all, an entrance transition) makes ScrollTrigger's pin writes animate
  instead of applying at once, so the section lags the scroll and eases back when
  you stop (transform pinning) or flashes at the ends (fixed pinning). The engine
  forces transitions off on the pinned element while it is wired and restores them
  on teardown. With ?kdna_debug=1 it logs the transition it found and froze.
- scroll-behavior: smooth in the page CSS makes the browser animate scroll, which
  fights scrubbing and flashes the pins. This stylesheet forces scroll-behavior
  to auto on the pages the effects run on.
- A second copy of GSAP on the page (for example from MotionPage) would split the
  pins from the engine's refresh/teardown. The engine detects this and uses the
  ScrollTrigger registered with the GSAP it builds with. Still, if you no longer
  use MotionPage, disable it: two animation engines on one page is asking for
  trouble (and turn off Re-run MotionPage in the seamless scroll settings).

If a pinned effect still jumps, disappears or "scrolls from the top" at the ends
of its pin, an ancestor element (a theme or Elementor wrapper) has a CSS
transform, filter or perspective, which makes the browser resolve the pin's
position:fixed against the ancestor instead of the viewport. With ?kdna_debug=1
the console prints a "Pin diagnostic" line naming the offending ancestor.

For a full picture, scroll to the pinned section and run kdnaGsap.diagnose() in
the browser console: it prints the chosen pin type, the ancestor chain with any
transforms, and (for the diagonal) the feature's ancestor matrix and computed
centring.

Fixes, in order, from Settings > KDNA GSAP Animator > Pinned effects:
1. Pin type: set it to Transform. Auto detects a transformed ancestor at load and
   switches automatically, but Elementor Motion Effects apply their transform
   only once scrolling starts, so Auto can miss them; forcing Transform is immune
   either way.
2. Reparent pins: a last resort that moves the section to the body while pinned.
3. Best of all, remove the transform from the offending ancestor, for example by
   turning off Motion Effects / Scrolling Effects on that section and its parents
   in Elementor.

EFFECT 4, VERTICAL-SCROLL PARALLAX (kdnaParallax)
A pin-safe stand-in for Elementor's Vertical Scroll motion effect. Elementor's
own version applies a transform that fights ScrollTrigger pinning (the pinned
section jumps with fixed pinning and drifts with transform pinning, because a pin
and a parallax on the same element cannot both win). So: turn Elementor's
Scrolling Effects OFF on that element, then add the class kdnaParallax to the
widget you want to drift. The engine animates it with its own scrubbed timeline,
at rest when the element is centred in the viewport, so there is no entry jump.
Direction and speed come from Settings > Effect 4 (default Up, speed 4, the same
scale as Elementor), and can be overridden per element with the attributes
data-kdna-parallax-direction ("up" or "down") and data-kdna-parallax-speed.
Important: never put kdnaParallax on a pinned section (gridEnlarge or diagImgs) or
on anything that contains one; the engine detects this and skips it (with a
console note) so a stray class can never re-break the pins.

DIAGONAL FEATURE POP-OUT
The feature image animates from its resting place to a popped end state given as
plain, tunable values, the same way it was dialled in and approved in MotionPage:
a translate as a per cent of its own size (Settings > Effect 3 > Feature pop
position X / Y, defaults 44 and 179), a scale (Feature scale, default 3) and a
rotation to straighten it from the diagonal (Feature rotation, default 30). There
is no measurement or matrix maths, so the result is predictable and easy to tune.
With ?kdna_debug=1 the console prints the feature's live position as it pops, so
the values can be adjusted by eye against the viewport.

SIDE-SLIDING ROWS (imgSliderLeft, imgSliderRight)
Rebuilt so the rows can never jerk. Earlier versions drove each row with a
scrubbed timeline: ScrollTrigger cached the row's start and end scroll positions
and mapped them to a sideways offset. The catch is that anything which recalcs
those cached positions, above all the global refresh GSAP runs whenever the
seamless scroll injects a project (a new pin spacer changes the page height) or
when the window resizes, re-maps the row in one step and the scrubbed value jumps
to the new mapping. That was the "jerk at the end" the rows kept showing whatever
the smoothing was set to: the jerk was never the smoothing, it was the re-map. Now
a ScrollTrigger still drives each row, but the offset is computed fresh from the
row's live on-screen position on every update and written straight away. Nothing
is cached, so a refresh can only ever recompute the same offset for the same
on-screen position: it cannot snap the row. There is no scrub tween either, so the
motion is one to one with the scrollbar and stops the instant the scroll stops,
with no glide. The rows do not use the Smoothing setting.

SMOOTHING
Settings > Smoothing is the scrub smoothing in seconds, and it applies to the
PINNED effects (image enlarge and diagonal images). A small value (default 0.3)
interpolates between the browser's discrete scroll events, which removes the
stepping/jerkiness on those effects, whose heavy scale/transform motion otherwise
jumps between scroll steps. It is a fraction of a second, not the old one-second
glide. Set it to 0 for a fully direct, one-to-one link to the scrollbar, which is
crisp but can look stepped on a coarse mouse wheel. The side-sliding rows do not
use it (see SIDE-SLIDING ROWS above): they are already one to one with the
scrollbar and need no smoothing. After changing it, clear the page cache.

CACHING
The engine's settings are printed inline in each page, so a page cache (for
example WP Rocket) keeps serving the old values until it is cleared. After
changing any setting, clear the page cache, then load a page with ?kdna_debug=1
to confirm the change is live.

TESTING CHECKLIST (per the brief)
[ ] Plugin activates with no errors.
[ ] Each effect animates correctly on a normal page load.
[ ] Each effect re-fires correctly after a project loads in via the seamless
    scroll, on every injected project.
[ ] Scrolling back up reverses the motion smoothly.
[ ] Pinned effects pin and unpin cleanly, with no jump or duplicate spacer.
[ ] Mobile: the whole animation is scaled to the device width and clips
    correctly, with no responsive reflow.
[ ] Resize the window: the effects recompute without breaking.
[ ] No JavaScript console errors and no PHP notices.
After each update, run Elementor > Tools > Regenerate CSS & Data and hard refresh.

BUNDLED LIBRARIES
GSAP 3.15.0 and ScrollTrigger 3.15.0, bundled locally under assets/js. Used under
the GreenSock standard no-charge licence (https://gsap.com/standard-license).

BUILD STATUS
Stage 1  Foundation and re-init engine     Done
Stage 2  Effect 1, side-sliding rows       Done
Stage 3  Effect 2, image enlarge           Done
Stage 4  Effect 3, diagonal images         Done
Stage 5  Mobile pass, polish and QA        Done
