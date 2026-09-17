<?php
/**
 * Plugin Name: Commerce headless bridge
 * Description: Sends shoppers back to the headless storefront after a redirect payment gateway (Viva.com, bank gateways, PayPal…) and keeps them off the WordPress storefront pages.
 * Version: 1.1.0
 *
 * Install: copy this file to wp-content/mu-plugins/ (loads automatically) and add to wp-config.php:
 *
 *   define( 'COMMERCE_SITE_URL', 'https://www.client.gr' );
 *
 * The storefront endpoint /commerce/return reads the order from the shopper's cookie
 * and shows the order page in their language.
 */

defined( 'ABSPATH' ) || exit;

if ( ! defined( 'COMMERCE_SITE_URL' ) ) {
	return;
}

function commerce_bridge_return_url( array $args = array() ) {
	return add_query_arg( $args, untrailingslashit( COMMERCE_SITE_URL ) . '/commerce/return' );
}

// Gateways redirect with wp_safe_redirect(), which only allows known hosts.
add_filter(
	'allowed_redirect_hosts',
	function ( $hosts ) {
		$hosts[] = wp_parse_url( COMMERCE_SITE_URL, PHP_URL_HOST );
		return $hosts;
	}
);

// Every gateway returns the shopper to the "order received" URL after paying.
add_filter(
	'woocommerce_get_checkout_order_received_url',
	function ( $url, $order ) {
		return commerce_bridge_return_url( array( 'order' => $order->get_id(), 'key' => $order->get_order_key() ) );
	},
	10,
	2
);

// Shoppers only reach WordPress's cart or checkout when a payment failed or was cancelled
// (gateways send them "back to checkout", or to the "pay for order" form). The order-pay
// step that forwards to the gateway (no pay_for_order) stays on WordPress.
add_action(
	'template_redirect',
	function () {
		if ( ! function_exists( 'is_checkout' ) || is_wc_endpoint_url( 'order-received' ) ) {
			return;
		}
		if ( is_wc_endpoint_url( 'order-pay' ) ) {
			// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only routing.
			$order_id = absint( get_query_var( 'order-pay' ) );
			if ( isset( $_GET['pay_for_order'] ) ) {
				wc_clear_notices();
				wp_safe_redirect( commerce_bridge_return_url( array( 'payment' => 'failed', 'order' => $order_id ) ) );
				exit;
			}
			// Some gateways (e.g. Piraeus ePay) print an error on this page when they can't
			// start the payment. Headers are already sent by then, so send the shopper back
			// from the page itself.
			$order = wc_get_order( $order_id );
			if ( $order ) {
				add_action(
					'woocommerce_receipt_' . $order->get_payment_method(),
					function ( $receipt_order_id ) {
						$receipt_order = wc_get_order( $receipt_order_id );
						if ( $receipt_order && $receipt_order->has_status( array( 'failed', 'cancelled' ) ) ) {
							$url = commerce_bridge_return_url( array( 'payment' => 'failed', 'order' => $receipt_order->get_id() ) );
							echo '<meta http-equiv="refresh" content="0;url=' . esc_url( $url ) . '">';
						}
					},
					999
				);
			}
			return;
		}
		if ( is_checkout() || is_cart() ) {
			wc_clear_notices();
			wp_safe_redirect( commerce_bridge_return_url( array( 'payment' => 'failed' ) ) );
			exit;
		}
	},
	1
);
