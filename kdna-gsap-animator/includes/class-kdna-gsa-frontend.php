<?php
// Stop anyone loading this file directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handles the front end: deciding when to run, loading GSAP, ScrollTrigger and
 * the engine, and passing the settings through to the JavaScript. Assets load
 * only where they are wanted (portfolio templates by default), and the engine
 * then self-limits to pages that actually contain an effect class, so nothing
 * is wired up where there is no effect to run.
 */
class KDNA_GSA_Frontend {

	public function __construct() {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	/**
	 * The class names each effect targets. Kept in one place so PHP and the
	 * engine agree, and so the conditional loading and the client-side scan use
	 * the same list. Existing names are preserved, nothing needs re-tagging.
	 */
	public function effect_classes() {
		return array(
			// Effect 1, side-sliding rows.
			'imgSliderLeft',
			'imgSliderRight',
			// Effect 2, image enlarge.
			'gridEnlarge',
			'imgEnlarge',
			'imgGrow1', 'imgGrow2', 'imgGrow3', 'imgGrow4', 'imgGrow5', 'imgGrow6', 'imgGrow7',
			// Effect 3, diagonal images.
			'diagImgs',
			'diag1', 'diag2', 'diag3', 'diag4',
			'diagGrow',
		);
	}

	/**
	 * Which post type(s) the animator runs on, taken from the settings and still
	 * filterable for anyone who prefers code.
	 */
	private function get_post_types() {
		$opts  = kdna_gsap_get_options();
		$types = array_filter( array_map( 'trim', explode( ',', (string) $opts['post_types'] ) ) );
		if ( empty( $types ) ) {
			$types = array( 'portfolio' );
		}
		return apply_filters( 'kdna_gsap_post_types', $types );
	}

	/**
	 * Should the engine load on this request? By default it loads on single
	 * pages of the configured post types (the portfolio templates the effects
	 * live on, and the same pages the seamless scroll runs on). The result is
	 * filterable so the engine can be forced on, or off, anywhere.
	 */
	public function should_enqueue() {
		$load = is_singular( $this->get_post_types() );
		return (bool) apply_filters( 'kdna_gsap_should_enqueue', $load );
	}

	/**
	 * Load GSAP, ScrollTrigger, the engine and the stylesheet, but only where
	 * wanted, never site wide.
	 */
	public function enqueue_assets() {

		if ( ! $this->should_enqueue() ) {
			return;
		}

		// GSAP core, bundled locally so the plugin is self-contained.
		wp_enqueue_script(
			'kdna-gsap-gsap',
			KDNA_GSAP_URL . 'assets/js/gsap.min.js',
			array(),
			KDNA_GSAP_VERSION,
			true
		);

		// ScrollTrigger, depends on GSAP core.
		wp_enqueue_script(
			'kdna-gsap-scrolltrigger',
			KDNA_GSAP_URL . 'assets/js/ScrollTrigger.min.js',
			array( 'kdna-gsap-gsap' ),
			KDNA_GSAP_VERSION,
			true
		);

		// The engine itself, depends on ScrollTrigger (and so on GSAP).
		wp_enqueue_script(
			'kdna-gsap-animator',
			KDNA_GSAP_URL . 'assets/js/kdna-gsap-animator.js',
			array( 'kdna-gsap-scrolltrigger' ),
			KDNA_GSAP_VERSION,
			true
		);

		// Mobile scale-to-width and clipping helpers.
		wp_enqueue_style(
			'kdna-gsap-animator',
			KDNA_GSAP_URL . 'assets/css/kdna-gsap-animator.css',
			array(),
			KDNA_GSAP_VERSION
		);

		// Pass the settings through to the JavaScript.
		wp_localize_script( 'kdna-gsap-animator', 'KDNA_GSAP', $this->build_js_config() );
	}

	/**
	 * Build the object handed to the engine: the shared values, each effect's
	 * tunable values, the effect class list, and a debug flag.
	 */
	private function build_js_config() {

		$o = kdna_gsap_get_options();

		return array(
			'version'          => KDNA_GSAP_VERSION,
			'debug'            => ! empty( $o['debug'] ) || isset( $_GET['kdna_debug'] ),
			'effectClasses'    => $this->effect_classes(),
			// The seamless scroll uses these to find the content wrapper; the
			// engine uses them to place its MutationObserver fallback.
			'contentSelectors' => apply_filters(
				'kdna_gsap_content_selectors',
				array( '.elementor-location-single', 'main .elementor', 'main', '#content' )
			),
			'settings'         => array(

				// Shared engine values.
				'smoothing'        => (float) $o['smoothing'],
				'ease'             => (string) $o['ease'],
				'mobileBreakpoint' => (int) $o['mobile_breakpoint'],

				// Effect 1, side-sliding rows.
				'effect1' => array(
					'leftFrom'  => (float) $o['e1_left_from'],
					'leftTo'    => (float) $o['e1_left_to'],
					'rightFrom' => (float) $o['e1_right_from'],
					'rightTo'   => (float) $o['e1_right_to'],
					'start'     => (string) $o['e1_start'],
					'end'       => (string) $o['e1_end'],
				),

				// Effect 2, image enlarge.
				'effect2' => array(
					'start'      => (string) $o['e2_start'],
					'end'        => (string) $o['e2_end'],
					'outerScale' => (float) $o['e2_outer_scale'],
				),

				// Effect 3, diagonal images.
				'effect3' => array(
					'start'        => (string) $o['e3_start'],
					'end'          => (string) $o['e3_end'],
					'columnTravel' => (float) $o['e3_column_travel'],
					'featureStart' => (float) $o['e3_feature_start'],
					'featureScale' => (float) $o['e3_feature_scale'],
					'colOffsets'   => $this->parse_offsets( $o['e3_col_offsets'] ),
				),
			),
		);
	}

	/**
	 * Turn the comma-separated column offsets string into an array of numbers.
	 */
	private function parse_offsets( $raw ) {
		$out = array();
		foreach ( explode( ',', (string) $raw ) as $part ) {
			$part = trim( $part );
			if ( '' === $part ) {
				continue;
			}
			$out[] = (float) $part;
		}
		return $out;
	}
}
