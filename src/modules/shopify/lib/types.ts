/** The subset of Storefront API types this module queries. */
export interface Money {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface SelectedOption {
  name: string;
  value: string;
}

export interface ProductCardData {
  id: string;
  handle: string;
  title: string;
  vendor: string;
  availableForSale: boolean;
  featuredImage: ShopifyImage | null;
  priceRange: { minVariantPrice: Money; maxVariantPrice: Money };
  compareAtPriceRange: { minVariantPrice: Money };
  variants: { nodes: { id: string; availableForSale: boolean }[] };
}

export interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  availableForSale: boolean;
  selectedOptions: SelectedOption[];
  price: Money;
  compareAtPrice: Money | null;
  image: ShopifyImage | null;
}

export interface ProductOption {
  name: string;
  optionValues: { name: string; swatch: { color: string | null } | null }[];
}

export interface Product extends ProductCardData {
  description: string;
  descriptionHtml: string;
  productType: string;
  tags: string[];
  updatedAt: string;
  seo: { title: string | null; description: string | null };
  images: { nodes: ShopifyImage[] };
  options: ProductOption[];
  variants: { nodes: ProductVariant[] };
  collections: { nodes: { handle: string; title: string }[] };
}

export interface Collection {
  id: string;
  handle: string;
  title: string;
  description: string;
  updatedAt: string;
  image: ShopifyImage | null;
  seo: { title: string | null; description: string | null };
}

/** Search & Discovery filters, as returned next to collection and search results. */
export interface ProductFilter {
  id: string;
  label: string;
  type: "LIST" | "PRICE_RANGE" | "BOOLEAN";
  values: { id: string; label: string; count: number; input: string; swatch: { color: string | null } | null }[];
}

export interface ProductConnection {
  pageInfo: PageInfo;
  filters: ProductFilter[];
  nodes: ProductCardData[];
}

export interface CartLine {
  id: string;
  quantity: number;
  cost: { totalAmount: Money; amountPerQuantity: Money; compareAtAmountPerQuantity: Money | null };
  merchandise: {
    id: string;
    title: string;
    availableForSale: boolean;
    quantityAvailable: number | null;
    selectedOptions: SelectedOption[];
    image: ShopifyImage | null;
    product: { handle: string; title: string; featuredImage: ShopifyImage | null };
  };
}

export interface Cart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: { subtotalAmount: Money; totalAmount: Money; totalTaxAmount: Money | null };
  lines: { nodes: CartLine[] };
  discountCodes: { code: string; applicable: boolean }[];
}

export interface CartUserError {
  field: string[] | null;
  message: string;
  code: string | null;
}

export interface ShopInfo {
  name: string;
  primaryDomain: { url: string };
  paymentSettings: { currencyCode: string };
}
