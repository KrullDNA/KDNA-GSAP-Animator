=== KDNA GSAP Animator ===
Author: Krull Design & Advertising
Version: 1.5.10
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
   Two full-width rows drift sideways in opposite directions as the page scrolls.
   Scrubbed, not pinned, reversing on the way back up.
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

Creating an injected pinned effect makes GSAP lay out a pin spacer and run its
own global refresh, which re-syncs every scrubbed effect to the scrollbar in one
step. If that happens while a side-sliding row is still gliding after the scroll,
the row is seen to jump at the end of its glide. So the engine holds the wiring
of injected content until the scroll has settled, which means the glide has
actually finished (the scrub keeps moving for its smoothing length after the last
scroll, so it waits that long plus a margin). At rest each scrub already sits on
its scroll-mapped position, so the unavoidable refresh moves nothing on screen.
Before the first scroll the build is immediate.

The seamless scroll injects each project's scoped stylesheet just after it hands
over the content, so the pin heights and the diagonal feature's centring are
first measured against a layout that then reflows. To stay correct without a
global refresh, the engine re-measures only the new project's own triggers as its
images load and again shortly after, so the new effect settles onto the final
layout while the existing rows are left untouched.

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
Two common environment problems are handled automatically:
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

DIAGONAL FEATURE STRAIGHTENING
The diagonal angle is normally set on a parent of the feature image, so the
feature is straightened by countering that parent angle (Settings > Effect 3 >
Straighten the feature, on by default), not by zeroing its own rotation.

DIAGONAL FEATURE CENTRING
The feature is centred in the viewport by measuring its position and translating
it to the middle, accounting for any rotation or scale on its ancestors. If the
feature image sits inside one of the drifting columns, it is also carried by that
column's travel, so the centring cancels that column drift as well. To check the
result, scroll so the feature is fully popped and run kdnaGsap.diagnose(): the
".diagGrow ... OFFSET x=.. y=.." line is how far the feature centre is from the
viewport centre (0,0 is perfectly centred), and the next line reports whether the
feature rides inside a drifting column.

NO SMOOTHING GLIDE
The effects are tied directly to the scroll position (ScrollTrigger scrub: true),
so every effect stops the instant the scroll stops. There is no smoothing glide
and no Smoothing setting. Note that a trackpad or smooth mouse wheel keeps the
browser's own scroll position moving briefly after your fingers stop, and the
effects follow the scrollbar, so that small continued motion is the operating
system, not the plugin.

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
