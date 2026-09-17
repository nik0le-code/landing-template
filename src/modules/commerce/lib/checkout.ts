/** Native checkout: form parsing, validation and the order-confirmation cookie. */
import type { AstroCookies } from "astro";
import { siteConfig } from "@site-config";
import { isLocale } from "@/i18n";
import { consume } from "@/lib/rate-limit";
import { translateModule } from "@/modules/registry";
import { cookieDefaults, forgetCart, sessionFrom, storeSession, type RequestContext } from "./cart";
import { cartPath, commerceOptions, decodeEntities } from "./format";
import { getCommerce } from "./provider";
import type { Address, CheckoutState, CheckoutStateResponse, CommerceProvider, PlacedOrder } from "./types";

export const ORDER_COOKIE = "commerce_order";

const ADDRESS_FIELDS = ["first_name", "last_name", "company", "address_1", "address_2", "city", "state", "postcode", "country", "phone", "email"] as const;
const REQUIRED: (keyof Address)[] = ["first_name", "last_name", "address_1", "city", "postcode", "country"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emptyAddress = (): Address => Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, ""])) as unknown as Address;

export interface CheckoutForm {
  shipping: Address;
  billing: Address;
  billingSame: boolean;
  paymentMethod: string;
  /** "packageId|rateId" */
  shippingRate: string;
  note: string;
}

/**
 * Field names: `email`, `phone`, `ship_<field>` and `bill_<field>`. With
 * "billing same as delivery" ticked, billing copies the delivery address.
 */
export function checkoutFromForm(data: FormData): CheckoutForm {
  const text = (name: string, max = 200) => String(data.get(name) ?? "").trim().slice(0, max);
  const read = (prefix: string): Address => {
    const address = emptyAddress();
    for (const field of ADDRESS_FIELDS) if (field !== "email" && field !== "phone") address[field] = text(`${prefix}${field}`);
    address.email = text("email");
    address.phone = text("phone", 40);
    address.country = address.country.toUpperCase();
    return address;
  };
  const shipping = read("ship_");
  const billingSame = data.has("billing_same");
  return {
    shipping,
    billing: billingSame ? { ...shipping } : read("bill_"),
    billingSame,
    paymentMethod: text("payment_method", 60),
    shippingRate: text("shipping_rate", 120),
    note: text("note", 1000),
  };
}

/** Field errors as translation keys (`checkout.errors.*`), keyed by form field name. */
export function validateCheckout(
  form: CheckoutForm,
  { countries, paymentMethods }: { countries: string[]; paymentMethods: string[] },
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!EMAIL.test(form.shipping.email)) errors.email = form.shipping.email ? "invalidEmail" : "required";
  if (form.shipping.phone.replace(/[^\d]/g, "").length < 7) errors.phone = form.shipping.phone ? "invalidPhone" : "required";
  const check = (address: Address, prefix: string) => {
    for (const field of REQUIRED) if (!address[field]) errors[`${prefix}${field}`] = "required";
    if (address.country && !countries.includes(address.country)) errors[`${prefix}country`] = "invalidCountry";
  };
  check(form.shipping, "ship_");
  if (!form.billingSame) check(form.billing, "bill_");
  if (!paymentMethods.includes(form.paymentMethod)) errors.payment_method = "required";
  return errors;
}

export function rememberOrder(cookies: AstroCookies, url: URL, order: PlacedOrder) {
  // Lets this browser (and only it) show the order details on the confirmation page.
  cookies.set(ORDER_COOKIE, JSON.stringify(order), { ...cookieDefaults(url), httpOnly: true, maxAge: 60 * 60 * 24 });
}

