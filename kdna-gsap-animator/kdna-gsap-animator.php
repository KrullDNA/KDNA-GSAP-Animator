<?php
/**
 * Plugin Name: KDNA GSAP Animator
 * Description: Runs KDNA's scroll-driven portfolio animations on GSAP and ScrollTrigger. Built to rebuild itself when fresh projects are injected by the KDNA Seamless Portfolio Scroll, so every effect fires on AJAX-loaded content as well as on first load. Three effects: side-sliding rows, image enlarge and diagonal images, all tuned from one settings page.
 * Version: 1.5.6
 * Author: Krull Design & Advertising
 * Text Domain: kdna-gsap-animator
 */

// Stop anyone loading this file directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Handy constants used across the plugin.
define( 'KDNA_GSAP_VERSION', '1.5.6' );
define( 'KDNA_GSAP_FILE', __FILE__ );
define( 'KDNA_GSAP_PATH', plugin_dir_path( __FILE__ ) );
define( 'KDNA_GSAP_URL', plugin_dir_url( __FILE__ ) );

/**
 * The default settings. These are used until anything is saved on the Settings
 * page, and as a fallback for any missing values. Defaults match the behaviour
 * described in the brief, so the plugin works out of the box and is tuned from
 * there. All three effects are listed even though the effects themselves are
 * added in later stages, so the settings are ready for them.
 */
function kdna_gsap_default_options() {
	return array(

		// Where to run and how loud to be.
		'post_types'        => 'portfolio', // single pages of these post types load the engine
		'debug'             => 0,           // extra console logging (also on with ?kdna_debug=1)

		// Shared engine values.
		'mobile_breakpoint'      => 767,         // phone breakpoint in px; at or below this we scale to width
		'mobile_reference_width' => 1280,        // desktop width the composition is scaled down from on mobile (0 turns the scaling off)
		'smoothing'              => 1,           // scrub smoothing in seconds; about one second glides after the scroll stops
		'ease'                   => 'sine.inOut', // GSAP ease, the brief default is Sine.easeInOut

		// Pinned effects (image enlarge and diagonal images).
		'pin_type'               => 'auto',      // auto, fixed or transform; auto uses transform pinning when a transformed ancestor would break fixed pinning
		'pin_reparent'           => 0,           // move the pinned element to the body during the pin, to escape a transformed ancestor

		// Effect 1, side-sliding image rows (imgSliderLeft, imgSliderRight).
		'e1_left_from'      => 0,                 // imgSliderLeft start translateX, per cent
		'e1_left_to'        => -25,               // imgSliderLeft end translateX, per cent
		'e1_right_from'     => 0,                 // imgSliderRight start translateX, per cent
		'e1_right_to'       => 20,                // imgSliderRight end translateX, per cent
		'e1_start'          => 'clamp(top 100%)', // starts when the row top reaches the bottom of the viewport, start clamp on
		'e1_end'            => 'bottom -60%',     // ends when the row bottom is 60 per cent past the top, end clamp off

		// Effect 2, image enlarge / grid expand (gridEnlarge, imgEnlarge, imgGrow1 to imgGrow7).
		'e2_start'          => 'center 50%',   // pin starts with the grid centre at 50 per cent of the viewport
		'e2_end'            => 'center -150%', // pin ends with the grid centre at -150 per cent, about two screens of pin
		'e2_outer_scale'    => 4,              // reference scale for the seven outer images as they fly out

		// Effect 3, diagonal images (diagImgs, diag1 to diag4, diagGrow).
		'e3_start'          => 'top -1px',   // pin starts with the container top at -1px
		'e3_end'            => 'top -100%',  // pin ends with the container top at -100 per cent, about one screen of pin
		'e3_column_travel'  => 18,           // vertical travel per column, per cent, alternating by column order
		'e3_feature_start'      => 0.5,          // where the feature pop-out begins, as a fraction of the pin (0 to 1)
		'e3_feature_scale'      => 3,            // reference scale for the feature image as it fills the screen
		'e3_feature_straighten' => 1,            // counter-rotate the feature by its ancestors' angle so it ends truly horizontal
		'e3_col_offsets'        => '0, 0, 0, 0', // resting start offsets that stagger the columns, per cent, one per column
	);
}

/**
 * Get the saved settings merged over the defaults, so every key is always present.
 */
function kdna_gsap_get_options() {
	$saved = get_option( 'kdna_gsap_animator_options', array() );
	if ( ! is_array( $saved ) ) {
		$saved = array();
	}
	return wp_parse_args( $saved, kdna_gsap_default_options() );
}

// Load the plugin classes.
require_once KDNA_GSAP_PATH . 'includes/class-kdna-gsa-frontend.php';
require_once KDNA_GSAP_PATH . 'includes/class-kdna-gsa-settings.php';

// Start the plugin once WordPress has loaded all plugins.
add_action( 'plugins_loaded', function () {
	new KDNA_GSA_Frontend();
	new KDNA_GSA_Settings();
} );

// Add a "Settings" link on the Plugins screen for convenience.
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), function ( $links ) {
	$url  = admin_url( 'options-general.php?page=kdna-gsap-animator' );
	$link = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'kdna-gsap-animator' ) . '</a>';
	array_unshift( $links, $link );
	return $links;
} );
