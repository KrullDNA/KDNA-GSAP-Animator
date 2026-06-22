/**
 * KDNA GSAP Animator, the engine.
 *
 * The shared re-init engine plus all three effects: Effect 1 (side-sliding
 * rows), Effect 2 (image enlarge) and Effect 3 (diagonal images). The engine
 * handles the life cycle: register effects on first load, re-register them on
 * content the seamless scroll injects, tear down stale triggers when content
 * leaves, and recompute on resize. Effects plug in via registerEffect().
 *
 * Mobile (all effects, at the phone breakpoint; tablet behaves as desktop): the
 * composition keeps its desktop proportions and is scaled to the device width
 * with no responsive reflow, and motion is clipped to its box. The non-pinned
 * rows use a transform scale wrapper; the pinned effects compute their fills to
 * the device width and clip in their box, because a transform-scaled ancestor
 * would break ScrollTrigger pinning. The result is consistent across the three.
 *
 * The single most important requirement of the whole plugin lives here: the
 * animations must rebuild themselves when a new project is appended by the
 * KDNA Seamless Portfolio Scroll. We listen for its kdna:content-added event and
 * keep a MutationObserver as a fallback, because that event is only dispatched
 * when the seamless scroll has its own re-init setting switched on.
 */
(function (window, document) {
	'use strict';

	var cfg      = window.KDNA_GSAP || {};
	var settings = cfg.settings || {};
	var DEBUG    = !!cfg.debug || /[?&]kdna_debug=1/.test(window.location.search);

	// Verbose logger, only speaks in debug mode.
	function log() {
		if (DEBUG && window.console) {
			console.log.apply(console, ['[KDNA GSAP]'].concat([].slice.call(arguments)));
		}
	}

	// Life cycle confirmation, always printed so the engine can be verified on
	// staging without turning debug on. These lines are infrequent (once on load,
	// once per injected project), so they keep the console clean.
	function note() {
		if (window.console) {
			console.log.apply(console, ['[KDNA GSAP]'].concat([].slice.call(arguments)));
		}
	}

	var gsap          = window.gsap;
	var ScrollTrigger = window.ScrollTrigger;

	if (!gsap || !ScrollTrigger) {
		note('GSAP or ScrollTrigger did not load, the engine cannot start.');
		return;
	}

	gsap.registerPlugin(ScrollTrigger);

	// More than one copy of GSAP/ScrollTrigger can be on a page (a smooth-scroll
	// widget, MotionPage, another plugin). GSAP builds a timeline's ScrollTrigger
	// with one copy while window.ScrollTrigger can point at another, so getAll,
	// refresh and teardown would act on an empty copy and the pins would never be
	// managed (the "Active ScrollTriggers: 0" symptom). We lock onto the real copy
	// by reading it off the first live effect trigger, in resolveScrollTrigger().
	var multipleGsap = false;

	// Quieten missing-target warnings (an element can leave the page mid-scroll on
	// a seamless page).
	gsap.config({ nullTargetWarn: false });

	// --- Shared defaults ---------------------------------------------------

	// The values every effect inherits unless it overrides them. The motion is tied
	// directly to the scrollbar (scrub: true) with no smoothing glide, so every
	// effect stops the instant the scroll stops. There is deliberately no scrub
	// time here.
	var defaults = {
		ease: settings.ease || 'sine.inOut',
		mobileBreakpoint: settings.mobileBreakpoint || 767
	};

	function isMobile() {
		return window.matchMedia('(max-width: ' + defaults.mobileBreakpoint + 'px)').matches;
	}

	// --- Mobile scale-to-width ---------------------------------------------

	// Keep the element at a desktop reference width and scale the whole thing down
	// to the device width, so it plays identically, just smaller, with no
	// responsive reflow. A wrapper clips the overflow at the screen edges and
	// holds the scaled height so the content below is not pushed down. The scale
	// is applied through GSAP so it composes with the effect's own transforms
	// rather than fighting them. Set the reference width to 0 to switch it off.
	function createScaler(el) {
		var refWidth = (typeof settings.mobileReferenceWidth === 'number') ? settings.mobileReferenceWidth : 1280;
		var wrapper  = null;

		function ensureWrapper() {
			if (wrapper || !el.parentNode) {
				return wrapper;
			}
			wrapper = document.createElement('div');
			wrapper.className = 'kdna-gsap-scalefit';
			el.parentNode.insertBefore(wrapper, el);
			wrapper.appendChild(el);
			return wrapper;
		}

		function enable() {
			ensureWrapper();
			if (!wrapper) {
				return;
			}
			el.style.width    = refWidth + 'px';
			el.style.maxWidth = 'none';
			var h = el.offsetHeight;              // height measured at the reference width
			var s = window.innerWidth / refWidth; // scale that maps the reference width to the device width
			gsap.set(el, { scaleX: s, scaleY: s, transformOrigin: 'left top' });
			wrapper.style.display  = 'block';
			wrapper.style.width    = '100%';
			wrapper.style.overflow = 'hidden';
			wrapper.style.height   = ( h * s ) + 'px';
		}

		function disable() {
			el.style.width    = '';
			el.style.maxWidth = '';
			gsap.set(el, { scaleX: 1, scaleY: 1 });
			if (wrapper) {
				// display:contents makes the wrapper transparent to layout, so the
				// desktop behaves exactly as if the wrapper were not there.
				wrapper.style.display  = 'contents';
				wrapper.style.width    = '';
				wrapper.style.overflow = '';
				wrapper.style.height   = '';
			}
		}

		function update() {
			if (refWidth > 0 && isMobile()) {
				enable();
			} else {
				disable();
			}
		}

		function destroy() {
			disable();
			if (wrapper && wrapper.parentNode) {
				wrapper.parentNode.insertBefore(el, wrapper);
				wrapper.parentNode.removeChild(wrapper);
				wrapper = null;
			}
			try { gsap.set(el, { clearProps: 'transform' }); } catch (e) {}
		}

		update();
		return { update: update, destroy: destroy };
	}

	// --- Effect registry ---------------------------------------------------

	// An effect definition is { name, selector, build(el, ctx), recompute(entry) }.
	// build wires one matching element; recompute (optional) re-measures it on
	// resize. Effects register themselves in Stages 2 to 4.
	var effects = [];

	// Every wired element gets one entry so we can tear it down precisely later.
	var entries = [];

	// Marks an element as already wired, so nothing is ever wired twice, however
	// often re-init is called (event, observer and resize can all fire close
	// together on a seamless page).
	var INIT_ATTR = 'data-kdna-gsap-init';

	function registerEffect(def) {
		if (!def || !def.name || !def.selector || typeof def.build !== 'function') {
			log('Ignored an invalid effect definition.', def);
			return;
		}
		effects.push(def);
		log('Registered effect:', def.name, '(' + def.selector + ')');
	}

	// The handle each effect's build() receives: shared tools plus two helpers to
	// hand back whatever it creates, so the engine can kill it cleanly later.
	function makeContext(entry) {
		return {
			gsap: gsap,
			ScrollTrigger: ScrollTrigger,
			settings: settings,
			defaults: defaults,
			isMobile: isMobile,
			// Register a timeline (its ScrollTrigger is captured automatically).
			addTimeline: function (tl) {
				if (tl) {
					entry.timelines.push(tl);
					if (tl.scrollTrigger) {
						entry.triggers.push(tl.scrollTrigger);
					}
				}
				return tl;
			},
			// Register a standalone ScrollTrigger.
			addTrigger: function (st) {
				if (st) {
					entry.triggers.push(st);
				}
				return st;
			},
			// Register a cleanup callback, run when this element is torn down.
			onCleanup: function (fn) {
				if (typeof fn === 'function') {
					entry.cleanups.push(fn);
				}
			},
			// Set up mobile scale-to-width with edge clipping for an element.
			// Returns a controller; the engine calls update() on resize and the
			// controller is destroyed automatically on teardown.
			scaleToWidth: function (target) {
				var scaler = createScaler(target || entry.el);
				entry.cleanups.push(scaler.destroy);
				entry.data.scaler = scaler;
				return scaler;
			}
		};
	}

	// Collect a root and its descendants that match a selector (the root itself
	// can be the match when re-init is handed a single injected element).
	function matchNodes(root, selector) {
		var out = [];
		if (root.nodeType === 1 && root.matches && root.matches(selector)) {
			out.push(root);
		}
		if (root.querySelectorAll) {
			[].slice.call(root.querySelectorAll(selector)).forEach(function (n) {
				out.push(n);
			});
		}
		return out;
	}

	// Wire every effect found inside a root, skipping anything already wired.
	function buildEffectsIn(root) {
		root = root || document;
		var built = 0;

		effects.forEach(function (def) {
			matchNodes(root, def.selector).forEach(function (el) {
				if (el.getAttribute(INIT_ATTR)) {
					return; // already wired, never double-wire
				}
				// Flag before building, so any DOM work the effect does (such as
				// the mobile scale wrapper) cannot make the observer queue it again.
				el.setAttribute(INIT_ATTR, def.name);
				var entry = { effect: def, el: el, triggers: [], timelines: [], cleanups: [], data: {} };
				try {
					def.build(el, makeContext(entry));
					entries.push(entry);
					built++;
				} catch (e) {
					el.removeAttribute(INIT_ATTR);
					log('Build error for', def.name, e);
				}
			});
		});

		if (built) {
			log('Built ' + built + ' effect instance(s) in', describe(root));
		}
		return built;
	}

	// --- Teardown ----------------------------------------------------------

	// Kill the triggers and timelines belonging to one entry and release its flag.
	function destroyEntry(entry) {
		entry.triggers.forEach(function (st) {
			try { st.kill(true); } catch (e) {}
		});
		entry.timelines.forEach(function (tl) {
			try { tl.kill(); } catch (e) {}
		});
		// Effect cleanups (such as unwrapping the mobile scale wrapper) run last,
		// once the animations controlling those elements have stopped.
		( entry.cleanups || [] ).forEach(function (fn) {
			try { fn(); } catch (e) {}
		});
		entry.triggers.length  = 0;
		entry.timelines.length = 0;
		entry.cleanups         = [];
		if (entry.el && entry.el.removeAttribute) {
			entry.el.removeAttribute(INIT_ATTR);
		}
	}

	// Remove anything whose element has left the page, so injected and removed
	// projects never leak triggers or fire twice.
	function teardownStale() {
		var killed = 0;

		entries = entries.filter(function (entry) {
			if (document.body.contains(entry.el)) {
				return true;
			}
			destroyEntry(entry);
			killed++;
			return false;
		});

		// Belt and braces: catch any orphan ScrollTrigger whose trigger element
		// has gone, including pin spacers left behind by removed content.
		ScrollTrigger.getAll().forEach(function (st) {
			var t = st.trigger;
			if (t && t.nodeType === 1 && !document.body.contains(t)) {
				try { st.kill(true); } catch (e) {}
				killed++;
			}
		});

		if (killed) {
			log('Tore down ' + killed + ' stale trigger(s).');
		}
		return killed;
	}

	// --- Refresh batching --------------------------------------------------

	// Several signals can ask for a refresh at once (the event, the observer and
	// the resize the seamless scroll fires). Batch them into a single refresh.
	var refreshTimer = null;
	function scheduleRefresh(delay) {
		if (refreshTimer) {
			clearTimeout(refreshTimer);
		}
		refreshTimer = setTimeout(function () {
			refreshTimer = null;
			ScrollTrigger.refresh();
			log('Refreshed. Active ScrollTriggers:', ScrollTrigger.getAll().length);
		}, (delay == null) ? 150 : delay);
	}

	// Refresh ONLY specific (newly injected) triggers. A global refresh recalcs
	// every trigger and snaps any in-progress scrub or pin to its exact position,
	// which is seen as a jump. Injected content is appended below existing effects,
	// so existing triggers keep their positions and must be left untouched.
	var pendingNewTriggers = [];
	var newRefreshTimer = null;
	function scheduleNewRefresh() {
		if (newRefreshTimer) {
			clearTimeout(newRefreshTimer);
		}
		newRefreshTimer = setTimeout(function () {
			newRefreshTimer = null;
			var list = pendingNewTriggers.splice(0, pendingNewTriggers.length);
			var seen = [], n = 0;
			list.forEach(function (st) {
				if (st && seen.indexOf(st) === -1 && typeof st.refresh === 'function') {
					seen.push(st); // refresh each new trigger once, never dozens of times
					try { st.refresh(); n++; } catch (e) {}
				}
			});
			if (n) {
				log('Refreshed ' + n + ' new trigger(s) only; existing animations left untouched.');
			}
		}, 150);
	}

	// --- Scroll-idle gate --------------------------------------------------

	// Building injected content, above all a pinned effect, makes GSAP lay out a
	// pin spacer and run its own GLOBAL refresh, which re-syncs every scrubbed
	// slider to the scrollbar in one step. Done while a slider is still gliding
	// after the scroll, that re-sync is seen as a sudden jump at the end of the
	// glide (the reported side-sliding-rows jump). The refresh itself is
	// unavoidable, so instead we hold the build until the scroll has settled: at
	// rest every scrub already sits on its scroll-mapped position, so the same
	// refresh moves nothing on screen. Before the first scroll we build straight
	// away, since the page is at the top with nothing gliding.
	var lastScrollAt = 0;
	var lastFeatLog  = 0; // throttle for the live diagonal-feature centring readout
	function nowMs() {
		return ( window.performance && window.performance.now ) ? window.performance.now() : Date.now();
	}
	window.addEventListener('scroll', function () { lastScrollAt = nowMs(); }, { passive: true });

	// How long after the last scroll we treat the page as settled before wiring
	// injected content.
	function settleQuiet() {
		// Motion is tied directly to the scroll (no glide), so a short settle is all
		// that is needed before wiring injected content.
		return 150;
	}

	function whenScrollIdle(fn) {
		var quiet    = settleQuiet();
		var deadline = nowMs() + 2500; // build within this even if the scroll never settles
		(function check() {
			var t = nowMs();
			if (!lastScrollAt || ( t - lastScrollAt ) >= quiet || t >= deadline) {
				fn();
			} else {
				setTimeout(check, 100);
			}
		})();
	}

	// The seamless scroll injects each project's stylesheet (its 160vh hero, its
	// images and so on) JUST AFTER it hands us the content, so the panel reflows
	// right after content-added. Building and measuring before that settles gives
	// wrong pin heights and feature centring, and the section then jumps when it is
	// reached. So we wait for the injected panel to stop resizing before building.
	// A ResizeObserver makes this exact; where it is missing we build immediately.
	function whenLayoutStable(root, cb, maxWait) {
		if (!('ResizeObserver' in window) || !root || root === document || root.nodeType !== 1) {
			cb();
			return;
		}
		var done = false, ro = null, debounce = null;
		function finish() {
			if (done) { return; }
			done = true;
			clearTimeout(deadline);
			if (debounce) { clearTimeout(debounce); }
			if (ro) { try { ro.disconnect(); } catch (e) {} }
			cb();
		}
		var deadline = setTimeout(finish, maxWait || 2000);
		try {
			ro = new window.ResizeObserver(function () {
				if (debounce) { clearTimeout(debounce); }
				debounce = setTimeout(finish, 160); // no size change for 160ms means it has settled
			});
			ro.observe(root);
			debounce = setTimeout(finish, 160); // settle even if a resize never fires
		} catch (e) {
			finish();
		}
	}

	// --- Resolve the right ScrollTrigger copy ------------------------------

	// When a second copy of GSAP is on the page (a smooth-scroll widget, another
	// plugin), window.ScrollTrigger may not be the copy our pins are actually built
	// with, so getAll/refresh/teardown would do nothing and the pins would never be
	// managed (the "Active ScrollTriggers: 0" symptom). We read the real copy off
	// the first live effect trigger and use it from then on, attaching our refresh
	// hook and config to it. Runs once, as soon as a trigger exists.
	var stResolved = false;
	function resolveScrollTrigger() {
		if (stResolved) {
			return;
		}
		for (var i = 0; i < entries.length; i++) {
			var t = entries[i].triggers[0];
			if (t && t.constructor && typeof t.constructor.getAll === 'function') {
				stResolved = true;
				if (t.constructor !== ScrollTrigger) {
					// A different copy builds our pins than the one on window. Switch
					// to it and move our config and refresh hook across.
					multipleGsap = true;
					ScrollTrigger = t.constructor;
					try { ScrollTrigger.config({ ignoreMobileResize: true }); } catch (e) {}
					ScrollTrigger.addEventListener('refreshInit', recomputeAll);
					log('Re-aligned to the ScrollTrigger our pins use (a second GSAP copy is on the page).');
				}
				return;
			}
		}
	}

	// --- Re-init -----------------------------------------------------------

	// The core re-init used for injected content: drop stale triggers, wire the
	// new content only, then refresh just the new triggers (never the whole page,
	// so existing effects are not snapped).
	function reinit(root, reason) {
		var built = 0;
		// Wait for the scroll to settle, then for the injected panel's layout to
		// settle, then build once against the final layout. That way the pin heights
		// and the feature centring are measured correctly and the section does not
		// jump when it is reached, and the unavoidable pin-create refresh lands while
		// the existing effects are at rest (see the scroll-idle gate above).
		whenScrollIdle(function () {
			whenLayoutStable(root, function () {
				teardownStale();
				var before = entries.length;
				built = buildEffectsIn(root || document);
				resolveScrollTrigger();
				for (var i = before; i < entries.length; i++) {
					entries[i].triggers.forEach(function (st) { pendingNewTriggers.push(st); });
				}
				scheduleNewRefresh();
				note('Re-init (' + (reason || 'manual') + '): ' + built + ' new effect instance(s).');
			});
		});
		return built;
	}

	// --- First load --------------------------------------------------------

	var started = false;
	function init() {
		if (started) {
			return;
		}
		started = true;

		// Re-apply mobile scaling and effect recompute at the start of every refresh
		// (first load, image load, resize). Attached now; if a second GSAP copy is
		// found, resolveScrollTrigger() re-attaches it to the correct copy as well.
		ScrollTrigger.config({ ignoreMobileResize: true });
		ScrollTrigger.addEventListener('refreshInit', recomputeAll);

		var built = buildEffectsIn(document);
		resolveScrollTrigger(); // switch to the copy our pins are really built with
		scheduleRefresh(0);

		note('Engine initialised (v' + (cfg.version || '?') + '). Effects registered: ' +
			effects.length + ', instances built: ' + built +
			'. Motion is tied directly to the scroll (no smoothing glide).');

		if (DEBUG) {
			var withTriggers = 0;
			entries.forEach(function (e) { if (e.triggers.length) { withTriggers++; } });
			log('GSAP ' + (gsap.version || '?') + ' | ScrollTrigger.getAll()=' + ScrollTrigger.getAll().length +
				' | instances with a live trigger=' + withTriggers +
				( multipleGsap ? ' | NOTE: more than one GSAP copy on the page (now aligned)' : '' ) +
				' | ScrollSmoother active=' + !!( window.ScrollSmoother && window.ScrollSmoother.get && window.ScrollSmoother.get() ));
		}

		bindContentAdded();
		bindObserverFallback();
		bindResize();
	}

	// --- Listening for injected content ------------------------------------

	// The primary signal, dispatched by the KDNA Seamless Portfolio Scroll once a
	// project has been appended. detail.container is that project's wrapper.
	function bindContentAdded() {
		document.addEventListener('kdna:content-added', function (e) {
			var root = (e && e.detail && e.detail.container) || document;
			note('kdna:content-added received.');
			reinit(root, 'content-added');
		});
		log('Listening for kdna:content-added.');
	}

	// The fallback. If the seamless scroll has its re-init setting off, the event
	// above never fires, so we watch the DOM for appended project panels too. The
	// per-element wiring guard and the batched refresh mean the event and the
	// observer can both fire for the same panel without any double work.
	function bindObserverFallback() {
		if (!('MutationObserver' in window)) {
			log('No MutationObserver in this browser, relying on the event alone.');
			return;
		}

		var watchRoot     = pickObserverRoot();
		var pending       = [];
		var debounceTimer = null;

		var observer = new MutationObserver(function (mutations) {
			var found = false;

			mutations.forEach(function (m) {
				[].slice.call(m.addedNodes).forEach(function (node) {
					if (node.nodeType === 1 && isProcessable(node)) {
						pending.push(node);
						found = true;
					}
				});
			});

			if (!found) {
				return;
			}
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
			debounceTimer = setTimeout(function () {
				debounceTimer = null;
				var nodes = pending.splice(0, pending.length);
				nodes.forEach(function (node) {
					if (document.body.contains(node)) {
						reinit(node, 'observer');
					}
				});
			}, 200);
		});

		observer.observe(watchRoot, { childList: true, subtree: true });
		log('MutationObserver watching', describe(watchRoot));
	}

	// Is this added node worth processing? A seamless-scroll panel always is.
	// Otherwise only if it is, or contains, an effect target that is not yet
	// wired. This keeps the observer from reacting to GSAP's own pin-spacer DOM
	// changes, whose effect elements are already flagged.
	function isProcessable(node) {
		// Never react to GSAP's own pin spacers (inserted when we pin an element),
		// so the observer cannot loop on our own DOM changes.
		if (node.classList && node.classList.contains('pin-spacer')) {
			return false;
		}
		if (node.classList && node.classList.contains('kdna-sps-panel')) {
			return true;
		}
		for (var i = 0; i < effects.length; i++) {
			var sel = effects[i].selector;
			try {
				if (node.matches && node.matches(sel) && !node.getAttribute(INIT_ATTR)) {
					return true;
				}
				if (node.querySelector && node.querySelector(sel + ':not([' + INIT_ATTR + '])')) {
					return true;
				}
			} catch (e) {}
		}
		return false;
	}

	// Watch the parent of the content wrapper, because the seamless scroll inserts
	// each project as a sibling of that wrapper. Fall back to the body.
	function pickObserverRoot() {
		var selectors = (cfg.contentSelectors && cfg.contentSelectors.length)
			? cfg.contentSelectors
			: ['.elementor-location-single', 'main .elementor', 'main', '#content'];

		for (var i = 0; i < selectors.length; i++) {
			var el = document.querySelector(selectors[i]);
			if (el && el.parentNode) {
				return el.parentNode;
			}
		}
		return document.body;
	}

	// --- Resize ------------------------------------------------------------

	// Debounced, and only on a width change. Ignoring height-only changes keeps
	// the mobile address bar showing and hiding from triggering a recalculation,
	// which honours the no-responsive-reflow rule; genuine resizes and orientation
	// changes (which change the width) still refresh. The refresh re-applies the
	// scalers and effect recompute through the refreshInit hook, then ScrollTrigger
	// measures the new geometry.
	function bindResize() {
		var t = null;
		var lastWidth = window.innerWidth;
		window.addEventListener('resize', function () {
			if (t) {
				clearTimeout(t);
			}
			t = setTimeout(function () {
				t = null;
				var w = window.innerWidth;
				// Ignore changes up to a scrollbar's width (a scrollbar appearing when
				// content loads, sub-pixel rounding, the mobile chrome). Those are not
				// real resizes and a refresh on them would needlessly recompute pins.
				if (Math.abs(w - lastWidth) <= 40) {
					return;
				}
				lastWidth = w;
				// A real width change needs a global refresh, but a global refresh snaps
				// in-progress scrubs, so hold it until the scroll has settled.
				whenScrollIdle(function () {
					ScrollTrigger.refresh();
					log('Resize (width changed to ' + w + '): refreshed.');
				});
			}, 200);
		}, { passive: true });
	}

	function recomputeAll() {
		// recomputeAll runs on ScrollTrigger's refreshInit, i.e. on every GLOBAL
		// refresh. A global refresh snaps any in-progress scrub/pin to the exact
		// scroll position, so if a slider "jumps" exactly when this logs, the jump
		// is a global refresh (most often GSAP laying out a newly created pin
		// spacer), not the scrub smoothing itself.
		log('Global ScrollTrigger refresh (all triggers recalculated).');
		entries.forEach(function (entry) {
			// Re-apply the mobile scale-to-width first, since it changes geometry.
			if (entry.data && entry.data.scaler) {
				try { entry.data.scaler.update(); } catch (e) {}
			}
			if (typeof entry.effect.recompute === 'function') {
				try {
					entry.effect.recompute(entry);
				} catch (e) {
					log('Recompute error for', entry.effect.name, e);
				}
			}
		});
	}

	// --- Small helpers -----------------------------------------------------

	function describe(node) {
		if (!node || node === document) {
			return 'document';
		}
		if (node.id) {
			return '#' + node.id;
		}
		if (node.className && typeof node.className === 'string') {
			return (node.tagName ? node.tagName.toLowerCase() : '') + '.' + node.className.split(' ')[0];
		}
		return node.tagName ? node.tagName.toLowerCase() : String(node);
	}

	// --- Effects -----------------------------------------------------------

	// Effect 1, side-sliding image rows.
	//
	// imgSliderLeft (top row) and imgSliderRight (bottom row) are full-width rows,
	// wider than the viewport, that drift sideways in opposite directions as the
	// page scrolls down, and reverse on the way back up. Scrubbed, not pinned.
	// Because the motion is scrubbed to the scrollbar, the reverse is automatic.
	function buildSlider(el, ctx, fromX, toX) {
		var e1 = ctx.settings.effect1 || {};
		var d  = ctx.defaults;

		var tl = ctx.gsap.timeline({
			scrollTrigger: {
				trigger: el,
				// Row top reaches the bottom of the viewport, with the start clamped.
				start: e1.start || 'clamp(top 100%)',
				// Row bottom is 60 per cent past the top, end not clamped.
				end: e1.end || 'bottom -60%',
				// Tied directly to the scrollbar, with no smoothing glide, so the row
				// stops the instant the scroll stops.
				scrub: true
				// No invalidateOnRefresh here: the row's travel is a constant per cent
				// of its own width, so it never needs re-measuring, and invalidating it
				// on every refresh would revert it to the start for a frame (a flicker).
			}
		});

		tl.fromTo(
			el,
			{ xPercent: ( typeof fromX === 'number' ) ? fromX : 0 },
			{ xPercent: ( typeof toX === 'number' ) ? toX : 0, ease: d.ease || 'sine.inOut' }
		);

		ctx.addTimeline(tl);

		// Mobile: scale the whole row to the device width and clip at the edges.
		ctx.scaleToWidth(el);
	}

	registerEffect({
		name: 'slider-left',
		selector: '.imgSliderLeft',
		build: function (el, ctx) {
			var e1 = ctx.settings.effect1 || {};
			buildSlider(el, ctx, e1.leftFrom, e1.leftTo);
		}
	});

	registerEffect({
		name: 'slider-right',
		selector: '.imgSliderRight',
		build: function (el, ctx) {
			var e1 = ctx.settings.effect1 || {};
			buildSlider(el, ctx, e1.rightFrom, e1.rightTo);
		}
	});

	// Effect 2, image enlarge (grid expand).
	//
	// Pins gridEnlarge. The centre image (imgEnlarge) grows in place to fill the
	// viewport, while the seven outer images (imgGrow1 to imgGrow7) scale up and
	// fly straight outward off the screen, together. The fly-out is measured from
	// each image's position so it clears the screen at any size and with any
	// images, and it recomputes on every refresh.

	// How much an element must scale to fill the viewport: cover (fill both ways)
	// on desktop, full device width on mobile (so it ends at full width, not full
	// height). Shared by the centre image (Effect 2) and the feature (Effect 3),
	// so the mobile fill is identical across the effects. offsetWidth/Height are
	// layout sizes, unaffected by any rest rotation or transform. Falls back if the
	// element cannot be measured yet.
	function fillScale(el, mobile, fallback) {
		var w = el.offsetWidth;
		var h = el.offsetHeight;
		if (!w || !h) {
			return ( typeof fallback === 'number' && fallback > 0 ) ? fallback : 1;
		}
		var vw = window.innerWidth;
		var vh = window.innerHeight;
		return mobile ? ( vw / w ) : Math.max( vw / w, vh / h );
	}

	// The translation that flies one outer image straight out from the centre,
	// far enough that it fully clears the screen even at its final scale. Worked
	// out in the grid-centre frame: during the pin the grid centre sits at the
	// viewport centre, so the screen reaches half a diagonal in every direction;
	// travelling that plus the image's scaled half-size guarantees it is gone.
	function flyOut(o, grid, idx, total, outerScale) {
		var oRect = o.getBoundingClientRect();
		var gRect = grid.getBoundingClientRect();
		var relx  = ( oRect.left + oRect.width / 2 ) - ( gRect.left + gRect.width / 2 );
		var rely  = ( oRect.top + oRect.height / 2 ) - ( gRect.top + gRect.height / 2 );
		var len   = Math.sqrt( relx * relx + rely * rely );

		var ux, uy;
		if (len < 1) {
			// Image sits on the centre: fan the images out evenly by their order.
			var ang = ( idx / Math.max( 1, total ) ) * Math.PI * 2;
			ux = Math.cos(ang);
			uy = Math.sin(ang);
		} else {
			ux = relx / len;
			uy = rely / len;
		}

		var vw       = window.innerWidth;
		var vh       = window.innerHeight;
		var halfDiag = Math.sqrt( vw * vw + vh * vh ) / 2;
		var maxHalf  = Math.max( o.offsetWidth, o.offsetHeight ) * outerScale / 2;
		var dist     = halfDiag + maxHalf + Math.max( vw, vh ) * 0.05; // plus a small margin

		return { x: ux * dist, y: uy * dist };
	}

	// --- Pinning helpers ---------------------------------------------------

	// Parse a computed transform into a 2D affine matrix [a,b,c,d,e,f].
	function parseMatrix2D(t) {
		if (!t || t === 'none') {
			return [1, 0, 0, 1, 0, 0];
		}
		var m = t.match(/matrix\(([^)]+)\)/);
		if (m) {
			var v = m[1].split(',');
			return [parseFloat(v[0]), parseFloat(v[1]), parseFloat(v[2]), parseFloat(v[3]), parseFloat(v[4]), parseFloat(v[5])];
		}
		var m3 = t.match(/matrix3d\(([^)]+)\)/);
		if (m3) {
			var w = m3[1].split(',');
			// Use the 2D components of the 3D matrix.
			return [parseFloat(w[0]), parseFloat(w[1]), parseFloat(w[4]), parseFloat(w[5]), parseFloat(w[12]), parseFloat(w[13])];
		}
		return [1, 0, 0, 1, 0, 0];
	}

	// Multiply two 2D affine matrices (A applied after B): screen = A * (B * point).
	function matMul2D(A, B) {
		return [
			A[0] * B[0] + A[2] * B[1],
			A[1] * B[0] + A[3] * B[1],
			A[0] * B[2] + A[2] * B[3],
			A[1] * B[2] + A[3] * B[3],
			A[0] * B[4] + A[2] * B[5] + A[4],
			A[1] * B[4] + A[3] * B[5] + A[5]
		];
	}

	// The combined transform of an element's ancestors, mapping the element's own
	// coordinate space to the screen. The diagonal layout rotates (and sometimes
	// scales) a parent of the feature, so both straightening and centring have to
	// account for the whole matrix, not just an angle.
	function ancestorMatrix2D(el) {
		var M = [1, 0, 0, 1, 0, 0];
		var node = el.parentElement;
		var guard = 0;
		while (node && node !== document.documentElement && guard < 40) {
			var t;
			try { t = window.getComputedStyle(node).transform; } catch (e) { t = 'none'; }
			if (t && t !== 'none') {
				M = matMul2D(parseMatrix2D(t), M); // outer ancestor wraps the inner ones
			}
			node = node.parentElement;
			guard++;
		}
		return M;
	}

	// The rotation (radians) baked into a 2D matrix.
	function matrixRotationRad(M) {
		return Math.atan2(M[1], M[0]);
	}

	// Convert a screen-space delta vector into an element's own coordinate space,
	// given its ancestor matrix, so a translate applied through rotated/scaled
	// ancestors still moves the element by the intended screen distance.
	function matrixInvVec(M, dx, dy) {
		var a = M[0], b = M[1], c = M[2], d = M[3];
		var det = a * d - b * c;
		if (!det) {
			return { x: dx, y: dy };
		}
		return { x: ( d * dx - c * dy ) / det, y: ( -b * dx + a * dy ) / det };
	}

	// Find the first ancestor with a transform, filter, perspective or
	// will-change:transform. Any of these makes a descendant's position:fixed
	// resolve against that ancestor instead of the viewport, which is the usual
	// reason a pinned section jumps or disappears at the ends of its pin.
	function transformedAncestor(el) {
		var node = el.parentElement;
		var guard = 0;
		while (node && node !== document.documentElement && guard < 40) {
			var s = window.getComputedStyle(node);
			if ((s.transform && s.transform !== 'none') ||
				(s.perspective && s.perspective !== 'none') ||
				(s.filter && s.filter !== 'none') ||
				(s.willChange && s.willChange.indexOf('transform') > -1)) {
				return node;
			}
			node = node.parentElement;
			guard++;
		}
		return null;
	}

	// Decide how to pin: honour the setting, or in auto mode switch to transform
	// pinning when a transformed ancestor would break the default fixed pinning.
	function resolvePinType(el) {
		var pt = settings.pinType || 'auto';
		if (pt === 'fixed' || pt === 'transform') {
			return pt;
		}
		return transformedAncestor(el) ? 'transform' : 'fixed';
	}

	// In debug mode, report anything that commonly breaks pinning, so the cause of
	// a jump or a disappear can be seen at a glance in the console.
	function diagnosePin(el, label) {
		if (!DEBUG) {
			return;
		}
		var issues = [];
		var node = el.parentElement;
		var guard = 0;
		while (node && node !== document.documentElement && guard < 40) {
			var s = window.getComputedStyle(node);
			var flags = [];
			if (s.transform && s.transform !== 'none') { flags.push('transform'); }
			if (s.perspective && s.perspective !== 'none') { flags.push('perspective'); }
			if (s.filter && s.filter !== 'none') { flags.push('filter'); }
			if (s.willChange && s.willChange.indexOf('transform') > -1) { flags.push('will-change'); }
			if (flags.length) { issues.push(describe(node) + ' [' + flags.join(', ') + ']'); }
			node = node.parentElement;
			guard++;
		}
		var smooth = !!(window.lenis || window.__lenis || window.locomotive ||
			(window.ScrollSmoother && typeof window.ScrollSmoother.get === 'function' && window.ScrollSmoother.get()));
		var msg = 'Pin diagnostic for ' + label + ': using pinType "' + resolvePinType(el) + '". ';
		msg += issues.length
			? ('Ancestor(s) that break fixed pinning: ' + issues.join('  |  ') + '. Transform pinning handles this; if it still jumps, switch Pin type to Transform, enable Reparent pins, or remove the transform from the ancestor.')
			: 'No transformed ancestors found above this element.';
		if (smooth) { msg += ' A smooth-scroll library looks active, which can need a ScrollTrigger scrollerProxy.'; }
		try {
			if (window.getComputedStyle(document.documentElement).scrollBehavior === 'smooth') {
				msg += ' The page uses scroll-behavior:smooth, which can fight scrubbing; consider removing it.';
			}
		} catch (e) {}
		log(msg);
	}

	function buildEnlarge(grid, ctx) {
		var e2         = ctx.settings.effect2 || {};
		var d          = ctx.defaults;
		var gsap       = ctx.gsap;
		var outerScale = ( typeof e2.outerScale === 'number' && e2.outerScale > 0 ) ? e2.outerScale : 4;

		var centre = grid.querySelector('.imgEnlarge');
		var outers = [];
		for (var i = 1; i <= 7; i++) {
			var o = grid.querySelector('.imgGrow' + i);
			if (o) {
				outers.push(o);
			}
		}

		// Clip the grid at all sizes so flown-out images cannot bleed out behind
		// other content (and on mobile the grown centre is contained in the box).
		// The outer images fly to the edges of the grid box rather than across the
		// whole screen, which keeps the effect tidy inside its own frame.
		grid.style.overflow = 'hidden';

		diagnosePin(grid, '.gridEnlarge');

		var tl = gsap.timeline({
			scrollTrigger: {
				trigger: grid,
				start: e2.start || 'center 50%',     // grid centre at 50 per cent of the viewport
				end: e2.end || 'center -150%',       // grid centre at -150 per cent, about two screens of pin
				scrub: true,
				pin: grid,
				pinSpacing: true,
				pinType: resolvePinType(grid),       // transform pinning when a transformed ancestor would break fixed
				pinReparent: !!ctx.settings.pinReparent,
				anticipatePin: 1,
				invalidateOnRefresh: true            // re-measure the fly-out on refresh, inject and resize
			}
		});

		// Centre grows in place to fill the viewport. No translation.
		if (centre) {
			tl.to(centre, {
				scale: function () { return fillScale(centre, ctx.isMobile()); },
				transformOrigin: '50% 50%',
				ease: d.ease || 'sine.inOut',
				duration: 1
			}, 0);
		}

		// Outer images scale up and fly outward together.
		outers.forEach(function (o, idx) {
			tl.to(o, {
				x: function () { return flyOut(o, grid, idx, outers.length, outerScale).x; },
				y: function () { return flyOut(o, grid, idx, outers.length, outerScale).y; },
				scale: outerScale,
				transformOrigin: '50% 50%',
				ease: d.ease || 'sine.inOut',
				duration: 1
			}, 0);
		});

		ctx.addTimeline(tl);

		// Reset what we touched if this grid is ever torn down.
		ctx.onCleanup(function () {
			grid.style.overflow = '';
			if (centre) { try { gsap.set(centre, { clearProps: 'transform' }); } catch (e) {} }
			outers.forEach(function (o2) { try { gsap.set(o2, { clearProps: 'transform' }); } catch (e) {} });
		});
	}

	registerEffect({
		name: 'enlarge',
		selector: '.gridEnlarge',
		build: buildEnlarge,
		// Keep the grid clipped (re-asserted on refresh in case anything cleared it).
		recompute: function (entry) {
			entry.el.style.overflow = 'hidden';
		}
	});

	// Effect 3, diagonal images.
	//
	// Pins diagImgs. The columns (diag1, diag2, ...) drift vertically in
	// alternation across the whole pin, while the feature image (diagGrow) starts
	// about halfway, pops out of its column, rotates to horizontal and scales to
	// fill the viewport. The diagonal layout, angles, offsets and overflow-hidden
	// box are all built in Elementor; this only animates the existing elements.

	// The absolute translate that centres the feature in the viewport. Worked out
	// in the container frame: during the pin the container top sits at the viewport
	// top, so the horizontal target is scroll-independent and the vertical target
	// is measured against the container top. The current translate is added back in
	// (rather than using a relative "+=" value, which can accumulate across
	// refreshes) so any rest transform Elementor set is accounted for exactly.
	function featureMove(feature, container, gsap, M, drift) {
		var fRect = feature.getBoundingClientRect();
		var cRect = container.getBoundingClientRect();
		var dx    = window.innerWidth / 2 - ( fRect.left + fRect.width / 2 );
		var dy    = window.innerHeight / 2 - ( ( fRect.top + fRect.height / 2 ) - cRect.top );
		// If the feature rides inside a column that drifts during the pin, it is
		// carried by that column's travel by the end, so it would land off-centre by
		// exactly that drift. Cancel it here. A column drift is a pure translation, so
		// it does not change the matrix below, only this offset.
		if ( drift ) {
			dx -= drift.x;
			dy -= drift.y;
		}
		// Convert the screen-space delta into the feature's own coordinate space, so
		// a feature inside the rotated (and possibly scaled) columns still lands
		// centred rather than drifting or stopping short.
		var local = matrixInvVec( M || [1, 0, 0, 1, 0, 0], dx, dy );
		var curX  = parseFloat( gsap.getProperty( feature, 'x' ) ) || 0;
		var curY  = parseFloat( gsap.getProperty( feature, 'y' ) ) || 0;
		return { x: curX + local.x, y: curY + local.y };
	}

	function buildDiagonal(container, ctx) {
		var e3           = ctx.settings.effect3 || {};
		var d            = ctx.defaults;
		var gsap         = ctx.gsap;
		var travel       = ( typeof e3.columnTravel === 'number' ) ? e3.columnTravel : 18;
		var offsets      = e3.colOffsets || [];
		var fStart       = ( typeof e3.featureStart === 'number' ) ? Math.min( 0.95, Math.max( 0, e3.featureStart ) ) : 0.5;
		var fallbackScale = ( typeof e3.featureScale === 'number' ) ? e3.featureScale : 3;

		// Columns diag1, diag2, ... in order, any number of them.
		var cols = [];
		for (var i = 1; i <= 12; i++) {
			var c = container.querySelector('.diag' + i);
			if (c) {
				cols.push(c);
			}
		}
		var feature = container.querySelector('.diagGrow');

		// Mobile: make sure the box clips the columns and the feature at the phone
		// breakpoint, matching the other effects. On desktop the Elementor box rules
		// apply (the diagonal layout already clips), so the inline value stays clear.
		if (ctx.isMobile()) {
			container.style.overflow = 'hidden';
		}

		diagnosePin(container, '.diagImgs');

		var tl = gsap.timeline({
			scrollTrigger: {
				trigger: container,
				start: e3.start || 'top -1px',       // pin from the container top
				end: e3.end || 'top -100%',          // about one screen-height of pin
				scrub: true,
				pin: container,
				pinSpacing: true,
				pinType: resolvePinType(container),  // transform pinning when a transformed ancestor would break fixed
				pinReparent: !!ctx.settings.pinReparent,
				anticipatePin: 1,
				invalidateOnRefresh: true,
				// In debug, print how far the feature centre is from the viewport centre
				// while it is popped, so the live centring error can be read straight
				// from the console without running diagnose(). Throttled.
				onUpdate: DEBUG ? function (self) {
					if (!feature || self.progress < 0.85) { return; }
					var t = nowMs();
					if (t - lastFeatLog < 400) { return; }
					lastFeatLog = t;
					var fr = feature.getBoundingClientRect();
					log('Feature popped (progress ' + self.progress.toFixed(2) + '): OFFSET from viewport centre x=' +
						Math.round(window.innerWidth / 2 - (fr.left + fr.width / 2)) + ' y=' +
						Math.round(window.innerHeight / 2 - (fr.top + fr.height / 2)) +
						' (0,0 = perfectly centred); feature ' + Math.round(fr.width) + 'x' + Math.round(fr.height));
				} : undefined
			}
		});

		// Columns drift vertically in alternation, continuously across the pin.
		// Direction alternates by column order, so one travel value drives any
		// number of columns. The offsets stagger the resting positions.
		cols.forEach(function (col, idx) {
			var dir = ( idx % 2 === 0 ) ? 1 : -1; // diag1 down, diag2 up, diag3 down, ...
			var off = ( typeof offsets[idx] === 'number' ) ? offsets[idx] : 0;
			tl.fromTo(
				col,
				{ yPercent: off },
				{ yPercent: off + dir * travel, ease: d.ease || 'sine.inOut', duration: 1 },
				0
			);
		});

		// Feature pops out from about halfway, overlapping the column motion:
		// rotate to horizontal, centre in the viewport and scale to fill. The
		// diagonal angle is usually on a parent, so straightening means countering
		// the ancestors' rotation, not just zeroing the feature's own rotation.
		if (feature) {
			var straighten = ( e3.featureStraighten !== false );
			var featMatrix = function () { return straighten ? ancestorMatrix2D(feature) : [1, 0, 0, 1, 0, 0]; };

			// Screen displacement the feature inherits from its own column's drift by
			// the end of the pin, so the centring can cancel it (otherwise the feature
			// lands off-centre by the column travel, which is the reported problem when
			// the feature image sits inside one of the diag columns).
			var featureDrift = function () {
				for (var i = 0; i < cols.length; i++) {
					var col = cols[i];
					if (col !== feature && col.contains && col.contains(feature)) {
						var dir   = ( i % 2 === 0 ) ? 1 : -1;
						var dyLoc = ( dir * travel / 100 ) * col.offsetHeight; // travel in the column's own space
						var Mc    = ancestorMatrix2D(col);                     // mapped to screen through its ancestors
						return { x: Mc[2] * dyLoc, y: Mc[3] * dyLoc };
					}
				}
				return null;
			};

			tl.set(feature, { transformOrigin: '50% 50%', zIndex: 999 }, fStart);
			tl.to(feature, {
				rotation: function () { return -matrixRotationRad(featMatrix()) * 180 / Math.PI; },
				x: function () { return featureMove(feature, container, gsap, featMatrix(), featureDrift()).x; },
				y: function () { return featureMove(feature, container, gsap, featMatrix(), featureDrift()).y; },
				scale: function () { return fillScale(feature, ctx.isMobile(), fallbackScale); },
				ease: d.ease || 'sine.inOut',
				duration: 1 - fStart
			}, fStart);
		}

		ctx.addTimeline(tl);

		ctx.onCleanup(function () {
			container.style.overflow = '';
			cols.forEach(function (col) { try { gsap.set(col, { clearProps: 'transform' }); } catch (e) {} });
			if (feature) { try { gsap.set(feature, { clearProps: 'transform,zIndex' }); } catch (e) {} }
		});
	}

	registerEffect({
		name: 'diagonal',
		selector: '.diagImgs',
		build: buildDiagonal,
		// Keep the mobile clipping in step with the breakpoint on resize. On desktop
		// the inline value is cleared so the Elementor box rules apply.
		recompute: function (entry) {
			entry.el.style.overflow = isMobile() ? 'hidden' : '';
		}
	});

	// --- On-demand diagnostic ----------------------------------------------

	// Run kdnaGsap.diagnose() from the console (ideally while scrolled to a pinned
	// section) to print everything needed to understand a pin jump or an off-centre
	// feature: the chosen pin type, the ancestor chain with any transforms, the
	// feature's ancestor matrix (rotation and scale), and the computed centring.
	function rectStr(r) {
		return 'x:' + Math.round(r.left) + ' y:' + Math.round(r.top) + ' w:' + Math.round(r.width) + ' h:' + Math.round(r.height);
	}

	function styleFlags(el) {
		var s = window.getComputedStyle(el);
		var parts = [ 'pos:' + s.position, 'overflow:' + s.overflow ];
		if (s.transform && s.transform !== 'none') { parts.push('transform:' + s.transform); }
		if (s.filter && s.filter !== 'none') { parts.push('filter:' + s.filter); }
		if (s.perspective && s.perspective !== 'none') { parts.push('perspective:' + s.perspective); }
		if (s.willChange && s.willChange !== 'auto') { parts.push('will-change:' + s.willChange); }
		return parts.join(', ');
	}

	function ancestorReport(el) {
		var lines = [];
		var node = el.parentElement;
		var guard = 0;
		while (node && node !== document.documentElement && guard < 40) {
			lines.push('   ^ ' + describe(node) + ' { ' + styleFlags(node) + ' }');
			node = node.parentElement;
			guard++;
		}
		return lines;
	}

	function diagnose() {
		var out = ['[KDNA GSAP] diagnose (v' + (cfg.version || '?') + ')'];
		out.push('viewport: ' + window.innerWidth + 'x' + window.innerHeight + ', mobile:' + isMobile());
		out.push('html: { ' + styleFlags(document.documentElement) + ' }');
		out.push('body: { ' + styleFlags(document.body) + ' }');
		out.push('scroll-behavior: ' + window.getComputedStyle(document.documentElement).scrollBehavior +
			' | smooth-scroll libs: lenis=' + !!(window.lenis || window.__lenis) +
			' locomotive=' + !!window.locomotive +
			' ScrollSmoother=' + !!window.ScrollSmoother);
		out.push('active ScrollTriggers: ' + ScrollTrigger.getAll().length);

		['.gridEnlarge', '.diagImgs'].forEach(function (sel) {
			[].slice.call(document.querySelectorAll(sel)).forEach(function (el, i) {
				out.push('');
				out.push(sel + ' #' + i + '  pinType=' + resolvePinType(el) + '  rect=' + rectStr(el.getBoundingClientRect()));
				var bad = transformedAncestor(el);
				out.push('  transformed ancestor (breaks fixed pinning): ' + ( bad ? describe(bad) : 'none' ));
				ancestorReport(el).forEach(function (l) { out.push(l); });
			});
		});

		[].slice.call(document.querySelectorAll('.diagGrow')).forEach(function (el, i) {
			var container = el.closest ? el.closest('.diagImgs') : null;
			var M = ancestorMatrix2D(el);
			var r = el.getBoundingClientRect();
			out.push('');
			out.push('.diagGrow #' + i + '  ancestor rotation=' + ( matrixRotationRad(M) * 180 / Math.PI ).toFixed(2) + 'deg  matrix=[' + M.map(function (n) { return n.toFixed(3); }).join(',') + ']');
			out.push('  feature rect=' + rectStr(r));
			// Live centring error: scroll so the feature is fully popped, then run
			// kdnaGsap.diagnose(); OFFSET is how far the feature centre is from the
			// viewport centre right now (0,0 means perfectly centred).
			out.push('  feature centre now: x=' + Math.round(r.left + r.width / 2) + ' y=' + Math.round(r.top + r.height / 2) +
				' | viewport centre: x=' + Math.round(window.innerWidth / 2) + ' y=' + Math.round(window.innerHeight / 2) +
				' | OFFSET x=' + Math.round(window.innerWidth / 2 - (r.left + r.width / 2)) + ' y=' + Math.round(window.innerHeight / 2 - (r.top + r.height / 2)));
			// Does the feature ride inside one of the drifting columns? If so it is
			// carried by that column's travel, which the centring now compensates for.
			var inCol = 'none';
			[].slice.call(document.querySelectorAll('.diag1,.diag2,.diag3,.diag4,.diag5,.diag6,.diag7,.diag8')).forEach(function (col) {
				if (col !== el && col.contains(el)) { inCol = describe(col); }
			});
			out.push('  feature rides inside drifting column: ' + inCol);
			if (container) {
				out.push('  container rect=' + rectStr(container.getBoundingClientRect()));
				var mv = featureMove(el, container, gsap, M);
				out.push('  computed centring translate (before drift compensation): x=' + mv.x.toFixed(1) + ' y=' + mv.y.toFixed(1));
			}
			ancestorReport(el).forEach(function (l) { out.push(l); });
		});

		var text = out.join('\n');
		if (window.console) { console.log(text); }
		return text;
	}

	// --- Public API --------------------------------------------------------

	// Exposed so the effect modules in later stages can register themselves, and
	// so the engine can be poked from the console while testing.
	window.kdnaGsap = {
		version: cfg.version || null,
		registerEffect: registerEffect,
		init: init,
		reinit: reinit,
		teardownStale: teardownStale,
		buildEffectsIn: buildEffectsIn,
		recomputeAll: recomputeAll,
		isMobile: isMobile,
		diagnose: diagnose,
		getDefaults: function () { return defaults; },
		getSettings: function () { return settings; },
		getEffects: function () { return effects; },
		getEntries: function () { return entries; }
	};

	// --- Start -------------------------------------------------------------

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})(window, document);