export function readRememberedOrder(cookies: AstroCookies): PlacedOrder | null {
  try {
    const value = JSON.parse(cookies.get(ORDER_COOKIE)?.value ?? "") as Partial<PlacedOrder>;
    return typeof value.id === "string" && typeof value.key === "string" && typeof value.email === "string"
      ? ({ paymentUrl: null, ...value, lang: isLocale(value.lang) ? value.lang : siteConfig.defaultLocale } as PlacedOrder)
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- request handling

export type CheckoutOutcome =
  | { redirect: string }
  | { status: number; state: CheckoutState; submitted: CheckoutForm | null; fieldErrors: Record<string, string>; formError: string | null };

/**
 * GET: the checkout state. POST intent=address: save the address (and chosen rate)
 * so shipping is recalculated. POST intent=place: validate and place the order.
 */
export async function runCheckout({ context, request }: { context: RequestContext; request: Request }): Promise<CheckoutOutcome> {
  const { lang } = context;
  const t = (key: string) => translateModule(lang, "commerce", key);
  const failed = { redirect: `${cartPath(lang)}?cart_error=backend` };

  let commerce: CommerceProvider;
  try {
    commerce = await getCommerce();
  } catch (error) {
    console.error("[commerce] checkout:", error);
    return failed;
  }

  const session = sessionFrom(context);
  if (!session.token) return { redirect: cartPath(lang) };

  if (commerce.checkout.kind === "hosted") {
    const url = await commerce.checkout.url(session).catch((error: unknown) => {
      console.error("[commerce] checkout:", error);
      return null;
    });
    return url ? { redirect: url } : failed;
  }

  const checkout = commerce.checkout;
  const { countries } = commerceOptions();
  let submitted: CheckoutForm | null = null;
  let fieldErrors: Record<string, string> = {};
  let formError: string | null = null;
  let state: CheckoutState | null = null;
  const remember = (response: CheckoutStateResponse) => storeSession(context, { token: response.token, cart: response.state?.cart });

  if (request.method === "POST") {
    const data = await request.formData().catch(() => new FormData());
    const intent = String(data.get("intent") ?? "address");
    submitted = checkoutFromForm(data);
    const [packageId, rateId] = submitted.shippingRate.split("|");

    try {
      // The backend recalculates shipping for the address, then the chosen rate is applied.
      let response = await checkout.updateCustomer(session, { billing: submitted.billing, shipping: submitted.shipping });
      remember(response);
      if (packageId !== undefined && rateId) {
        response = await checkout.selectShippingRate({ ...session, token: response.token }, packageId, rateId);
        remember(response);
      }
      state = response.state;
      if (response.error) formError = decodeEntities(response.error.message ?? t(`errors.${response.error.code}`));

      if (intent === "place" && state) {
        fieldErrors = validateCheckout(submitted, { countries, paymentMethods: state.paymentMethods });
        if (Object.keys(fieldErrors).length === 0) {
          // Attempts are counted loosely: validation errors above don't count.
          if (!consume(`commerce-order:${context.clientAddress}`, 10, 10 * 60_000).allowed) {
            formError = t("errors.rateLimited");
          } else {
            const result = await checkout.placeOrder(
              { ...session, token: response.token },
              { billing: submitted.billing, shipping: submitted.shipping, paymentMethod: submitted.paymentMethod, note: submitted.note },
            );
            if (result.ok) {
              rememberOrder(context.cookies, context.url, { ...result.order, lang });
              // Redirect gateways: the backend keeps the cart until the payment is confirmed,
              // so a declined card can be retried; /commerce/return clears it after paying.
              if (result.order.paymentUrl) return { redirect: result.order.paymentUrl };
              forgetCart(context);
              return { redirect: cartPath(lang, `order/${result.order.id}`) };
            }
            formError = decodeEntities(result.message ?? t(`errors.${result.code}`));
          }
        }
      } else if (intent !== "place" && !request.headers.get("x-checkout-refresh")) {
        // Post/Redirect/Get for the no-JS "update shipping" step.
        return { redirect: cartPath(lang, "checkout") };
      }
    } catch (error) {
      console.error("[commerce] checkout:", error);
      formError = t("errors.backend");
    }
  }

  if (!state) {
    const response = await checkout.getState(session).catch((error: unknown) => {
      console.error("[commerce] checkout:", error);
      return null;
    });
    if (!response?.state) return failed;
    remember(response);
    state = response.state;
  }
  if (state.cart.totalQuantity === 0) return { redirect: cartPath(lang) };

  const status = formError || Object.keys(fieldErrors).length ? 400 : 200;
  return { status, state, submitted, fieldErrors, formError };
}
