import {
  createStorefrontClient,
  createStorefrontRequestContext,
  handleShopifyRoutes,
} from "@shopify/hydrogen";
import { NextResponse, type NextRequest } from "next/server";

import { cartHandlers } from "./app/lib/cart-handlers";
import {
  createPublicStorefrontFetch,
  DEVELOPMENT_BUYER_IP,
  getBuyerIp,
  getPrivateStorefrontToken,
  getPublicStorefrontToken,
  getStoreDomain,
  getStorefrontMode,
  storefrontConfig,
} from "./app/lib/shop";

function getFallbackBuyerIp(headers: Pick<Headers, "get">): string {
  try {
    return getBuyerIp(headers);
  } catch {
    return DEVELOPMENT_BUYER_IP;
  }
}

export async function proxy(request: NextRequest) {
  const requestContext = createStorefrontRequestContext(request);
  const mode = getStorefrontMode(process.env);
  const storefrontClient =
    mode === "mock"
      ? createStorefrontClient({
          type: "private",
          config: {
            storeDomain: "mock.shop",
            i18n: storefrontConfig.i18n,
            privateStorefrontToken: "mock-shop",
            buyerIp: getFallbackBuyerIp(request.headers),
            requestContext,
            fetch: (_input, init) => fetch("https://mock.shop/api", init),
          },
        })
      : mode === "private"
        ? createStorefrontClient({
            type: "private",
            config: {
              storeDomain: getStoreDomain(process.env),
              i18n: storefrontConfig.i18n,
              privateStorefrontToken: getPrivateStorefrontToken(),
              buyerIp: getBuyerIp(request.headers),
              requestContext,
            },
          })
        : createStorefrontClient({
            type: "private",
            config: {
              storeDomain: getStoreDomain(process.env),
              privateStorefrontToken: "public-storefront",
              buyerIp: getFallbackBuyerIp(request.headers),
              i18n: storefrontConfig.i18n,
              requestContext,
              fetch: createPublicStorefrontFetch(getPublicStorefrontToken(process.env)),
            },
          });

  const shopifyRoute = await handleShopifyRoutes({
    request,
    storefrontClient,
    handlers: [cartHandlers],
  });
  if (shopifyRoute) return shopifyRoute;

  const requestHeaders = requestContext.getForwardedRequestHeaders();
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  requestContext.applyResponseHeaders(response.headers);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico).*)"],
};
