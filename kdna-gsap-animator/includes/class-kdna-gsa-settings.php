<?php
// Stop anyone loading this file directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Builds the Settings page under Settings > KDNA GSAP Animator, where every
 * value that shapes the three effects can be tuned without touching code. The
 * defaults match the brief, so the page works out of the box.
 */
class KDNA_GSA_Settings {

	const GROUP    = 'kdna_gsap_animator_group';
	const OPTION   = 'kdna_gsap_animator_options';
	const PAGE     = 'kdna-gsap-animator';

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
	}

	/**
	 * Add the menu item under the Settings menu.
	 */
	public function add_menu() {
		add_options_page(
			__( 'KDNA GSAP Animator', 'kdna-gsap-animator' ),
			__( 'KDNA GSAP Animator', 'kdna-gsap-animator' ),
			'manage_options',
			self::PAGE,
			array( $this, 'render_page' )
		);
	}

	/**
	 * Register the single option array and its sanitiser.
	 */
	public function register_settings() {
		register_setting(
			self::GROUP,
			self::OPTION,
			array( $this, 'sanitise' )
		);
	}

	/**
	 * Clean every incoming value before it is saved. Numbers are kept as numbers,
	 * the ScrollTrigger position strings and the ease are kept as plain text, and
	 * the column offsets are tidied to a comma-separated list of numbers.
	 */
	public function sanitise( $input ) {

		$d   = kdna_gsap_default_options();
		$in  = is_array( $input ) ? $input : array();
		$out = array();

		// Where to run and how loud to be.
		$out['post_types'] = sanitize_text_field( isset( $in['post_types'] ) && '' !== trim( $in['post_types'] ) ? $in['post_types'] : $d['post_types'] );
		$out['debug']      = empty( $in['debug'] ) ? 0 : 1;

		// Shared engine values.
		$out['mobile_breakpoint']      = max( 320, absint( isset( $in['mobile_breakpoint'] ) ? $in['mobile_breakpoint'] : $d['mobile_breakpoint'] ) );
		$out['mobile_reference_width'] = min( 4000, absint( isset( $in['mobile_reference_width'] ) ? $in['mobile_reference_width'] : $d['mobile_reference_width'] ) );
		$out['smoothing']              = $this->clean_float( isset( $in['smoothing'] ) ? $in['smoothing'] : $d['smoothing'], 0, 10 );
		$out['ease']                   = sanitize_text_field( isset( $in['ease'] ) && '' !== trim( $in['ease'] ) ? $in['ease'] : $d['ease'] );

		// Pinned effects.
		$pt = isset( $in['pin_type'] ) ? $in['pin_type'] : $d['pin_type'];
		$out['pin_type']               = in_array( $pt, array( 'auto', 'fixed', 'transform' ), true ) ? $pt : 'auto';
		$out['pin_reparent']           = empty( $in['pin_reparent'] ) ? 0 : 1;

		// Effect 1, side-sliding rows.
		$out['e1_left_from']  = $this->clean_float( isset( $in['e1_left_from'] ) ? $in['e1_left_from'] : $d['e1_left_from'], -500, 500 );
		$out['e1_left_to']    = $this->clean_float( isset( $in['e1_left_to'] ) ? $in['e1_left_to'] : $d['e1_left_to'], -500, 500 );
		$out['e1_right_from'] = $this->clean_float( isset( $in['e1_right_from'] ) ? $in['e1_right_from'] : $d['e1_right_from'], -500, 500 );
		$out['e1_right_to']   = $this->clean_float( isset( $in['e1_right_to'] ) ? $in['e1_right_to'] : $d['e1_right_to'], -500, 500 );
		$out['e1_start']      = $this->clean_position( isset( $in['e1_start'] ) ? $in['e1_start'] : $d['e1_start'], $d['e1_start'] );
		$out['e1_end']        = $this->clean_position( isset( $in['e1_end'] ) ? $in['e1_end'] : $d['e1_end'], $d['e1_end'] );

		// Effect 2, image enlarge.
		$out['e2_start']       = $this->clean_position( isset( $in['e2_start'] ) ? $in['e2_start'] : $d['e2_start'], $d['e2_start'] );
		$out['e2_end']         = $this->clean_position( isset( $in['e2_end'] ) ? $in['e2_end'] : $d['e2_end'], $d['e2_end'] );
		$out['e2_outer_scale'] = $this->clean_float( isset( $in['e2_outer_scale'] ) ? $in['e2_outer_scale'] : $d['e2_outer_scale'], 1, 50 );

		// Effect 3, diagonal images.
		$out['e3_start']         = $this->clean_position( isset( $in['e3_start'] ) ? $in['e3_start'] : $d['e3_start'], $d['e3_start'] );
		$out['e3_end']           = $this->clean_position( isset( $in['e3_end'] ) ? $in['e3_end'] : $d['e3_end'], $d['e3_end'] );
		$out['e3_column_travel'] = $this->clean_float( isset( $in['e3_column_travel'] ) ? $in['e3_column_travel'] : $d['e3_column_travel'], -200, 200 );
		$out['e3_feature_start']    = $this->clean_float( isset( $in['e3_feature_start'] ) ? $in['e3_feature_start'] : $d['e3_feature_start'], 0, 1 );
		$out['e3_feature_scale']    = $this->clean_float( isset( $in['e3_feature_scale'] ) ? $in['e3_feature_scale'] : $d['e3_feature_scale'], 1, 50 );
		$out['e3_feature_x']        = $this->clean_float( isset( $in['e3_feature_x'] ) ? $in['e3_feature_x'] : $d['e3_feature_x'], -500, 500 );
		$out['e3_feature_y']        = $this->clean_float( isset( $in['e3_feature_y'] ) ? $in['e3_feature_y'] : $d['e3_feature_y'], -500, 500 );
		$out['e3_feature_rotation'] = $this->clean_float( isset( $in['e3_feature_rotation'] ) ? $in['e3_feature_rotation'] : $d['e3_feature_rotation'], -360, 360 );
		$out['e3_col_offsets']      = $this->clean_offsets( isset( $in['e3_col_offsets'] ) ? $in['e3_col_offsets'] : $d['e3_col_offsets'], $d['e3_col_offsets'] );

		// Effect 4, parallax.
		$pd = isset( $in['parallax_direction'] ) ? $in['parallax_direction'] : $d['parallax_direction'];
		$out['parallax_direction'] = in_array( $pd, array( 'up', 'down' ), true ) ? $pd : 'up';
		$out['parallax_speed']     = $this->clean_float( isset( $in['parallax_speed'] ) ? $in['parallax_speed'] : $d['parallax_speed'], 0, 20 );

		return $out;
	}

	/**
	 * A float clamped to a sensible range.
	 */
	private function clean_float( $value, $min, $max ) {
		$value = (float) $value;
		if ( $value < $min ) {
			$value = $min;
		}
		if ( $value > $max ) {
			$value = $max;
		}
		return $value;
	}

	/**
	 * A ScrollTrigger position string such as "top 100%", "center -150%" or
	 * "clamp(top 100%)". We keep only characters those strings can contain, so a
	 * value can never carry markup, and fall back to the default if it empties.
	 */
	private function clean_position( $value, $fallback ) {
		$value = trim( (string) $value );
		$value = preg_replace( '/[^a-zA-Z0-9 .,%()+\-]/', '', $value );
		$value = trim( $value );
		return '' === $value ? $fallback : $value;
	}

	/**
	 * A comma-separated list of numbers, tidied back into "n, n, n, n".
	 */
	private function clean_offsets( $value, $fallback ) {
		$parts = array();
		foreach ( explode( ',', (string) $value ) as $part ) {
			$part = trim( $part );
			if ( '' === $part || ! is_numeric( $part ) ) {
				continue;
			}
			$parts[] = (float) $part;
		}
		return empty( $parts ) ? $fallback : implode( ', ', $parts );
	}

	/**
	 * Render the settings page.
	 */
	public function render_page() {

		$o = kdna_gsap_get_options();
		?>
		<div class="wrap kdna-gsap-settings">
			<h1><?php esc_html_e( 'KDNA GSAP Animator', 'kdna-gsap-animator' ); ?></h1>
			<p><?php esc_html_e( 'Tune the three scroll-driven portfolio effects. The defaults match the agreed behaviour, so you can leave everything as it is and adjust from here. Values are shared across every element that carries an effect class.', 'kdna-gsap-animator' ); ?></p>
			<p class="description"><?php esc_html_e( 'After saving, run Elementor > Tools > Regenerate CSS & Data and clear your page cache so the changes show.', 'kdna-gsap-animator' ); ?></p>

			<form method="post" action="options.php">
				<?php settings_fields( self::GROUP ); ?>

				<h2 class="title"><?php esc_html_e( 'General', 'kdna-gsap-animator' ); ?></h2>
				<table class="form-table" role="presentation">

					<tr>
						<th scope="row"><?php esc_html_e( 'Run on post types', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[post_types]" value="<?php echo esc_attr( $o['post_types'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'The post type slug to load the engine on. Separate several with commas. Default: portfolio. The engine still only wires elements that carry an effect class, so loading it does nothing on pages without one.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Debug logging', 'kdna-gsap-animator' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[debug]" value="1" <?php checked( $o['debug'], 1 ); ?> />
								<?php esc_html_e( 'Log detailed engine activity to the browser console', 'kdna-gsap-animator' ); ?>
							</label>
							<p class="description"><?php esc_html_e( 'You can also switch this on per visit by adding ?kdna_debug=1 to the URL. The key init and re-init lines are always logged so the engine can be confirmed.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>
				</table>

				<h2 class="title"><?php esc_html_e( 'Shared engine', 'kdna-gsap-animator' ); ?></h2>
				<table class="form-table" role="presentation">

					<tr>
						<th scope="row"><?php esc_html_e( 'Smoothing', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="0.1" min="0" max="10" name="<?php echo esc_attr( self::OPTION ); ?>[smoothing]" value="<?php echo esc_attr( $o['smoothing'] ); ?>" class="small-text" /> <?php esc_html_e( 'seconds', 'kdna-gsap-animator' ); ?>
							<p class="description"><?php esc_html_e( 'A small scrub smoothing (default 0.3) interpolates between the browser\'s scroll steps on the PINNED effects (image enlarge and diagonal images), removing their stepping. It is a fraction of a second, not a long glide. Set it to 0 for a fully direct, 1:1 link (which can step on a mouse wheel). The side-sliding rows do not use it.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Ease', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[ease]" value="<?php echo esc_attr( $o['ease'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'GSAP ease for the feature pop-out and the image enlarge. Default: sine.inOut (Sine.easeInOut). The side-sliding rows and the diagonal column drift always use a built-in soft landing, so they cannot jerk at the end on a trackpad or Magic Mouse whatever this is set to.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Mobile breakpoint', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" min="320" max="1200" name="<?php echo esc_attr( self::OPTION ); ?>[mobile_breakpoint]" value="<?php echo esc_attr( $o['mobile_breakpoint'] ); ?>" class="small-text" /> px
							<p class="description"><?php esc_html_e( 'At or below this width the whole composition is scaled to the device width with no responsive reflow. Above it, tablet and desktop behave the same.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Desktop reference width', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" min="0" max="4000" name="<?php echo esc_attr( self::OPTION ); ?>[mobile_reference_width]" value="<?php echo esc_attr( $o['mobile_reference_width'] ); ?>" class="small-text" /> px
							<p class="description"><?php esc_html_e( 'The desktop width the composition is scaled down from on mobile, so it keeps its desktop proportions. Use the width your effects were designed at. Default: 1280. Set to 0 to switch the mobile scaling off.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>
				</table>

				<h2 class="title"><?php esc_html_e( 'Pinned effects (image enlarge and diagonal images)', 'kdna-gsap-animator' ); ?></h2>
				<p class="description"><?php esc_html_e( 'These two effects pin the section while they play. If a pinned section jumps, disappears or scrolls from the top at the ends of the pin, an ancestor element on the page (often a theme or Elementor wrapper) has a transform, which breaks the default fixed pinning. Add ?kdna_debug=1 to the page and check the console: the pin diagnostic names the element. The options below resolve it without editing the page.', 'kdna-gsap-animator' ); ?></p>
				<table class="form-table" role="presentation">

					<tr>
						<th scope="row"><?php esc_html_e( 'Pin type', 'kdna-gsap-animator' ); ?></th>
						<td>
							<select name="<?php echo esc_attr( self::OPTION ); ?>[pin_type]">
								<option value="auto" <?php selected( $o['pin_type'], 'auto' ); ?>><?php esc_html_e( 'Auto (recommended)', 'kdna-gsap-animator' ); ?></option>
								<option value="fixed" <?php selected( $o['pin_type'], 'fixed' ); ?>><?php esc_html_e( 'Fixed', 'kdna-gsap-animator' ); ?></option>
								<option value="transform" <?php selected( $o['pin_type'], 'transform' ); ?>><?php esc_html_e( 'Transform', 'kdna-gsap-animator' ); ?></option>
							</select>
							<p class="description"><?php esc_html_e( 'Auto switches to transform pinning when it detects a transformed ancestor (the usual cause of a pinned section jumping or disappearing), and uses fixed otherwise. Force Transform if a jump remains, or Fixed to keep the classic behaviour.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Reparent pins', 'kdna-gsap-animator' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[pin_reparent]" value="1" <?php checked( $o['pin_reparent'], 1 ); ?> />
								<?php esc_html_e( 'Move the pinned section to the page body while it is pinned', 'kdna-gsap-animator' ); ?>
							</label>
							<p class="description"><?php esc_html_e( 'A last resort if Transform pinning is not enough. It escapes a transformed ancestor completely, but the section briefly leaves its styling context, so check the look. Leave off unless needed.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>
				</table>

				<h2 class="title"><?php esc_html_e( 'Effect 1, side-sliding rows', 'kdna-gsap-animator' ); ?></h2>
				<p class="description"><?php esc_html_e( 'Targets imgSliderLeft (top row) and imgSliderRight (bottom row). Not pinned. The rows drift sideways in opposite directions as the page scrolls.', 'kdna-gsap-animator' ); ?></p>
				<table class="form-table" role="presentation">

					<tr>
						<th scope="row"><?php esc_html_e( 'Left row travel (from / to)', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="1" name="<?php echo esc_attr( self::OPTION ); ?>[e1_left_from]" value="<?php echo esc_attr( $o['e1_left_from'] ); ?>" class="small-text" />
							<input type="number" step="1" name="<?php echo esc_attr( self::OPTION ); ?>[e1_left_to]" value="<?php echo esc_attr( $o['e1_left_to'] ); ?>" class="small-text" />
							<span class="description"><?php esc_html_e( 'imgSliderLeft translateX, per cent. Default: 0 to -25.', 'kdna-gsap-animator' ); ?></span>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Right row travel (from / to)', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="1" name="<?php echo esc_attr( self::OPTION ); ?>[e1_right_from]" value="<?php echo esc_attr( $o['e1_right_from'] ); ?>" class="small-text" />
							<input type="number" step="1" name="<?php echo esc_attr( self::OPTION ); ?>[e1_right_to]" value="<?php echo esc_attr( $o['e1_right_to'] ); ?>" class="small-text" />
							<span class="description"><?php esc_html_e( 'imgSliderRight translateX, per cent. Default: 0 to 20.', 'kdna-gsap-animator' ); ?></span>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Trigger start', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[e1_start]" value="<?php echo esc_attr( $o['e1_start'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'ScrollTrigger start. Default: clamp(top 100%), the row begins moving when its top reaches the bottom of the viewport, with the start clamped.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Trigger end', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[e1_end]" value="<?php echo esc_attr( $o['e1_end'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'ScrollTrigger end. Default: bottom -60%, the row finishes when its bottom is 60 per cent past the top.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>
				</table>

				<h2 class="title"><?php esc_html_e( 'Effect 2, image enlarge', 'kdna-gsap-animator' ); ?></h2>
				<p class="description"><?php esc_html_e( 'Pins gridEnlarge. The centre image (imgEnlarge) grows to fill the screen while the seven outer images (imgGrow1 to imgGrow7) scale up and fly outward together.', 'kdna-gsap-animator' ); ?></p>
				<table class="form-table" role="presentation">

					<tr>
						<th scope="row"><?php esc_html_e( 'Pin start', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[e2_start]" value="<?php echo esc_attr( $o['e2_start'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'ScrollTrigger start. Default: center 50%.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Pin end', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[e2_end]" value="<?php echo esc_attr( $o['e2_end'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'ScrollTrigger end. Default: center -150%, roughly two screen-heights of pin.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Outer image scale', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="0.1" min="1" max="50" name="<?php echo esc_attr( self::OPTION ); ?>[e2_outer_scale]" value="<?php echo esc_attr( $o['e2_outer_scale'] ); ?>" class="small-text" />
							<p class="description"><?php esc_html_e( 'How much the seven outer images scale as they fly out. Reference value: 4.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>
				</table>

				<h2 class="title"><?php esc_html_e( 'Effect 3, diagonal images', 'kdna-gsap-animator' ); ?></h2>
				<p class="description"><?php esc_html_e( 'Pins diagImgs. The four columns (diag1 to diag4) drift vertically in alternation while the feature image (diagGrow) pops out, rotates to horizontal and fills the screen. The diagonal layout itself is built in Elementor; the plugin only animates it.', 'kdna-gsap-animator' ); ?></p>
				<table class="form-table" role="presentation">

					<tr>
						<th scope="row"><?php esc_html_e( 'Pin start', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[e3_start]" value="<?php echo esc_attr( $o['e3_start'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'ScrollTrigger start. Default: top -1px.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Pin end', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[e3_end]" value="<?php echo esc_attr( $o['e3_end'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'ScrollTrigger end. Default: top -100%, roughly one screen-height of pin.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Column travel', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="1" name="<?php echo esc_attr( self::OPTION ); ?>[e3_column_travel]" value="<?php echo esc_attr( $o['e3_column_travel'] ); ?>" class="small-text" /> %
							<p class="description"><?php esc_html_e( 'Vertical travel per column, alternating direction by column order. Reference value: 18.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Feature start point', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="0.05" min="0" max="1" name="<?php echo esc_attr( self::OPTION ); ?>[e3_feature_start]" value="<?php echo esc_attr( $o['e3_feature_start'] ); ?>" class="small-text" />
							<p class="description"><?php esc_html_e( 'Where the feature pop-out begins, as a fraction of the pin from 0 to 1. Default: 0.5, about halfway.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Feature scale', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="0.1" min="1" max="50" name="<?php echo esc_attr( self::OPTION ); ?>[e3_feature_scale]" value="<?php echo esc_attr( $o['e3_feature_scale'] ); ?>" class="small-text" />
							<p class="description"><?php esc_html_e( 'How much the feature image scales as it fills the screen. Reference value: 3.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Feature pop position (X / Y)', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="1" name="<?php echo esc_attr( self::OPTION ); ?>[e3_feature_x]" value="<?php echo esc_attr( $o['e3_feature_x'] ); ?>" class="small-text" /> %
							<input type="number" step="1" name="<?php echo esc_attr( self::OPTION ); ?>[e3_feature_y]" value="<?php echo esc_attr( $o['e3_feature_y'] ); ?>" class="small-text" /> %
							<p class="description"><?php esc_html_e( 'Where the feature ends up, as a per cent of its own width and height (the same translate MotionPage used). Defaults: 44 and 179. Increase Y to move it further down, X to move it right.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Feature rotation', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="1" min="-360" max="360" name="<?php echo esc_attr( self::OPTION ); ?>[e3_feature_rotation]" value="<?php echo esc_attr( $o['e3_feature_rotation'] ); ?>" class="small-text" /> °
							<p class="description"><?php esc_html_e( 'Degrees the feature rotates to as it pops out, to straighten it from the diagonal. Default: 30 (the MotionPage value). Use 0 to keep its current angle.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Column resting offsets', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[e3_col_offsets]" value="<?php echo esc_attr( $o['e3_col_offsets'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'Start offsets that stagger the columns at rest, per cent, one per column, comma separated. Default: 0, 0, 0, 0.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>
				</table>

				<h2 class="title"><?php esc_html_e( 'Effect 4, vertical-scroll parallax', 'kdna-gsap-animator' ); ?></h2>
				<p class="description"><?php esc_html_e( 'A pin-safe replacement for Elementor\'s Vertical Scroll motion effect. Turn the Elementor effect off, then add the class kdnaParallax to the widget you want to drift as the page scrolls. Do not add it to a pinned section (image enlarge or diagonal) or anything that contains one; a parallax and a pin on the same element fight each other. You can override these per element with data-kdna-parallax-direction and data-kdna-parallax-speed attributes.', 'kdna-gsap-animator' ); ?></p>
				<table class="form-table" role="presentation">

					<tr>
						<th scope="row"><?php esc_html_e( 'Direction', 'kdna-gsap-animator' ); ?></th>
						<td>
							<select name="<?php echo esc_attr( self::OPTION ); ?>[parallax_direction]">
								<option value="up" <?php selected( $o['parallax_direction'], 'up' ); ?>><?php esc_html_e( 'Up', 'kdna-gsap-animator' ); ?></option>
								<option value="down" <?php selected( $o['parallax_direction'], 'down' ); ?>><?php esc_html_e( 'Down', 'kdna-gsap-animator' ); ?></option>
							</select>
							<p class="description"><?php esc_html_e( 'Up: the element drifts upward as the page scrolls down (the usual parallax). Default: Up.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Speed', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" step="0.5" min="0" max="20" name="<?php echo esc_attr( self::OPTION ); ?>[parallax_speed]" value="<?php echo esc_attr( $o['parallax_speed'] ); ?>" class="small-text" />
							<p class="description"><?php esc_html_e( 'How far it drifts, on the same scale as Elementor. Default: 4. Raise or lower to match the look you had.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>
				</table>

				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
