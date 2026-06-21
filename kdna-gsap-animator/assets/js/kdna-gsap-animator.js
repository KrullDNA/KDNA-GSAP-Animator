/**
 * KDNA GSAP Animator, the engine.
 *
 * Stage 2: the shared re-init engine plus Effect 1, the side-sliding rows.
 * The engine handles the life cycle: register effects on first load, re-register
 * them on content the seamless scroll injects, tear down stale triggers when
 * content leaves, and recompute on resize. The effects plug into this by calling
 * registerEffect(); Effects 2 and 3 are added in Stages 3 and 4.
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

	// Quieten missing-target warnings (an element can leave the page mid-scroll on
	// a seamless page) and stop ScrollTrigger refreshing on the mobile address bar
	// showing and hiding, which would fight the no-reflow mobile rule.
	gsap.config({ nullTargetWarn: false });
	ScrollTrigger.config({ ignoreMobileResize: true });

	// --- Shared defaults ---------------------------------------------------

	// The values every effect inherits unless it overrides them. scrub is the
	// smoothing: a number means that many seconds of catch-up after the scroll
	// stops, which is the gentle glide the brief asks for.
	var defaults = {
		scrub: (typeof settings.smoothing === 'number') ? settings.smoothing : 1,
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

	// --- Re-init -----------------------------------------------------------

	// The core re-init used for injected content: drop stale triggers, wire the
	// new content only, then schedule one refresh.
	function reinit(root, reason) {
		teardownStale();
		var built = buildEffectsIn(root || document);
		scheduleRefresh();
		note('Re-init (' + (reason || 'manual') + '): ' + built + ' new effect instance(s).');
		return built;
	}

	// --- First load --------------------------------------------------------

	var started = false;
	function init() {
		if (started) {
			return;
		}
		started = true;

		// Re-apply the mobile scaling and any effect recompute at the start of every
		// refresh (first load, image load, resize and our own refreshes), so
		// ScrollTrigger always measures the up-to-date, correctly scaled geometry.
		ScrollTrigger.addEventListener('refreshInit', recomputeAll);

		var built = buildEffectsIn(document);
		scheduleRefresh(0);

		note('Engine initialised (v' + (cfg.version || '?') + '). Effects registered: ' +
			effects.length + ', instances built: ' + built + '.');

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
				if (w === lastWidth) {
					return; // height-only change, ignore
				}
				lastWidth = w;
				ScrollTrigger.refresh();
				log('Resize (width changed to ' + w + '): refreshed.');
			}, 200);
		}, { passive: true });
	}

	function recomputeAll() {
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
				// About one second of smoothing, so the motion glides on after the
				// scroll stops rather than stopping dead.
				scrub: ( typeof d.scrub === 'number' ) ? d.scrub : 1,
				// Re-measure on every refresh, which covers injected content and resize.
				invalidateOnRefresh: true
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
