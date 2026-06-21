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
		$out['mobile_breakpoint'] = max( 320, absint( isset( $in['mobile_breakpoint'] ) ? $in['mobile_breakpoint'] : $d['mobile_breakpoint'] ) );
		$out['smoothing']         = $this->clean_float( isset( $in['smoothing'] ) ? $in['smoothing'] : $d['smoothing'], 0, 10 );
		$out['ease']              = sanitize_text_field( isset( $in['ease'] ) && '' !== trim( $in['ease'] ) ? $in['ease'] : $d['ease'] );

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
		$out['e3_feature_start'] = $this->clean_float( isset( $in['e3_feature_start'] ) ? $in['e3_feature_start'] : $d['e3_feature_start'], 0, 1 );
		$out['e3_feature_scale'] = $this->clean_float( isset( $in['e3_feature_scale'] ) ? $in['e3_feature_scale'] : $d['e3_feature_scale'], 1, 50 );
		$out['e3_col_offsets']   = $this->clean_offsets( isset( $in['e3_col_offsets'] ) ? $in['e3_col_offsets'] : $d['e3_col_offsets'], $d['e3_col_offsets'] );

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
							<p class="description"><?php esc_html_e( 'How long the motion keeps gliding after the scroll stops. About one second is the agreed default.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Ease', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[ease]" value="<?php echo esc_attr( $o['ease'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'GSAP ease applied across all effects. Default: sine.inOut (Sine.easeInOut).', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php esc_html_e( 'Mobile breakpoint', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="number" min="320" max="1200" name="<?php echo esc_attr( self::OPTION ); ?>[mobile_breakpoint]" value="<?php echo esc_attr( $o['mobile_breakpoint'] ); ?>" class="small-text" /> px
							<p class="description"><?php esc_html_e( 'At or below this width the whole composition is scaled to the device width with no responsive reflow. Above it, tablet and desktop behave the same.', 'kdna-gsap-animator' ); ?></p>
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
						<th scope="row"><?php esc_html_e( 'Column resting offsets', 'kdna-gsap-animator' ); ?></th>
						<td>
							<input type="text" name="<?php echo esc_attr( self::OPTION ); ?>[e3_col_offsets]" value="<?php echo esc_attr( $o['e3_col_offsets'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'Start offsets that stagger the columns at rest, per cent, one per column, comma separated. Default: 0, 0, 0, 0.', 'kdna-gsap-animator' ); ?></p>
						</td>
					</tr>
				</table>

				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
