import "server-only";
import { createStorefrontClient, createStorefrontRequestContext } from "@shopify/hydrogen";
import { headers } from "next/headers";
import { cache } from "react";

import {
  createPublicStorefrontFetch,
  DEVELOPMENT_BUYER_IP,
  getBuyerIp,
  getPrivateStorefrontToken,
  getPublicStorefrontToken,
  getStoreDomain,
  getStorefrontMode,
  storefrontConfig,
} from "./shop";

function getRequestBuyerIp(requestHeaders: Headers): string {
  try {
    return getBuyerIp(requestHeaders);
  } catch {
    return DEVELOPMENT_BUYER_IP;
  }
}

export const getStorefrontClient = cache(async () => {
  const requestHeaders = await headers();
  const requestContext = createStorefrontRequestContext({ headers: requestHeaders });
  const mode = getStorefrontMode(process.env);

  if (mode === "mock") {
    return createStorefrontClient({
      type: "private",
      config: {
        storeDomain: "mock.shop",
        i18n: storefrontConfig.i18n,
        privateStorefrontToken: "mock-shop",
        buyerIp: getRequestBuyerIp(requestHeaders),
        requestContext,
        fetch: (_input, init) => fetch("https://mock.shop/api", init),
      },
    });
  }

  if (mode === "private") {
    return createStorefrontClient({
      type: "private",
      config: {
        storeDomain: getStoreDomain(process.env),
        i18n: storefrontConfig.i18n,
        privateStorefrontToken: getPrivateStorefrontToken(),
        buyerIp: getBuyerIp(requestHeaders),
        requestContext,
      },
    });
  }

  return createStorefrontClient({
    type: "private",
    config: {
      storeDomain: getStoreDomain(process.env),
      privateStorefrontToken: "public-storefront",
      buyerIp: getRequestBuyerIp(requestHeaders),
      i18n: storefrontConfig.i18n,
      requestContext,
      fetch: createPublicStorefrontFetch(getPublicStorefrontToken(process.env)),
    },
  });
});
