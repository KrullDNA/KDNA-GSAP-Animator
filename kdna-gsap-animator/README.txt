=== KDNA GSAP Animator ===
Author: Krull Design & Advertising
Version: 1.1.0
Requires: WordPress with Elementor (portfolio templates)
Companion to: KDNA Seamless Portfolio Scroll

WHAT IT DOES
Runs KDNA's scroll-driven portfolio animations on GSAP and ScrollTrigger, tuned
from one settings page. It is built to rebuild its animations when a new project
is injected into the page by the KDNA Seamless Portfolio Scroll, so every effect
fires on AJAX-loaded content as well as on first load.

The plugin animates Elementor containers that already carry the effect classes.
It adds no markup of its own and has no front-end widget.

THE THREE EFFECTS (added across the build stages)
1. Side-sliding rows   imgSliderLeft, imgSliderRight
2. Image enlarge       gridEnlarge, imgEnlarge, imgGrow1 to imgGrow7
3. Diagonal images     diagImgs, diag1 to diag4, diagGrow

WHERE IT RUNS
Single pages of the configured post types (default: portfolio), the same pages
the seamless scroll runs on. The engine then wires only elements that carry an
effect class, so it costs nothing on pages without one. Adjust the post types,
or force loading on or off, from the settings page and the filters below.

SETTINGS
Settings > KDNA GSAP Animator. Every value that shapes the effects is here:
smoothing, ease, the mobile breakpoint, and each effect's from and to, trigger
start and end, scale and offsets. The defaults match the agreed behaviour.

BUILD STATUS
Stage 1  Foundation and re-init engine     Done
Stage 2  Effect 1, side-sliding rows       Done
Stage 3  Effect 2, image enlarge           Not started
Stage 4  Effect 3, diagonal images         Not started
Stage 5  Mobile pass and QA                Not started

This release is Stage 2: it adds Effect 1, the side-sliding rows, on top of the
Stage 1 engine. imgSliderLeft drifts to -25% and imgSliderRight to +20% as the
page scrolls, scrubbed with one second of smoothing, not pinned, reversing on
the way back up. The from and to, trigger start and end, and ease all come from
the settings page. The effect registers on load and re-registers on each
injected project. On mobile the whole row is scaled to the device width, keeping
its desktop proportions, and clipped at the screen edges.

FILTERS (for the developer)
- kdna_gsap_post_types         (array of post types to load the engine on)
- kdna_gsap_should_enqueue     (bool, force the engine on or off for a request)
- kdna_gsap_content_selectors  (array of selectors for the content wrapper, used
                                to place the MutationObserver fallback)

INTEGRATION WITH THE SEAMLESS SCROLL
The engine listens for the kdna:content-added event the seamless scroll
dispatches after appending a project, and reads the new project from
event.detail.container. A MutationObserver is kept as a fallback for when that
event is not dispatched (the seamless scroll only fires it when its own re-init
setting is on). New content is wired in isolation, stale triggers are killed,
and a single ScrollTrigger.refresh() is run.

DEBUGGING
Add ?kdna_debug=1 to a portfolio URL, or tick Debug logging on the settings
page, to see detailed engine activity in the browser console (F12). The key init
and re-init lines are always logged so the engine can be confirmed.

BUNDLED LIBRARIES
GSAP 3.15.0 and ScrollTrigger 3.15.0, bundled locally under assets/js. Used
under the GreenSock standard no-charge licence (https://gsap.com/standard-license).

AFTER UPDATING
Run Elementor > Tools > Regenerate CSS & Data, and hard refresh (clear WP Rocket
cache) so the new assets are served.
