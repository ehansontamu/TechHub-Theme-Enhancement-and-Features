
//Staging Version
const COMPATIBILITY_DATA_URL =
  "https://store-jsj7fos9p1.mybigcommerce.com/content/JSON%20Files/compatibility_superapp.json";

function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function normalizeSkuText(skuText) {
  if (!skuText) return "";
  return skuText.replace(/^sku\s*[:#-]?\s*/i, "").trim();
}

function normalizeCompatibilityLookup(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeCompatibilityName(value) {
  if (!value) return "";
  return String(value)
    .replace(/[\u201C\u201D"]/g, '"')
    .replace(/\\\"/g, '"')
    .replace(/[^a-zA-Z0-9\s\"-()]/g, "")
    .toLowerCase()
    .trim();
}

function buildCompatibilityIndexes(itemsBySku) {
  const normalizedSkuToKeys = {};
  const normalizedNameToKeys = {};

  Object.keys(itemsBySku).forEach((itemSku) => {
    const itemData = itemsBySku[itemSku] || {};
    const normalizedSku = normalizeCompatibilityLookup(itemSku);
    const normalizedName = normalizeCompatibilityName(itemData.name);

    if (normalizedSku) {
      if (!normalizedSkuToKeys[normalizedSku]) {
        normalizedSkuToKeys[normalizedSku] = [];
      }

      normalizedSkuToKeys[normalizedSku].push(itemSku);
    }

    if (normalizedName) {
      if (!normalizedNameToKeys[normalizedName]) {
        normalizedNameToKeys[normalizedName] = [];
      }

      normalizedNameToKeys[normalizedName].push(itemSku);
    }
  });

  return {
    normalizedSkuToKeys,
    normalizedNameToKeys,
  };
}

function resolveCompatibilityKey(cartItem, itemsBySku, itemIndexes) {
  const cartSku =
    cartItem && typeof cartItem === "object" ? cartItem.sku : cartItem;
  const cartTitle =
    cartItem && typeof cartItem === "object" ? cartItem.title : "";

  if (cartSku && itemsBySku[cartSku]) {
    return cartSku;
  }

  const normalizedTitle = normalizeCompatibilityName(cartTitle);
  if (!normalizedTitle) {
    return "";
  }

  const nameMatches = itemIndexes.normalizedNameToKeys[normalizedTitle];
  if (!nameMatches || nameMatches.length !== 1) {
    return "";
  }

  return nameMatches[0];
}

function chunkArray(items, maxChunkSize) {
  if (!Array.isArray(items) || maxChunkSize <= 0) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < items.length; index += maxChunkSize) {
    chunks.push(items.slice(index, index + maxChunkSize));
  }

  return chunks;
}

function mmToPx(mm) {
  return (mm * 96) / 25.4;
}

const PDF_MARGIN_MM = [20, 10, 20, 10]; // top, right, bottom, left
const PDF_MARGINS_MM = {
  top: PDF_MARGIN_MM[0],
  right: PDF_MARGIN_MM[1],
  bottom: PDF_MARGIN_MM[2],
  left: PDF_MARGIN_MM[3],
};
const A4_PAGE_MM = {
  height: 297,
  width: 210,
};
const PDF_ROW_FRAGMENT_MAX_CHARS = 120;
const PDF_QUOTE_DETAIL_LINES_PER_FRAGMENT = 6;
const PDF_COMPATIBILITY_NAME_MAX_CHARS = 64;
const QUOTE_PDF_TEST_NAMESPACE = "__quotePdfTest";
const QUOTE_PDF_FIXTURE_VERSION = "1";
const QUOTE_PDF_TEST_QUERY_PARAM = "quotePdfTest";
const QUOTE_CART_MANIFEST_SCHEMA = "techhub-cart-v1";
const QUOTE_CART_MANIFEST_PREFIX = "TECHHUB_CART_V1:";
const STOREFRONT_CARTS_URL =
  "/api/storefront/carts?include=lineItems.digitalItems.options,lineItems.physicalItems.options";
const QUOTE_IMPORT_BUTTON_ID = "upload-quote-pdf-btn";
const QUOTE_IMPORT_INPUT_ID = "upload-quote-pdf-input";
const QUOTE_IMPORT_STATUS_ID = "techhub-quote-import-status";
const QUOTE_IMPORT_MODAL_ID = "techhub-quote-import-modal";
const QUOTE_IMPORT_MODAL_TITLE_ID = "techhub-quote-import-modal-title";
const QUOTE_IMPORT_MODAL_DESCRIPTION_ID =
  "techhub-quote-import-modal-description";
const QUOTE_IMPORT_RESULT_STORAGE_KEY = "techhubQuoteImportResult";
const QUOTE_IMPORT_MAX_FILE_BYTES = 25 * 1024 * 1024;
const QUOTE_IMPORT_MAX_ITEMS = 250;
const QUOTE_IMPORT_MAX_QUANTITY = 1000;
const QUOTE_IMPORT_TEST_HOST_ALIASES = [
  "techhubtest.mybigcommerce.com",
  "store-jje9unvzjs.mybigcommerce.com",
];

let latestQuotePdfSnapshot = null;

function waitForFontsReady() {
  if (!document.fonts || typeof document.fonts.ready?.then !== "function") {
    return Promise.resolve();
  }

  return document.fonts.ready.catch(() => undefined);
}

function getPdfContentMetrics() {
  return {
    contentHeightPx: mmToPx(
      A4_PAGE_MM.height - PDF_MARGINS_MM.top - PDF_MARGINS_MM.bottom,
    ),
    contentWidthPx: mmToPx(
      A4_PAGE_MM.width - PDF_MARGINS_MM.left - PDF_MARGINS_MM.right,
    ),
  };
}

function splitTextIntoFragments(
  text,
  maxCharsPerFragment = PDF_ROW_FRAGMENT_MAX_CHARS,
) {
  const normalizedText = typeof text === "string" ? text.trim() : "";
  if (!normalizedText) {
    return [];
  }

  const maxChars = Math.max(20, maxCharsPerFragment);
  const words = normalizedText.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const fragments = [];
  let currentFragment = "";

  function flushCurrent() {
    if (!currentFragment) {
      return;
    }

    fragments.push(currentFragment);
    currentFragment = "";
  }

  words.forEach((word) => {
    if (word.length > maxChars) {
      flushCurrent();
      for (let index = 0; index < word.length; index += maxChars) {
        fragments.push(word.slice(index, index + maxChars));
      }
      return;
    }

    const candidate = currentFragment ? `${currentFragment} ${word}` : word;
    if (candidate.length <= maxChars) {
      currentFragment = candidate;
      return;
    }

    flushCurrent();
    currentFragment = word;
  });

  flushCurrent();
  return fragments;
}

// =========================================
// Data Layer
// =========================================

function extractCartData() {
  const cartItemNodes = Array.from(document.querySelectorAll(".cart-item"));
  const items = cartItemNodes.map((cartItem) => {
    const titleLink = cartItem.querySelector(".cart-item-title a");
    const itemTitleText = titleLink
      ? titleLink.innerText.trim()
      : cartItem.querySelector(".cart-item-title")?.innerText.trim() || "";

    const optionLines = Array.from(
      cartItem.querySelectorAll(".cart-item-options"),
    )
      .map((option) => option.innerText.trim())
      .filter(Boolean);

    const specLines = [];
    const specDl = cartItem.querySelector(".definitionList");
    if (specDl) {
      specDl.querySelectorAll("dt.definitionList-key").forEach((dt) => {
        const dd = dt.nextElementSibling;
        if (!dd) {
          return;
        }

        const specText =
          `${dt.textContent.trim()} ${dd.textContent.trim()}`.trim();
        if (specText) {
          specLines.push(specText);
        }
      });
    }

    const skuElement = cartItem.querySelector(".cart-item-sku");
    const skuValue = normalizeSkuText(
      skuElement ? skuElement.innerText.trim() : "",
    );

    const priceElement = cartItem.querySelector(
      ".cart-item-block.cart-item-info .cart-item-value",
    );
    const priceText = priceElement ? priceElement.innerText.trim() : "";

    const quantityElement = cartItem.querySelector(
      ".cart-item-block.cart-item-info.cart-item-quantity .form-increment .form-input",
    );
    const quantityText = quantityElement ? quantityElement.value.trim() : "";

    const priceValue = parseFloat(priceText.replace(/[^0-9.-]+/g, "")) || 0;
    const quantityValue = parseInt(quantityText, 10) || 0;
    const lineTotalValue = priceValue * quantityValue;
    const lineTotalText = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format(lineTotalValue);

    return {
      title: itemTitleText,
      titleHref: titleLink ? titleLink.href : "",
      optionLines,
      specLines,
      optionLineCount: optionLines.length,
      sku: skuValue,
      priceText,
      quantityText,
      lineTotalText,
    };
  });

  const grandTotal = document.querySelector(
    ".cart-total-value.cart-total-grandTotal",
  );
  const grandTotalText = grandTotal ? grandTotal.innerText.trim() : "";

  return {
    items,
    grandTotalText,
  };
}

// =========================================
// Restorable Cart Manifest
// =========================================

function normalizeManifestOptionSelections(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => {
      const optionId = Number(option?.nameId);
      const optionValue =
        option?.valueId !== null && option?.valueId !== undefined
          ? option.valueId
          : option?.value;

      if (
        !Number.isInteger(optionId) ||
        optionId <= 0 ||
        optionValue === null ||
        optionValue === undefined ||
        optionValue === ""
      ) {
        return null;
      }

      return {
        optionId,
        optionValue,
      };
    })
    .filter(Boolean);
}

function getStorefrontLineItemUnitPrice(item) {
  const salePrice =
    item?.salePrice === null || item?.salePrice === undefined
      ? Number.NaN
      : Number(item.salePrice);
  if (Number.isFinite(salePrice) && salePrice >= 0) {
    return salePrice;
  }

  const extendedSalePrice =
    item?.extendedSalePrice === null || item?.extendedSalePrice === undefined
      ? Number.NaN
      : Number(item.extendedSalePrice);
  const quantity = Number(item?.quantity);
  if (
    Number.isFinite(extendedSalePrice) &&
    extendedSalePrice >= 0 &&
    Number.isFinite(quantity) &&
    quantity > 0
  ) {
    return extendedSalePrice / quantity;
  }

  const listPrice =
    item?.listPrice === null || item?.listPrice === undefined
      ? Number.NaN
      : Number(item.listPrice);
  return Number.isFinite(listPrice) && listPrice >= 0 ? listPrice : null;
}

function buildCartManifestFromStorefrontCart(cart) {
  if (!cart || typeof cart !== "object") {
    throw new Error("The Storefront Cart API did not return a cart.");
  }

  const lineItems = cart.lineItems || {};
  const restorableItems = [
    ...(Array.isArray(lineItems.physicalItems)
      ? lineItems.physicalItems
      : []),
    ...(Array.isArray(lineItems.digitalItems) ? lineItems.digitalItems : []),
  ];
  const unsupportedItemCount =
    (Array.isArray(lineItems.customItems) ? lineItems.customItems.length : 0) +
    (Array.isArray(lineItems.giftCertificates)
      ? lineItems.giftCertificates.length
      : 0);

  if (unsupportedItemCount > 0) {
    throw new Error(
      "This cart contains custom items or gift certificates that cannot be restored from a quote PDF.",
    );
  }

  const currencyCode =
    typeof cart?.currency?.code === "string" &&
    /^[A-Za-z]{3}$/.test(cart.currency.code)
      ? cart.currency.code.toUpperCase()
      : "USD";

  const items = restorableItems.map((item) => {
    const productId = Number(item?.productId);
    const variantId = Number(item?.variantId);
    const quantity = Number(item?.quantity);

    if (
      !Number.isInteger(productId) ||
      productId <= 0 ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new Error(
        "The cart contains an item without a valid product ID or quantity.",
      );
    }

    const manifestItem = {
      productId,
      quantity,
      optionSelections: normalizeManifestOptionSelections(item.options),
    };

    const quotedUnitPrice = getStorefrontLineItemUnitPrice(item);
    if (quotedUnitPrice !== null) {
      manifestItem.quotedUnitPrice = quotedUnitPrice;
    }

    if (Number.isInteger(variantId) && variantId > 0) {
      manifestItem.variantId = variantId;
    }

    if (typeof item?.name === "string" && item.name.trim()) {
      manifestItem.name = item.name.trim();
    }

    if (typeof item?.sku === "string" && item.sku.trim()) {
      manifestItem.sku = item.sku.trim();
    }

    return manifestItem;
  });

  if (!items.length) {
    throw new Error("The current cart does not contain any restorable items.");
  }

  return {
    schema: QUOTE_CART_MANIFEST_SCHEMA,
    createdAt: new Date().toISOString(),
    currencyCode,
    storeHost:
      typeof window !== "undefined" && window.location
        ? window.location.hostname
        : "",
    items,
  };
}

async function fetchCurrentCartManifest() {
  const response = await fetch(STOREFRONT_CARTS_URL, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Storefront Cart API request failed with status ${response.status}.`,
    );
  }

  const carts = await response.json();
  const currentCart = Array.isArray(carts) ? carts[0] : carts;
  return buildCartManifestFromStorefrontCart(currentCart);
}

function encodeUtf8Base64(value) {
  const stringValue = String(value);

  if (typeof TextEncoder === "function") {
    const bytes = new TextEncoder().encode(stringValue);
    const chunks = [];
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      chunks.push(
        String.fromCharCode(...bytes.subarray(index, index + chunkSize)),
      );
    }

    return btoa(chunks.join(""));
  }

  return btoa(unescape(encodeURIComponent(stringValue)));
}

function buildCartManifestPdfSubject(cartManifest) {
  if (
    !cartManifest ||
    cartManifest.schema !== QUOTE_CART_MANIFEST_SCHEMA ||
    !Array.isArray(cartManifest.items) ||
    !cartManifest.items.length
  ) {
    throw new Error("Cannot export a quote PDF without a valid cart manifest.");
  }

  return `${QUOTE_CART_MANIFEST_PREFIX}${encodeUtf8Base64(
    JSON.stringify(cartManifest),
  )}`;
}

function decodeUtf8Base64(value) {
  let binaryText;
  try {
    binaryText = atob(String(value).replace(/\s+/g, ""));
  } catch (error) {
    throw new Error("The quote PDF contains invalid encoded cart data.");
  }

  const bytes = new Uint8Array(binaryText.length);
  for (let index = 0; index < binaryText.length; index += 1) {
    bytes[index] = binaryText.charCodeAt(index);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error("The quote PDF cart data is not valid UTF-8 text.");
  }
}

function decodePdfHexString(hexValue) {
  const normalizedHex = String(hexValue).replace(/\s+/g, "");
  if (!normalizedHex || normalizedHex.length % 2 !== 0) {
    return "";
  }

  const bytes = new Uint8Array(normalizedHex.length / 2);
  for (let index = 0; index < normalizedHex.length; index += 2) {
    const byteValue = Number.parseInt(normalizedHex.slice(index, index + 2), 16);
    if (!Number.isFinite(byteValue)) {
      return "";
    }
    bytes[index / 2] = byteValue;
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let decodedValue = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      decodedValue += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    }
    return decodedValue;
  }

  return new TextDecoder("latin1").decode(bytes);
}

function extractCartManifestSubjectFromPdfBytes(pdfBytes) {
  const pdfText = new TextDecoder("latin1").decode(pdfBytes);
  const literalSubjectMatch = pdfText.match(
    /\/Subject\s*\((TECHHUB_CART_V1:[A-Za-z0-9+/=\s]+)\)/,
  );

  if (literalSubjectMatch) {
    return literalSubjectMatch[1].replace(/\s+/g, "");
  }

  const hexSubjectMatches = pdfText.matchAll(/\/Subject\s*<([0-9A-Fa-f\s]+)>/g);
  for (const match of hexSubjectMatches) {
    const decodedSubject = decodePdfHexString(match[1]);
    if (decodedSubject.startsWith(QUOTE_CART_MANIFEST_PREFIX)) {
      return decodedSubject;
    }
  }

  throw new Error(
    "This PDF does not contain TechHub cart data. Please upload the original PDF generated by the updated TechHub quote builder.",
  );
}

function normalizeQuoteImportHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function validateQuoteImportStoreHost(storeHost) {
  const manifestHost = normalizeQuoteImportHost(storeHost);
  const currentHost = normalizeQuoteImportHost(window.location.hostname);
  const isSameHost = manifestHost && manifestHost === currentHost;
  const isTestAliasPair =
    QUOTE_IMPORT_TEST_HOST_ALIASES.includes(manifestHost) &&
    QUOTE_IMPORT_TEST_HOST_ALIASES.includes(currentHost);

  if (!isSameHost && !isTestAliasPair) {
    throw new Error(
      `This quote belongs to ${manifestHost || "another store"}, not ${currentHost}.`,
    );
  }
}

function normalizeImportedOptionSelections(optionSelections) {
  if (optionSelections === undefined) {
    return [];
  }

  if (!Array.isArray(optionSelections) || optionSelections.length > 50) {
    throw new Error("The quote contains invalid product-option data.");
  }

  return optionSelections.map((option) => {
    const optionId = Number(option?.optionId);
    const optionValue = option?.optionValue;
    const hasValidValue =
      (typeof optionValue === "number" && Number.isFinite(optionValue)) ||
      (typeof optionValue === "string" &&
        optionValue.length > 0 &&
        optionValue.length <= 1000);

    if (!Number.isInteger(optionId) || optionId <= 0 || !hasValidValue) {
      throw new Error("The quote contains an invalid product option.");
    }

    return { optionId, optionValue };
  });
}

function validateAndNormalizeImportedManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("The quote PDF cart data is not a valid object.");
  }

  if (manifest.schema !== QUOTE_CART_MANIFEST_SCHEMA) {
    throw new Error("This quote uses an unsupported TechHub cart-data version.");
  }

  validateQuoteImportStoreHost(manifest.storeHost);

  if (
    !Array.isArray(manifest.items) ||
    !manifest.items.length ||
    manifest.items.length > QUOTE_IMPORT_MAX_ITEMS
  ) {
    throw new Error("The quote contains an invalid number of products.");
  }

  const items = manifest.items.map((item) => {
    const productId = Number(item?.productId);
    const variantId = Number(item?.variantId);
    const quantity = Number(item?.quantity);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error("The quote contains an invalid product ID.");
    }

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > QUOTE_IMPORT_MAX_QUANTITY
    ) {
      throw new Error("The quote contains an invalid product quantity.");
    }

    const normalizedItem = {
      productId,
      quantity,
      optionSelections: normalizeImportedOptionSelections(
        item.optionSelections,
      ),
    };

    if (item.quotedUnitPrice !== undefined) {
      const quotedUnitPrice = Number(item.quotedUnitPrice);
      if (!Number.isFinite(quotedUnitPrice) || quotedUnitPrice < 0) {
        throw new Error("The quote contains an invalid stored price.");
      }
      normalizedItem.quotedUnitPrice = quotedUnitPrice;
    }

    if (Number.isInteger(variantId) && variantId > 0) {
      normalizedItem.variantId = variantId;
    }

    if (typeof item?.name === "string" && item.name.trim()) {
      normalizedItem.name = item.name.trim().slice(0, 250);
    }

    if (typeof item?.sku === "string" && item.sku.trim()) {
      normalizedItem.sku = item.sku.trim().slice(0, 100);
    }

    return normalizedItem;
  });

  return {
    schema: QUOTE_CART_MANIFEST_SCHEMA,
    createdAt: typeof manifest.createdAt === "string" ? manifest.createdAt : "",
    currencyCode:
      typeof manifest.currencyCode === "string" &&
      /^[A-Za-z]{3}$/.test(manifest.currencyCode)
        ? manifest.currencyCode.toUpperCase()
        : "USD",
    storeHost: normalizeQuoteImportHost(manifest.storeHost),
    items,
  };
}

async function readCartManifestFromPdfFile(file) {
  if (!file) {
    throw new Error("Please select a TechHub quote PDF.");
  }

  if (file.size <= 0 || file.size > QUOTE_IMPORT_MAX_FILE_BYTES) {
    throw new Error("The selected PDF is empty or larger than 25 MB.");
  }

  if (!/\.pdf$/i.test(file.name || "")) {
    throw new Error("Please select a PDF file.");
  }

  const pdfBytes = new Uint8Array(await file.arrayBuffer());
  const subject = extractCartManifestSubjectFromPdfBytes(pdfBytes);
  const encodedManifest = subject.slice(QUOTE_CART_MANIFEST_PREFIX.length);

  let manifest;
  try {
    manifest = JSON.parse(decodeUtf8Base64(encodedManifest));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("The quote PDF contains malformed cart data.");
    }
    throw error;
  }

  return validateAndNormalizeImportedManifest(manifest);
}

function buildStorefrontRequestItem(item) {
  const requestItem = {
    productId: item.productId,
    quantity: item.quantity,
  };

  if (item.variantId) {
    requestItem.variantId = item.variantId;
  }

  if (item.optionSelections.length) {
    requestItem.optionSelections = item.optionSelections;
  }

  return requestItem;
}

async function getCurrentStorefrontCart() {
  const response = await fetch(STOREFRONT_CARTS_URL, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `TechHub could not read the current cart (${response.status}).`,
    );
  }

  const carts = await response.json();
  return Array.isArray(carts) ? carts[0] || null : carts || null;
}

async function getStorefrontApiError(response) {
  let responseData = null;
  try {
    responseData = await response.json();
  } catch (error) {
    responseData = null;
  }

  if (typeof responseData?.detail === "string" && responseData.detail.trim()) {
    return normalizeStorefrontCartErrorMessage(responseData.detail);
  }

  if (typeof responseData?.title === "string" && responseData.title.trim()) {
    return normalizeStorefrontCartErrorMessage(responseData.title);
  }

  if (responseData?.errors && typeof responseData.errors === "object") {
    const errorMessages = Object.values(responseData.errors)
      .flat()
      .filter((message) => typeof message === "string" && message.trim());
    if (errorMessages.length) {
      return normalizeStorefrontCartErrorMessage(errorMessages.join(" "));
    }
  }

  return `BigCommerce rejected this item with status ${response.status}.`;
}

function normalizeStorefrontCartErrorMessage(message) {
  const normalizedMessage = String(message || "").trim();
  if (
    /the following product cannot be ordered online[\s\S]*could not proceed with (?:the )?checkout/i.test(
      normalizedMessage,
    )
  ) {
    return "this product is not currently (or is no longer) available for purchase.";
  }

  return normalizedMessage;
}

async function addImportedItemToCart(cartId, item) {
  const hasCart = typeof cartId === "string" && cartId.length > 0;
  const endpoint = hasCart
    ? `/api/storefront/carts/${encodeURIComponent(cartId)}/items`
    : "/api/storefront/carts";
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lineItems: [buildStorefrontRequestItem(item)],
    }),
  });

  if (!response.ok) {
    throw new Error(await getStorefrontApiError(response));
  }

  const updatedCart = await response.json();
  if (!updatedCart || typeof updatedCart.id !== "string") {
    throw new Error("BigCommerce did not return the updated cart.");
  }

  return updatedCart;
}

async function deleteCurrentStorefrontCart(cartId) {
  if (typeof cartId !== "string" || !cartId) {
    return;
  }

  const response = await fetch(
    `/api/storefront/carts/${encodeURIComponent(cartId)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `TechHub could not replace the current cart (${response.status}).`,
    );
  }
}

function getImportedItemLabel(item) {
  if (item.name && item.sku) {
    return `${item.name} (${item.sku})`;
  }

  if (item.name) {
    return item.name;
  }

  if (item.sku) {
    return `SKU ${item.sku}`;
  }

  return `Product ${item.productId}`;
}

function getStorefrontCartLineItems(cart) {
  const lineItems = cart?.lineItems || {};
  return [
    ...(Array.isArray(lineItems.physicalItems)
      ? lineItems.physicalItems
      : []),
    ...(Array.isArray(lineItems.digitalItems) ? lineItems.digitalItems : []),
  ];
}

function storefrontCartHasItems(cart) {
  const lineItems = cart?.lineItems || {};
  return [
    lineItems.physicalItems,
    lineItems.digitalItems,
    lineItems.customItems,
    lineItems.giftCertificates,
  ].some((items) => Array.isArray(items) && items.length > 0);
}

function buildOptionSelectionKey(options) {
  if (!Array.isArray(options)) {
    return "";
  }

  return options
    .map((option) => {
      const optionId = Number(option?.optionId ?? option?.nameId);
      const optionValue =
        option?.optionValue ?? option?.valueId ?? option?.value;
      if (!Number.isInteger(optionId) || optionValue === undefined) {
        return null;
      }
      return `${optionId}:${String(optionValue)}`;
    })
    .filter(Boolean)
    .sort()
    .join("|");
}

function findRestoredLineItem(cart, importedItem) {
  const matchingProductItems = getStorefrontCartLineItems(cart).filter(
    (lineItem) => Number(lineItem?.productId) === importedItem.productId,
  );

  const matchingVariantItems = importedItem.variantId
    ? matchingProductItems.filter(
        (lineItem) => Number(lineItem?.variantId) === importedItem.variantId,
      )
    : matchingProductItems;

  if (matchingVariantItems.length <= 1) {
    return matchingVariantItems[0] || null;
  }

  const importedOptionKey = buildOptionSelectionKey(
    importedItem.optionSelections,
  );
  return (
    matchingVariantItems.find(
      (lineItem) =>
        buildOptionSelectionKey(lineItem.options) === importedOptionKey,
    ) || null
  );
}

function compareRestoredItemPrice(importedItem, updatedCart, quotedCurrencyCode) {
  if (!Number.isFinite(importedItem.quotedUnitPrice)) {
    return null;
  }

  const restoredLineItem = findRestoredLineItem(updatedCart, importedItem);
  const currentUnitPrice = getStorefrontLineItemUnitPrice(restoredLineItem);
  if (currentUnitPrice === null) {
    return null;
  }

  const currentCurrencyCode =
    typeof updatedCart?.currency?.code === "string" &&
    /^[A-Za-z]{3}$/.test(updatedCart.currency.code)
      ? updatedCart.currency.code.toUpperCase()
      : quotedCurrencyCode;
  const quotedUnitPrice = importedItem.quotedUnitPrice;
  const priceChanged =
    quotedCurrencyCode !== currentCurrencyCode ||
    Math.round(quotedUnitPrice * 100) !== Math.round(currentUnitPrice * 100);

  return {
    changed: priceChanged,
    item: importedItem,
    quotedUnitPrice,
    quotedCurrencyCode,
    currentUnitPrice,
    currentCurrencyCode,
  };
}

async function restoreCartFromManifest(
  manifest,
  mode = "add",
  knownCurrentCart = undefined,
) {
  const currentCart =
    knownCurrentCart === undefined
      ? await getCurrentStorefrontCart()
      : knownCurrentCart;
  let cartId = currentCart?.id || "";

  if (mode === "replace" && cartId) {
    await deleteCurrentStorefrontCart(cartId);
    cartId = "";
  }

  const restoredItems = [];
  const failedItems = [];
  const priceChanges = [];
  let comparedPriceCount = 0;

  for (const item of manifest.items) {
    try {
      const updatedCart = await addImportedItemToCart(cartId, item);
      cartId = updatedCart.id;
      restoredItems.push(item);
      const priceComparison = compareRestoredItemPrice(
        item,
        updatedCart,
        manifest.currencyCode,
      );
      if (priceComparison) {
        comparedPriceCount += 1;
        if (priceComparison.changed) {
          priceChanges.push(priceComparison);
        }
      }
    } catch (error) {
      failedItems.push({
        item,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { restoredItems, failedItems, priceChanges, comparedPriceCount };
}

function injectQuoteImportStyles() {
  if (document.getElementById("techhub-quote-import-styles")) {
    return;
  }

  const styleTag = document.createElement("style");
  styleTag.id = "techhub-quote-import-styles";
  styleTag.textContent = `
    #${QUOTE_IMPORT_BUTTON_ID} {
      display: inline-flex !important;
      left: 0 !important;
      right: auto !important;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }
    #${QUOTE_IMPORT_BUTTON_ID}[disabled] {
      cursor: wait;
      opacity: 0.65;
    }
    #${QUOTE_IMPORT_BUTTON_ID}:hover {
      background-color: #f0f0f0 !important;
      color: #000000 !important;
    }
    .techhub-quote-import-status {
      border: 1px solid #b8b8b8;
      margin: 0 0 1.5rem;
      padding: 1rem 1.25rem;
      white-space: pre-line;
    }
    .techhub-quote-import-status--success {
      background: #edf7ed;
      border-color: #4f8a4f;
      color: #244624;
    }
    .techhub-quote-import-status--warning {
      background: #fff8e5;
      border-color: #b88700;
      color: #5c4500;
    }
    .techhub-quote-import-status--error {
      background: #fff0f0;
      border-color: #b94a48;
      color: #7b2321;
    }
    .techhub-quote-import-modal {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      background: rgba(0, 0, 0, 0.62);
    }
    .techhub-quote-import-modal[hidden] {
      display: none !important;
    }
    .techhub-quote-import-modal__dialog {
      width: min(100%, 540px);
      max-height: calc(100vh - 2.5rem);
      overflow-y: auto;
      box-sizing: border-box;
      background: #ffffff;
      border: 1px solid #222222;
      box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.3);
      padding: 2rem;
    }
    .techhub-quote-import-modal__title {
      margin: 0 0 0.75rem;
      font-size: 1.5rem;
      line-height: 1.25;
    }
    .techhub-quote-import-modal__description {
      margin: 0 0 1.5rem;
      line-height: 1.55;
    }
    .techhub-quote-import-modal__actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }
    .techhub-quote-import-modal__button {
      min-height: 44px;
      padding: 0.7rem 1rem;
      border: 1px solid #000000;
      border-radius: 0;
      font-family: 'Work Sans', sans-serif;
      font-size: 0.875rem;
      font-weight: 700;
      line-height: 1.2;
      text-transform: uppercase;
      cursor: pointer;
    }
    .techhub-quote-import-modal__button--replace {
      background: #ffffff;
      color: #000000;
    }
    .techhub-quote-import-modal__button--add {
      background: #000000;
      color: #ffffff;
    }
    .techhub-quote-import-modal__button--cancel {
      grid-column: 1 / -1;
      justify-self: center;
      min-height: auto;
      border: 0;
      background: transparent;
      color: #333333;
      text-decoration: underline;
      text-transform: none;
    }
    .techhub-quote-import-modal__button:focus-visible {
      outline: 3px solid #4d90fe;
      outline-offset: 2px;
    }
    @media (max-width: 540px) {
      .techhub-cart-header {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        column-gap: 0.75rem;
        row-gap: 0.75rem;
        align-items: stretch;
      }
      .techhub-cart-header__title {
        grid-column: 1 / -1;
        grid-row: 1;
        align-self: center;
        justify-self: center;
        width: 100%;
      }
      #${QUOTE_IMPORT_BUTTON_ID},
      #empty-cart-btn {
        position: static !important;
        top: auto !important;
        left: auto !important;
        right: auto !important;
        transform: none !important;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 100% !important;
        min-width: 0;
        min-height: 41px;
        margin: 0 !important;
      }
      #${QUOTE_IMPORT_BUTTON_ID} {
        grid-column: 1;
        grid-row: 2;
      }
      #empty-cart-btn {
        grid-column: 2;
        grid-row: 2;
      }
    }
    @media (max-width: 360px) {
      .techhub-cart-header {
        grid-template-columns: minmax(0, 1fr);
      }
      #${QUOTE_IMPORT_BUTTON_ID} {
        grid-column: 1;
        grid-row: 2;
      }
      #empty-cart-btn {
        grid-column: 1;
        grid-row: 3;
      }
      .techhub-quote-import-modal__dialog {
        padding: 1.25rem;
      }
      .techhub-quote-import-modal__actions {
        grid-template-columns: minmax(0, 1fr);
      }
      .techhub-quote-import-modal__button--cancel {
        grid-column: 1;
      }
    }
  `;
  document.head.appendChild(styleTag);
}

function chooseQuoteImportMode(productCount, totalQuantity) {
  const existingModal = document.getElementById(QUOTE_IMPORT_MODAL_ID);
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement("div");
  modal.id = QUOTE_IMPORT_MODAL_ID;
  modal.className = "techhub-quote-import-modal";
  modal.setAttribute("role", "presentation");

  const dialog = document.createElement("div");
  dialog.className = "techhub-quote-import-modal__dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", QUOTE_IMPORT_MODAL_TITLE_ID);
  dialog.setAttribute("aria-describedby", QUOTE_IMPORT_MODAL_DESCRIPTION_ID);

  const title = document.createElement("h2");
  title.id = QUOTE_IMPORT_MODAL_TITLE_ID;
  title.className = "techhub-quote-import-modal__title";
  title.textContent = "How should this quote be restored?";

  const description = document.createElement("p");
  description.id = QUOTE_IMPORT_MODAL_DESCRIPTION_ID;
  description.className = "techhub-quote-import-modal__description";
  description.textContent = `This quote contains ${productCount} product${
    productCount === 1 ? "" : "s"
  } (${totalQuantity} total item${
    totalQuantity === 1 ? "" : "s"
  }). Replace removes every item currently in your cart. Add keeps your current items and adds the quote items. Current pricing and availability will apply.`;

  const actions = document.createElement("div");
  actions.className = "techhub-quote-import-modal__actions";

  function createActionButton(label, modifier, choice) {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className =
      `techhub-quote-import-modal__button techhub-quote-import-modal__button--${modifier}`;
    actionButton.textContent = label;
    actionButton.dataset.quoteImportChoice = choice;
    return actionButton;
  }

  const replaceButton = createActionButton(
    "Replace current cart",
    "replace",
    "replace",
  );
  const addButton = createActionButton("Add to current cart", "add", "add");
  const cancelButton = createActionButton("Cancel", "cancel", "cancel");

  actions.append(replaceButton, addButton, cancelButton);
  dialog.append(title, description, actions);
  modal.appendChild(dialog);
  document.body.appendChild(modal);

  return new Promise((resolve) => {
    let isResolved = false;

    function finish(choice) {
      if (isResolved) {
        return;
      }
      isResolved = true;
      document.removeEventListener("keydown", handleKeydown);
      modal.remove();
      resolve(choice);
    }

    function handleKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const buttons = [replaceButton, addButton, cancelButton];
      const currentIndex = buttons.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? (currentIndex - 1 + buttons.length) % buttons.length
        : (currentIndex + 1) % buttons.length;
      event.preventDefault();
      buttons[nextIndex].focus();
    }

    modal.addEventListener("click", (event) => {
      const choiceButton = event.target.closest("[data-quote-import-choice]");
      if (choiceButton) {
        const choice = choiceButton.dataset.quoteImportChoice;
        finish(choice === "cancel" ? null : choice);
        return;
      }

      if (event.target === modal) {
        finish(null);
      }
    });

    document.addEventListener("keydown", handleKeydown);
    addButton.focus();
  });
}

function showQuoteImportStatus(message, type = "warning") {
  const header = document.querySelector(".techhub-cart-header");
  if (!header) {
    window.alert(message);
    return;
  }

  let statusNode = document.getElementById(QUOTE_IMPORT_STATUS_ID);
  if (!statusNode) {
    statusNode = document.createElement("div");
    statusNode.id = QUOTE_IMPORT_STATUS_ID;
    statusNode.setAttribute("role", type === "error" ? "alert" : "status");
    header.insertAdjacentElement("afterend", statusNode);
  }

  statusNode.className =
    `techhub-quote-import-status techhub-quote-import-status--${type}`;
  statusNode.setAttribute("role", type === "error" ? "alert" : "status");
  statusNode.textContent = message;
  statusNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatQuotePrice(amount, currencyCode) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
    }).format(amount);
  } catch (error) {
    return `${currencyCode || "USD"} ${Number(amount).toFixed(2)}`;
  }
}

function buildQuoteImportResultMessage(result) {
  const restoredCount = result.restoredItems.length;
  const failedCount = result.failedItems.length;
  const priceChanges = Array.isArray(result.priceChanges)
    ? result.priceChanges
    : [];
  const comparedPriceCount = Number(result.comparedPriceCount) || 0;
  const messageLines = [
    `Restored ${restoredCount} of ${restoredCount + failedCount} products.`,
  ];

  if (restoredCount) {
    messageLines.push(
      "Successfully added products were restored using current TechHub pricing and availability.",
    );
  }

  if (priceChanges.length) {
    messageLines.push("", "Price changes detected (current prices were used):");
    priceChanges.forEach((priceChange) => {
      messageLines.push(
        `- ${getImportedItemLabel(priceChange.item)}: ${formatQuotePrice(
          priceChange.quotedUnitPrice,
          priceChange.quotedCurrencyCode,
        )} → ${formatQuotePrice(
          priceChange.currentUnitPrice,
          priceChange.currentCurrencyCode,
        )}`,
      );
    });
  } else if (restoredCount && comparedPriceCount === restoredCount) {
    messageLines.push("No quoted unit prices have changed.");
  } else if (restoredCount && comparedPriceCount < restoredCount) {
    const unavailableCount = restoredCount - comparedPriceCount;
    messageLines.push(
      `Price comparison was unavailable for ${unavailableCount} restored product${
        unavailableCount === 1 ? "" : "s"
      }. Older quote PDFs do not contain stored prices.`,
    );
  }

  if (failedCount) {
    messageLines.push("", "Products that could not be added:");
    result.failedItems.forEach(({ item, message }) => {
      messageLines.push(`- ${getImportedItemLabel(item)}: ${message}`);
    });
  }

  return messageLines.join("\n");
}

function storeQuoteImportResult(message, type) {
  try {
    window.sessionStorage.setItem(
      QUOTE_IMPORT_RESULT_STORAGE_KEY,
      JSON.stringify({ message, type }),
    );
  } catch (error) {
    console.warn("Unable to retain the quote import result after reload:", error);
  }
}

function showStoredQuoteImportResult() {
  try {
    const storedValue = window.sessionStorage.getItem(
      QUOTE_IMPORT_RESULT_STORAGE_KEY,
    );
    if (!storedValue) {
      return;
    }

    window.sessionStorage.removeItem(QUOTE_IMPORT_RESULT_STORAGE_KEY);
    const result = JSON.parse(storedValue);
    if (result?.message) {
      showQuoteImportStatus(result.message, result.type || "warning");
    }
  } catch (error) {
    console.warn("Unable to display the previous quote import result:", error);
  }
}

function setQuoteImportBusy(button, isBusy) {
  button.disabled = isBusy;
  button.setAttribute("aria-busy", isBusy ? "true" : "false");
  button.textContent = isBusy ? "UPLOADING QUOTE..." : "UPLOAD QUOTE";
}

function applyQuoteUploadButtonInlineStyles(button) {
  button.style.cssText = `
    font-family: 'Work Sans', sans-serif !important;
    text-transform: uppercase !important;
    font-weight: 700 !important;
    font-size: 9pt !important;
    width: 185px;
    height: 40px;
    padding: 0 5px !important;
    box-sizing: border-box;
    background-color: #ffffff;
    color: #000000 !important;
    border-radius: 0 !important;
    border: 1px solid #000000 !important;
    display: inline-block !important;
    text-align: center !important;
    line-height: 40px !important;
    text-decoration: none !important;
    transition: background-color 0.3s ease;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  `;
}

function isQuoteCartPage() {
  return (
    typeof window !== "undefined" &&
    window.location &&
    window.location.pathname === "/cart.php"
  );
}

async function handleQuotePdfSelection(file, button, input) {
  setQuoteImportBusy(button, true);

  try {
    const manifest = await readCartManifestFromPdfFile(file);
    const totalQuantity = manifest.items.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    const currentCart = await getCurrentStorefrontCart();
    const importMode = storefrontCartHasItems(currentCart)
      ? await chooseQuoteImportMode(manifest.items.length, totalQuantity)
      : "add";

    if (!importMode) {
      return;
    }

    button.textContent =
      importMode === "replace" ? "REPLACING CART..." : "ADDING TO CART...";
    const result = await restoreCartFromManifest(
      manifest,
      importMode,
      currentCart,
    );
    const message = buildQuoteImportResultMessage(result);
    const type = result.failedItems.length
      ? result.restoredItems.length
        ? "warning"
        : "error"
      : result.priceChanges.length
        ? "warning"
        : "success";

    if (result.restoredItems.length) {
      storeQuoteImportResult(message, type);
      window.location.reload();
      return;
    }

    showQuoteImportStatus(message, type);
  } catch (error) {
    console.error("Quote PDF import failed:", error);
    showQuoteImportStatus(
      error instanceof Error ? error.message : String(error),
      "error",
    );
  } finally {
    input.value = "";
    setQuoteImportBusy(button, false);
  }
}

function initializeQuotePdfImportInterface() {
  if (!isQuoteCartPage()) {
    return false;
  }

  if (document.getElementById(QUOTE_IMPORT_BUTTON_ID)) {
    return true;
  }

  const header = document.querySelector(".techhub-cart-header");
  if (!header) {
    return false;
  }

  injectQuoteImportStyles();

  const uploadButton = document.createElement("button");
  uploadButton.id = QUOTE_IMPORT_BUTTON_ID;
  uploadButton.type = "button";
  uploadButton.className =
    "button button--white techhub-cart-header__action techhub-cart-header__action--upload";
  uploadButton.textContent = "UPLOAD QUOTE";
  uploadButton.setAttribute("aria-label", "Upload a saved TechHub quote PDF");
  uploadButton.setAttribute("aria-busy", "false");
  applyQuoteUploadButtonInlineStyles(uploadButton);

  const fileInput = document.createElement("input");
  fileInput.id = QUOTE_IMPORT_INPUT_ID;
  fileInput.type = "file";
  fileInput.accept = ".pdf,application/pdf";
  fileInput.hidden = true;

  const title = header.querySelector(".techhub-cart-header__title");
  header.insertBefore(uploadButton, title || header.firstChild);
  header.appendChild(fileInput);

  uploadButton.addEventListener("click", () => {
    if (!uploadButton.disabled) {
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", () => {
    const selectedFile = fileInput.files?.[0];
    if (selectedFile) {
      handleQuotePdfSelection(selectedFile, uploadButton, fileInput);
    }
  });

  showStoredQuoteImportResult();
  return true;
}

function initializeQuotePdfImportWhenReady() {
  if (!isQuoteCartPage()) {
    return;
  }

  const initialize = () => {
    if (initializeQuotePdfImportInterface()) {
      return;
    }

    if (typeof MutationObserver !== "function") {
      return;
    }

    const observer = new MutationObserver(() => {
      if (initializeQuotePdfImportInterface()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.setTimeout(() => observer.disconnect(), 15000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
}

// =========================================
// Compatibility Data Layer
// =========================================

function normalizeCartItemsForCompatibility(cartItems) {
  const normalizedCartItems = Array.isArray(cartItems)
    ? cartItems
        .map((item) => {
          if (typeof item === "string") {
            return { sku: item, title: "" };
          }

          if (!item || typeof item !== "object") {
            return null;
          }

          return {
            sku: item.sku || "",
            title: item.title || "",
          };
        })
        .filter(Boolean)
    : [];

  const uniqueCartItems = [];
  const seenItemKeys = new Set();
  normalizedCartItems.forEach((item) => {
    const dedupeKey = `${item.sku}::${item.title}`;
    if (seenItemKeys.has(dedupeKey) || (!item.sku && !item.title)) {
      return;
    }

    seenItemKeys.add(dedupeKey);
    uniqueCartItems.push(item);
  });

  return uniqueCartItems;
}

function getCompatibilityStatus(computerData, dockSku) {
  const incompatibleWith = Array.isArray(computerData.incompatibleWith)
    ? computerData.incompatibleWith
    : [];
  const partiallyCompatibleWith = Array.isArray(
    computerData.partiallyCompatibleWith,
  )
    ? computerData.partiallyCompatibleWith
    : [];

  if (incompatibleWith.includes(dockSku)) {
    return { text: "Incompatible", backgroundColor: "#FFDDDD" };
  }

  if (partiallyCompatibleWith.includes(dockSku)) {
    return { text: "Partial", backgroundColor: "#FFF6CC" };
  }

  return { text: "Compatible", backgroundColor: "#DDF5DD" };
}

function getUnmappedCompatibilityItemText(item) {
  const itemTitle = item.title ? item.title.trim() : "";
  const itemSku = item.sku ? item.sku.trim() : "";

  if (itemTitle && itemSku) {
    return `${itemTitle} (SKU: ${itemSku})`;
  }

  if (itemTitle) {
    return itemTitle;
  }

  if (itemSku) {
    return `SKU: ${itemSku}`;
  }

  return "";
}

async function buildCompatibilityData(cartData) {
  const cartItems = normalizeCartItemsForCompatibility(
    (cartData && cartData.items) || [],
  ).map((item) => ({
    sku: item.sku,
    title: item.title,
  }));

  if (!cartItems.length) {
    return null;
  }

  let compatibilityData;
  try {
    const response = await fetch(COMPATIBILITY_DATA_URL);
    if (!response.ok) {
      throw new Error(
        `Compatibility JSON request failed with status ${response.status}`,
      );
    }
    compatibilityData = await response.json();
  } catch (error) {
    console.error("Unable to load compatibility data for quote PDF:", error);
    return null;
  }

  const compatibilityRoot =
    compatibilityData && typeof compatibilityData === "object"
      ? compatibilityData
      : {};
  const computers =
    compatibilityRoot.computers &&
    typeof compatibilityRoot.computers === "object"
      ? compatibilityRoot.computers
      : {};
  const docks =
    compatibilityRoot.docks && typeof compatibilityRoot.docks === "object"
      ? compatibilityRoot.docks
      : {};

  const visibleComputers = Object.keys(computers).reduce((accumulator, sku) => {
    const item = computers[sku];
    if (!item || item.hidden) {
      return accumulator;
    }

    accumulator[sku] = item;
    return accumulator;
  }, {});

  const visibleDocks = Object.keys(docks).reduce((accumulator, sku) => {
    const item = docks[sku];
    if (!item || item.hidden) {
      return accumulator;
    }

    accumulator[sku] = item;
    return accumulator;
  }, {});

  const computerIndexes = buildCompatibilityIndexes(visibleComputers);
  const dockIndexes = buildCompatibilityIndexes(visibleDocks);

  const cartComputers = [];
  const cartDocks = [];
  const seenComputerKeys = new Set();
  const seenDockKeys = new Set();
  const unmappedItems = [];

  cartItems.forEach((item) => {
    const matchedComputerKey = resolveCompatibilityKey(
      item,
      visibleComputers,
      computerIndexes,
    );
    const matchedDockKey = resolveCompatibilityKey(
      item,
      visibleDocks,
      dockIndexes,
    );

    if (matchedComputerKey && !seenComputerKeys.has(matchedComputerKey)) {
      seenComputerKeys.add(matchedComputerKey);
      cartComputers.push(matchedComputerKey);
    }

    if (matchedDockKey && !seenDockKeys.has(matchedDockKey)) {
      seenDockKeys.add(matchedDockKey);
      cartDocks.push(matchedDockKey);
    }

    if (!matchedComputerKey && !matchedDockKey) {
      unmappedItems.push(item);
    }
  });

  if (!cartComputers.length && !cartDocks.length && !unmappedItems.length) {
    return null;
  }

  const matrixAvailable = cartComputers.length > 0 && cartDocks.length > 0;
  const notes = [];
  const matrixTables = [];

  if (matrixAvailable) {
    const MAX_DOCK_COLUMNS_PER_TABLE = 6;
    const dockChunks = chunkArray(cartDocks, MAX_DOCK_COLUMNS_PER_TABLE);

    dockChunks.forEach((dockChunk) => {
      const rows = cartComputers.map((computerSku) => {
        const computerData = visibleComputers[computerSku] || {};

        const cells = dockChunk.map((dockSku) => {
          const status = getCompatibilityStatus(computerData, dockSku);
          const rawNoteText =
            computerData.compatibilityData &&
            computerData.compatibilityData[dockSku] &&
            computerData.compatibilityData[dockSku].notes;
          const noteText =
            typeof rawNoteText === "string" ? rawNoteText.trim() : "";

          let noteIndex = null;
          if (noteText) {
            noteIndex = notes.length + 1;
            notes.push({
              index: noteIndex,
              computerName: computerData.name || computerSku,
              dockName:
                (visibleDocks[dockSku] && visibleDocks[dockSku].name) ||
                dockSku,
              text: noteText,
            });
          }

          return {
            dockSku,
            statusText: status.text,
            backgroundColor: status.backgroundColor,
            noteIndex,
          };
        });

        return {
          computerSku,
          computerName: computerData.name || computerSku,
          cells,
        };
      });

      matrixTables.push({
        dockChunk,
        rows,
      });
    });
  }

  return {
    matrixAvailable,
    matrixTables,
    visibleDocks,
    notes,
    unmappedItems,
  };
}

// =========================================
// Document Model Layer
// =========================================

function splitQuoteRowIfNeeded(rowData) {
  const detailWithKinds = rowData.detailLines.flatMap((line, index) =>
    splitTextIntoFragments(line).map((text) => ({
      text,
      isOptionLine: index < rowData.optionLineCount,
    })),
  );

  if (!detailWithKinds.length) {
    return [
      {
        ...rowData,
        detailLines: [],
        optionLineCount: 0,
      },
    ];
  }

  const rowFragments = [];
  for (
    let index = 0;
    index < detailWithKinds.length;
    index += PDF_QUOTE_DETAIL_LINES_PER_FRAGMENT
  ) {
    const fragmentDetailLines = detailWithKinds.slice(
      index,
      index + PDF_QUOTE_DETAIL_LINES_PER_FRAGMENT,
    );
    const optionLineCount = fragmentDetailLines.filter(
      (line) => line.isOptionLine,
    ).length;

    rowFragments.push({
      title: index === 0 ? rowData.title : `${rowData.title} (continued)`,
      titleHref: index === 0 ? rowData.titleHref : "",
      detailLines: fragmentDetailLines.map((line) => line.text),
      optionLineCount,
      sku: index === 0 ? rowData.sku : "",
      priceText: index === 0 ? rowData.priceText : "",
      quantityText: index === 0 ? rowData.quantityText : "",
      lineTotalText: index === 0 ? rowData.lineTotalText : "",
      compatibilityPayload: rowData.compatibilityPayload,
    });
  }

  return rowFragments;
}

function splitCompatibilityRowIfNeeded(rowData) {
  const nameFragments = splitTextIntoFragments(
    rowData.computerName,
    PDF_COMPATIBILITY_NAME_MAX_CHARS,
  );

  if (nameFragments.length <= 1) {
    return [rowData];
  }

  return nameFragments.map((computerName, index) => ({
    computerSku: rowData.computerSku,
    computerName: index === 0 ? computerName : `${computerName} (continued)`,
    cells:
      index === 0
        ? rowData.cells
        : rowData.cells.map(() => ({
            statusText: "",
            backgroundColor: "#ffffff",
            noteIndex: null,
          })),
  }));
}

function buildQuoteDocumentModel({ cartData, compatibilityData, date }) {
  const today = date instanceof Date ? date : new Date();
  const dateOptions = { year: "numeric", month: "long", day: "numeric" };

  const rawRows = Array.isArray(cartData?.items) ? cartData.items : [];
  const quoteRows = rawRows.flatMap((rowData) =>
    splitQuoteRowIfNeeded({
      title: rowData.title,
      titleHref: rowData.titleHref,
      detailLines: [...rowData.optionLines, ...rowData.specLines],
      optionLineCount: rowData.optionLineCount,
      sku: rowData.sku,
      priceText: rowData.priceText,
      quantityText: rowData.quantityText,
      lineTotalText: rowData.lineTotalText,
      compatibilityPayload: {
        sku: rowData.sku,
        title: rowData.title,
      },
    }),
  );

  const cartItemsForCompatibility = rawRows
    .map((rowData) => ({ sku: rowData.sku, title: rowData.title }))
    .filter((item) => item.sku || item.title);

  const hasCompatibilitySides = Boolean(
    compatibilityData && compatibilityData.matrixAvailable,
  );
  const compatibilityModel = hasCompatibilitySides
    ? {
        ...compatibilityData,
        matrixTables: compatibilityData.matrixTables.map((tableChunk) => ({
          dockChunk: tableChunk.dockChunk,
          rows: tableChunk.rows.flatMap((row) =>
            splitCompatibilityRowIfNeeded(row),
          ),
        })),
      }
    : null;

  return {
    header: {
      title: "TechHub Quote",
      dateText: today.toLocaleDateString(undefined, dateOptions),
    },
    quoteRows,
    grandTotalText: cartData?.grandTotalText || "",
    footer: {
      disclaimerHtml: `
        <p><strong>This quote is not a pricing guarantee. Due to fluctuations in the technology market, pricing may change without notice. We recommend being attentive to in-cart pricing at the time of purchase.</strong></p>
        
        <p>An approved purchaser can log in to
        <a href="https://techhub.tamu.edu/" class="pdf-link">TechHub</a>
        to complete the purchase. See
        <a href="https://tamu.mybigcommerce.com/terms-and-conditions/" class="pdf-link">Terms and Conditions.</a></p>
      `,
    },
    compatibility: compatibilityModel,
    cartItemsForCompatibility,
  };
}

// =========================================
// Rendering Layer
// =========================================

function injectQuoteStyles() {
  const existing = document.getElementById("quote-pdf-styles");
  if (existing) {
    return;
  }

  const styleTag = document.createElement("style");
  styleTag.id = "quote-pdf-styles";
  styleTag.textContent = `
    .pdf-root { font-family: "Open Sans", sans-serif; width: 190mm; background: #fff; color: #000; }
    .quote-table table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 10px; }
    .quote-table th, .quote-table td { border: 1px solid #000; padding: 8px; font-size: 12px; }
    .quote-table thead { display: table-row-group; }
    .quote-table col.quote-col-item { width: 46%; }
    .quote-table col.quote-col-sku { width: 14%; }
    .quote-table col.quote-col-price { width: 14%; }
    .quote-table col.quote-col-quantity { width: 10%; }
    .quote-table col.quote-col-total { width: 16%; }
    .avoid-break { page-break-inside: avoid; break-inside: avoid; }
    .pdf-page { width: 190mm; min-height: 257mm; padding-bottom: 0; box-sizing: border-box; background: #fff; }
    .pdf-header { margin-bottom: 20px; }
    .pdf-title { font-size: 24px; color: #500000; }
    .pdf-date { font-size: 14px; color: #000; }
    .quote-table th { background: #f2f2f2; text-align: left; overflow-wrap: anywhere; word-break: break-word; }
    .quote-table th.quote-price,
    .quote-table th.quote-quantity,
    .quote-table th.quote-total { text-align: right; }
    .quote-table td { vertical-align: middle; overflow-wrap: anywhere; word-break: break-word; }
    .quote-table .quote-title-cell { text-align: left; }
    .quote-table .quote-sku-cell { text-align: left; }
    .quote-table .quote-price-cell,
    .quote-table .quote-quantity-cell,
    .quote-table .quote-total-cell { text-align: right; }
    .quote-detail-line { font-size: 12px; color: #333; padding-left: 10px; }
    .quote-detail-line.option-line { margin-top: 7px; }
    .quote-detail-line.spec-line { margin-top: 4px; }
    .quote-title-link { border-bottom-color: transparent; color: inherit; text-decoration: none; }
    .grand-total { margin-top: 20px; margin-bottom: 8px; text-align: right; font-weight: bold; }
    .grand-total-label { margin-right: 10px; }
    .pdf-footer { margin-top: 14px; font-size: 12px; line-height: 1.4; color: #000; text-align: center; }
    .pdf-footer p { margin: 0; }
    .pdf-footer p + p { margin-top: 6px; }
    .pdf-footer .pdf-link { font-size: 12px; }
    .compatibility-section { margin-top: 20px; }
    .compatibility-title { margin-top: 16px; margin-bottom: 10px; font-size: 18px; font-weight: 700; color: #222; }
    .compatibility-intro { font-size: 12px; margin-bottom: 10px; color: #333; }
    .compatibility-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 10px; }
    .compatibility-table thead { display: table-row-group; }
    .compatibility-table th { border: 1px solid #000; padding: 6px; font-size: 10.5px; background: #f2f2f2; text-align: center; overflow-wrap: anywhere; word-break: break-word; }
    .compatibility-table th.compatibility-laptop { text-align: left; }
    .compatibility-table td { border: 1px solid #000; padding: 6px; font-size: 10.5px; overflow-wrap: anywhere; word-break: break-word; }
    .compatibility-table td.compatibility-computer { text-align: left; font-weight: 600; }
    .compatibility-cell { text-align: center; vertical-align: middle; color: #1f1f1f; font-weight: 600; }
    .compatibility-cell sup { font-weight: 700; }
    .compatibility-legend { font-size: 11px; color: #333; margin-bottom: 6px; }
    .compatibility-notes-title { font-size: 13px; font-weight: 700; margin-top: 8px; margin-bottom: 5px; }
    .compatibility-note { display: table; table-layout: fixed; width: 100%; margin-bottom: 3px; }
    .compatibility-note-number { display: table-cell; width: 20px; padding-right: 4px; vertical-align: top; font-weight: 600; }
    .compatibility-note-text { display: table-cell; vertical-align: top; }
    .compatibility-unmapped-title { font-size: 11px; font-weight: 700; margin-top: 14px; margin-bottom: 4px; color: #555; }
    .compatibility-unmapped-row { font-size: 11px; color: #555; margin-left: 20px; margin-bottom: 2px; overflow-wrap: anywhere; word-break: break-word; }
    .pdf-exporting { position: fixed; left: 0; top: 0; visibility: visible; z-index: -1; pointer-events: none; display: block !important; background-color: #ffffff !important; color: #000000 !important; opacity: 1; }
  `;
  document.head.appendChild(styleTag);
}

function updatePdfPageSizing(metrics) {
  if (!metrics || typeof metrics.contentWidthPx !== "number") {
    return;
  }

  const existing = document.getElementById("quote-pdf-metrics");
  const styleTag = existing || document.createElement("style");
  styleTag.id = "quote-pdf-metrics";
  styleTag.textContent = `
    .pdf-page { width: ${metrics.contentWidthPx}px; max-width: ${metrics.contentWidthPx}px; }
  `;

  if (!existing) {
    document.head.appendChild(styleTag);
  }
}

function renderQuoteDocument(model) {
  const root = document.createElement("div");
  root.className = "pdf-root";

  const headerContainer = document.createElement("div");
  headerContainer.className = "pdf-header";

  const title = document.createElement("div");
  title.className = "pdf-title";
  title.textContent = model.header.title;
  headerContainer.appendChild(title);

  const date = document.createElement("div");
  date.className = "pdf-date";
  date.textContent = model.header.dateText;
  headerContainer.appendChild(date);

  root.appendChild(headerContainer);

  const quoteTableWrapper = document.createElement("div");
  quoteTableWrapper.className = "quote-table";
  const quoteTable = document.createElement("table");
  quoteTableWrapper.appendChild(quoteTable);

  const columnGroup = document.createElement("colgroup");
  const columnClasses = [
    "quote-col-item",
    "quote-col-sku",
    "quote-col-price",
    "quote-col-quantity",
    "quote-col-total",
  ];
  columnClasses.forEach((className) => {
    const column = document.createElement("col");
    column.className = className;
    columnGroup.appendChild(column);
  });
  quoteTable.appendChild(columnGroup);

  const tableHead = document.createElement("thead");
  const tableBody = document.createElement("tbody");

  const headerRow = document.createElement("tr");
  const itemHeader = document.createElement("th");
  itemHeader.textContent = "Item";
  itemHeader.colSpan = 2;
  headerRow.appendChild(itemHeader);

  const priceHeader = document.createElement("th");
  priceHeader.textContent = "Price";
  priceHeader.className = "quote-price";
  headerRow.appendChild(priceHeader);

  const quantityHeader = document.createElement("th");
  quantityHeader.textContent = "Quantity";
  quantityHeader.className = "quote-quantity";
  headerRow.appendChild(quantityHeader);

  const totalHeader = document.createElement("th");
  totalHeader.textContent = "Total";
  totalHeader.className = "quote-total";
  headerRow.appendChild(totalHeader);

  tableHead.appendChild(headerRow);
  quoteTable.appendChild(tableHead);
  quoteTable.appendChild(tableBody);

  model.quoteRows.forEach((rowData) => {
    const itemRow = document.createElement("tr");
    itemRow.className = "avoid-break";

    const titleCell = document.createElement("td");
    titleCell.className = "quote-title-cell";
    if (rowData.titleHref) {
      const titleAnchor = document.createElement("a");
      titleAnchor.href = rowData.titleHref;
      titleAnchor.textContent = rowData.title;
      titleAnchor.className = "quote-title-link";
      titleCell.appendChild(titleAnchor);
    } else {
      titleCell.textContent = rowData.title;
    }

    rowData.detailLines.forEach((line, index) => {
      const detailLine = document.createElement("div");
      detailLine.textContent = line;
      detailLine.className =
        index < rowData.optionLineCount
          ? "quote-detail-line option-line"
          : "quote-detail-line spec-line";
      titleCell.appendChild(detailLine);
    });

    itemRow.appendChild(titleCell);

    const skuCell = document.createElement("td");
    skuCell.className = "quote-sku-cell";
    skuCell.textContent = rowData.sku;
    itemRow.appendChild(skuCell);

    const priceCell = document.createElement("td");
    priceCell.className = "quote-price-cell";
    priceCell.textContent = rowData.priceText;
    itemRow.appendChild(priceCell);

    const quantityCell = document.createElement("td");
    quantityCell.className = "quote-quantity-cell";
    quantityCell.textContent = rowData.quantityText;
    itemRow.appendChild(quantityCell);

    const totalCell = document.createElement("td");
    totalCell.className = "quote-total-cell";
    totalCell.textContent = rowData.lineTotalText;
    itemRow.appendChild(totalCell);

    tableBody.appendChild(itemRow);
  });

  root.appendChild(quoteTableWrapper);

  if (model.grandTotalText) {
    const grandTotalContainer = document.createElement("div");
    grandTotalContainer.className = "grand-total";

    const grandTotalLabel = document.createElement("span");
    grandTotalLabel.className = "grand-total-label";
    grandTotalLabel.textContent = "Grand Total: ";
    grandTotalContainer.appendChild(grandTotalLabel);

    const grandTotalValue = document.createElement("span");
    grandTotalValue.textContent = model.grandTotalText;
    grandTotalContainer.appendChild(grandTotalValue);

    root.appendChild(grandTotalContainer);
  }

  const footerContainer = document.createElement("div");
  footerContainer.className = "pdf-footer";
  footerContainer.innerHTML = model.footer.disclaimerHtml;
  root.appendChild(footerContainer);

  if (model.compatibility) {
    const compatibilitySection = document.createElement("div");
    compatibilitySection.className = "compatibility-section";

    const matrixHeading = document.createElement("div");
    matrixHeading.className = "compatibility-title";
    matrixHeading.textContent = "Cart Compatibility Matrix";
    compatibilitySection.appendChild(matrixHeading);

    const matrixIntro = document.createElement("div");
    matrixIntro.className = "compatibility-intro";
    matrixIntro.textContent =
      "This section checks only laptops and docks/hubs/monitors currently in this cart.";
    compatibilitySection.appendChild(matrixIntro);

    if (!model.compatibility.matrixAvailable) {
      const matrixUnavailable = document.createElement("div");
      matrixUnavailable.className = "compatibility-unmapped-row";
      matrixUnavailable.textContent =
        "Matrix unavailable: matching laptop and dock/hub/monitor entries were not both found.";
      compatibilitySection.appendChild(matrixUnavailable);
    } else {
      model.compatibility.matrixTables.forEach((tableChunk) => {
        const matrixTable = document.createElement("table");
        matrixTable.className = "compatibility-table";

        const tableHead = document.createElement("thead");
        const tableBody = document.createElement("tbody");
        const headerRow = document.createElement("tr");

        const laptopHeader = document.createElement("th");
        laptopHeader.className = "compatibility-laptop";
        laptopHeader.textContent = "Laptop";
        headerRow.appendChild(laptopHeader);

        tableChunk.dockChunk.forEach((dockSku) => {
          const dockHeader = document.createElement("th");
          const dockData = model.compatibility.visibleDocks[dockSku] || {};
          dockHeader.textContent = dockData.name || dockSku;
          headerRow.appendChild(dockHeader);
        });

        tableHead.appendChild(headerRow);
        matrixTable.appendChild(tableHead);
        matrixTable.appendChild(tableBody);

        tableChunk.rows.forEach((rowData) => {
          const row = document.createElement("tr");
          row.className = "avoid-break";

          const computerCell = document.createElement("td");
          computerCell.className = "compatibility-computer";
          computerCell.textContent = rowData.computerName;
          row.appendChild(computerCell);

          rowData.cells.forEach((cellData) => {
            const compatibilityCell = document.createElement("td");
            compatibilityCell.className = "compatibility-cell";
            compatibilityCell.textContent = cellData.statusText;
            compatibilityCell.style.backgroundColor = cellData.backgroundColor;

            if (cellData.noteIndex) {
              const superscript = document.createElement("sup");
              superscript.textContent = ` ${cellData.noteIndex}`;
              compatibilityCell.appendChild(superscript);
            }

            row.appendChild(compatibilityCell);
          });

          tableBody.appendChild(row);
        });

        compatibilitySection.appendChild(matrixTable);
      });

      const legend = document.createElement("div");
      legend.className = "compatibility-legend";
      legend.textContent =
        "Legend: Compatible (green), Partial (yellow), Incompatible (red).";
      compatibilitySection.appendChild(legend);
    }

    if (model.compatibility.notes.length) {
      const notesHeader = document.createElement("div");
      notesHeader.className = "compatibility-notes-title";
      notesHeader.textContent = "Compatibility Notes";
      compatibilitySection.appendChild(notesHeader);

      model.compatibility.notes.forEach((note) => {
        const noteItem = document.createElement("div");
        noteItem.className = "compatibility-note";

        const noteNumber = document.createElement("span");
        noteNumber.className = "compatibility-note-number";
        noteNumber.textContent = `${note.index}.`;

        const noteContent = document.createElement("span");
        noteContent.className = "compatibility-note-text";
        noteContent.textContent = `${note.computerName} + ${note.dockName}: ${note.text}`;

        noteItem.appendChild(noteNumber);
        noteItem.appendChild(noteContent);
        compatibilitySection.appendChild(noteItem);
      });
    }

    if (model.compatibility.unmappedItems.length) {
      const unmappedHeader = document.createElement("div");
      unmappedHeader.className = "compatibility-unmapped-title";
      unmappedHeader.textContent = "Not included in matrix";
      compatibilitySection.appendChild(unmappedHeader);

      model.compatibility.unmappedItems
        .map((item) => getUnmappedCompatibilityItemText(item))
        .filter(Boolean)
        .forEach((itemText) => {
          const row = document.createElement("div");
          row.className = "compatibility-unmapped-row";
          row.textContent = `- ${itemText}`;
          compatibilitySection.appendChild(row);
        });
    }

    root.appendChild(compatibilitySection);
  }

  return root;
}

// =========================================
// Pagination Layer
// =========================================

function buildQuoteTableChunk(
  wrapperClassName,
  columnClasses,
  headerCells,
  rowNodes,
) {
  const wrapper = document.createElement("div");
  wrapper.className = wrapperClassName;

  const table = document.createElement("table");
  wrapper.appendChild(table);

  const columnGroup = document.createElement("colgroup");
  columnClasses.forEach((className) => {
    const column = document.createElement("col");
    column.className = className;
    columnGroup.appendChild(column);
  });
  table.appendChild(columnGroup);

  const tableHead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerCells.forEach((cell) => {
    const headerCell = document.createElement("th");
    headerCell.textContent = cell.text;
    headerCell.className = cell.className;
    if (cell.colSpan > 1) {
      headerCell.colSpan = cell.colSpan;
    }
    if (cell.rowSpan > 1) {
      headerCell.rowSpan = cell.rowSpan;
    }
    headerRow.appendChild(headerCell);
  });
  tableHead.appendChild(headerRow);
  table.appendChild(tableHead);

  const tableBody = document.createElement("tbody");
  rowNodes.forEach((rowNode) => {
    tableBody.appendChild(rowNode.cloneNode(true));
  });
  table.appendChild(tableBody);

  return wrapper;
}

function parseQuoteTableStructure(quoteTableWrapper) {
  const quoteTable = quoteTableWrapper.querySelector("table");
  const quoteBody = quoteTable?.querySelector("tbody");
  const quoteHeadRow = quoteTable?.querySelector("thead tr");
  const quoteColumnNodes = quoteTable
    ? Array.from(quoteTable.querySelectorAll("colgroup col"))
    : [];
  const quoteRows = quoteBody ? Array.from(quoteBody.children) : [];

  if (!quoteTable || !quoteBody || !quoteHeadRow || !quoteRows.length) {
    return null;
  }

  const columnClasses = quoteColumnNodes.map(
    (columnNode) => columnNode.className,
  );
  const headerCells = Array.from(quoteHeadRow.children).map((cellNode) => ({
    text: cellNode.textContent || "",
    className: cellNode.className,
    colSpan: cellNode.colSpan || 1,
    rowSpan: cellNode.rowSpan || 1,
  }));

  return {
    wrapperClassName: quoteTableWrapper.className,
    columnClasses,
    headerCells,
    rowTemplates: quoteRows,
  };
}

function buildQuoteTableFromStructure(quoteTableStructure, rowNodes) {
  return buildQuoteTableChunk(
    quoteTableStructure.wrapperClassName,
    quoteTableStructure.columnClasses,
    quoteTableStructure.headerCells,
    rowNodes,
  );
}

function buildCompatibilityTableChunk(
  tableAttributes,
  nonBodyChildren,
  rowNodes,
) {
  const chunkTable = document.createElement("table");
  tableAttributes.forEach((attribute) => {
    chunkTable.setAttribute(attribute.name, attribute.value);
  });

  nonBodyChildren.forEach((childNode) => {
    chunkTable.appendChild(childNode.cloneNode(true));
  });

  const chunkBody = document.createElement("tbody");
  rowNodes.forEach((rowNode) => {
    chunkBody.appendChild(rowNode.cloneNode(true));
  });
  chunkTable.appendChild(chunkBody);

  return chunkTable;
}

function parseCompatibilityTableStructure(compatibilityTable) {
  const tableBody = compatibilityTable.querySelector("tbody");
  const tableRows = tableBody ? Array.from(tableBody.children) : [];

  if (!tableBody || !tableRows.length) {
    return null;
  }

  return {
    tableAttributes: Array.from(compatibilityTable.attributes).map(
      (attribute) => ({
        name: attribute.name,
        value: attribute.value,
      }),
    ),
    nonBodyChildren: Array.from(compatibilityTable.children).filter(
      (childNode) => childNode.tagName !== "TBODY",
    ),
    rowTemplates: tableRows,
  };
}

function buildCompatibilityTableFromStructure(
  compatibilityTableStructure,
  rowNodes,
) {
  return buildCompatibilityTableChunk(
    compatibilityTableStructure.tableAttributes,
    compatibilityTableStructure.nonBodyChildren,
    rowNodes,
  );
}

function splitCompatibilitySectionIntoBlocks(compatibilitySection) {
  const sectionChildren = Array.from(compatibilitySection.children);
  if (!sectionChildren.length) {
    return [{ node: compatibilitySection, keepWithNext: false }];
  }

  const blocks = [];
  const headingClasses = new Set([
    "compatibility-title",
    "compatibility-intro",
  ]);
  const introBlock = document.createElement("div");
  introBlock.className = compatibilitySection.className;

  let childIndex = 0;
  while (
    childIndex < sectionChildren.length &&
    headingClasses.has(sectionChildren[childIndex].className)
  ) {
    introBlock.appendChild(sectionChildren[childIndex]);
    childIndex += 1;
  }

  if (introBlock.children.length > 0) {
    blocks.push({ node: introBlock, keepWithNext: true });
  }

  for (; childIndex < sectionChildren.length; childIndex += 1) {
    const childNode = sectionChildren[childIndex];

    if (childNode.classList.contains("compatibility-table")) {
      const parsedCompatibilityTable = parseCompatibilityTableStructure(childNode);
      if (!parsedCompatibilityTable) {
        blocks.push({ node: childNode, keepWithNext: false });
        continue;
      }

      blocks.push({
        keepWithNext: false,
        adaptiveCompatibilityTable: true,
        compatibilityTable: parsedCompatibilityTable,
      });
      continue;
    }

    blocks.push({
      node: childNode,
      keepWithNext:
        childNode.classList.contains("compatibility-notes-title") ||
        childNode.classList.contains("compatibility-unmapped-title"),
    });
  }

  if (!blocks.length) {
    return [{ node: compatibilitySection, keepWithNext: false }];
  }

  return blocks;
}

function buildPaginableBlocks(root) {
  const blocks = [];

  function isAdaptiveTableBlock(block) {
    return Boolean(block.adaptiveQuoteTable || block.adaptiveCompatibilityTable);
  }

  function mergeKeepWithNextBlocks(blockList) {
    const mergedBlocks = [];

    for (let index = 0; index < blockList.length; index += 1) {
      const block = blockList[index];
      if (!block.keepWithNext || index >= blockList.length - 1) {
        mergedBlocks.push(block);
        continue;
      }

      const nextBlock = blockList[index + 1];
      if (isAdaptiveTableBlock(block) || isAdaptiveTableBlock(nextBlock)) {
        mergedBlocks.push(block);
        continue;
      }

      const combinedWrapper = document.createElement("div");
      combinedWrapper.className = "keep-with-next-group";
      combinedWrapper.appendChild(block.node);
      combinedWrapper.appendChild(nextBlock.node);

      mergedBlocks.push({
        node: combinedWrapper,
        keepWithNext: nextBlock.keepWithNext,
      });

      index += 1;
    }

    return mergedBlocks;
  }

  Array.from(root.children).forEach((node) => {
    if (node.classList.contains("pdf-header")) {
      blocks.push({ node, keepWithNext: true });
      return;
    }

    if (node.classList.contains("quote-table")) {
      const parsedQuoteTable = parseQuoteTableStructure(node);
      if (!parsedQuoteTable) {
        blocks.push({ node, keepWithNext: false });
        return;
      }

      blocks.push({
        keepWithNext: false,
        adaptiveQuoteTable: true,
        quoteTable: parsedQuoteTable,
      });
      return;
    }

    if (node.classList.contains("grand-total")) {
      blocks.push({ node, keepWithNext: true });
      return;
    }

    if (node.classList.contains("compatibility-section")) {
      blocks.push(...splitCompatibilitySectionIntoBlocks(node));
      return;
    }

    blocks.push({ node, keepWithNext: false });
  });

  return mergeKeepWithNextBlocks(blocks);
}

function hasMeaningfulText(node) {
  if (!node) {
    return false;
  }

  return Boolean(node.textContent && node.textContent.trim());
}

function hasMeaningfulTableRows(page, tableSelector) {
  if (!page) {
    return false;
  }

  const tableRows = Array.from(page.querySelectorAll(`${tableSelector} tbody tr`));
  return tableRows.some((row) => hasMeaningfulText(row));
}

function hasMeaningfulSelectorText(page, selector) {
  if (!page) {
    return false;
  }

  const matchedNodes = Array.from(page.querySelectorAll(selector));
  return matchedNodes.some((node) => hasMeaningfulText(node));
}

function isMeaningfulPdfPage(page) {
  if (!page) {
    return false;
  }

  const meaningfulTextSelectors = [
    ".pdf-header .pdf-title",
    ".pdf-date",
    ".grand-total",
    ".pdf-footer p",
    ".compatibility-note",
    ".compatibility-unmapped-row",
    ".compatibility-legend",
  ];

  if (hasMeaningfulTableRows(page, ".quote-table")) {
    return true;
  }

  if (hasMeaningfulTableRows(page, ".compatibility-table")) {
    return true;
  }

  return meaningfulTextSelectors.some((selector) =>
    hasMeaningfulSelectorText(page, selector),
  );
}

function paginateDocument(root, metrics) {
  if (!root) {
    throw new Error("Cannot paginate without a root node.");
  }

  updatePdfPageSizing(metrics);

  const pages = [];
  let currentPage = null;
  const pagedRoot = document.createElement("div");
  pagedRoot.id = "pdf-container";
  document.body.appendChild(pagedRoot);

  function isMeaningfulPage(page) {
    return isMeaningfulPdfPage(page);
  }

  function removePageFromState(page) {
    if (!page) {
      return;
    }

    const pageIndex = pages.indexOf(page);
    if (pageIndex !== -1) {
      pages.splice(pageIndex, 1);
    }

    if (page.parentNode) {
      page.remove();
    }
  }

  function ensureCurrentPageIsMounted() {
    if (!currentPage || currentPage.parentNode === pagedRoot) {
      return;
    }

    pagedRoot.appendChild(currentPage);
  }

  function createPage() {
    if (currentPage && !isMeaningfulPage(currentPage)) {
      removePageFromState(currentPage);
      currentPage = pages.length ? pages[pages.length - 1] : null;
    }

    const page = document.createElement("div");
    page.className = "pdf-page";
    currentPage = page;
    pages.push(page);
    return page;
  }

  function appendNode(node) {
    if (!currentPage) {
      createPage();
    }

    ensureCurrentPageIsMounted();

    currentPage.appendChild(node);
  }

  function appendBlockWithOverflowCheck(node) {
    appendNode(node);
    if (!isOverflowing()) {
      return;
    }

    currentPage.removeChild(node);
    createPage();
    appendNode(node);
  }

  function isOverflowing() {
    if (!currentPage) {
      return false;
    }

    return currentPage.scrollHeight > metrics.contentHeightPx;
  }

  function pageHasContent() {
    return Boolean(currentPage && currentPage.children.length > 0);
  }

  function pageHasOnlyQuoteHeader() {
    if (!currentPage || currentPage.children.length !== 1) {
      return false;
    }

    return currentPage.children[0].classList.contains("pdf-header");
  }

  function pageHasOnlyCompatibilityIntro() {
    if (!currentPage || currentPage.children.length !== 1) {
      return false;
    }

    const compatibilitySection = currentPage.children[0];
    if (!compatibilitySection.classList.contains("compatibility-section")) {
      return false;
    }

    const introNodes = Array.from(
      compatibilitySection.querySelectorAll(
        ".compatibility-title, .compatibility-intro",
      ),
    );
    if (!introNodes.length) {
      return false;
    }

    const hasOnlyIntroChildren = Array.from(compatibilitySection.children).every(
      (childNode) =>
        childNode.classList.contains("compatibility-title") ||
        childNode.classList.contains("compatibility-intro"),
    );
    if (!hasOnlyIntroChildren) {
      return false;
    }

    if (
      compatibilitySection.querySelector(".compatibility-table tbody tr") ||
      compatibilitySection.querySelector(".compatibility-note") ||
      compatibilitySection.querySelector(".compatibility-unmapped-row") ||
      compatibilitySection.querySelector(".compatibility-legend")
    ) {
      return false;
    }

    return true;
  }

  function canFitNodeOnCurrentPage(node) {
    appendNode(node);
    const overflowed = isOverflowing();
    currentPage.removeChild(node);
    return !overflowed;
  }

  function measureFittingRowCount(remainingRows, buildChunkNode) {
    let fittingRowCount = 0;

    for (
      let candidateRowCount = 1;
      candidateRowCount <= remainingRows.length;
      candidateRowCount += 1
    ) {
      const candidateChunk = buildChunkNode(
        remainingRows.slice(0, candidateRowCount),
      );
      appendNode(candidateChunk);
      const overflowed = isOverflowing();
      currentPage.removeChild(candidateChunk);

      if (overflowed) {
        break;
      }

      fittingRowCount = candidateRowCount;
    }

    return fittingRowCount;
  }

  function appendAdaptiveTableRows(tableStructure, buildTableNode) {
    if (!tableStructure || !Array.isArray(tableStructure.rowTemplates)) {
      return false;
    }

    const allRows = tableStructure.rowTemplates;
    if (!allRows.length) {
      return false;
    }

    if (!currentPage) {
      createPage();
    }

    let hadPriorPageContent = pageHasContent();
    if (hadPriorPageContent) {
      const fullTableNode = buildTableNode(allRows);
      if (!canFitNodeOnCurrentPage(fullTableNode)) {
        if (!pageHasOnlyQuoteHeader() && !pageHasOnlyCompatibilityIntro()) {
          createPage();
          hadPriorPageContent = false;
        }
      }
    }

    let hasRetriedTinyFirstChunk = false;
    let nextRowStartIndex = 0;

    while (nextRowStartIndex < allRows.length) {
      const remainingRows = allRows.slice(nextRowStartIndex);
      let fittingRowCount = measureFittingRowCount(remainingRows, buildTableNode);

      const canRetryTinyFirstChunk =
        !hasRetriedTinyFirstChunk &&
        hadPriorPageContent &&
        !pageHasOnlyQuoteHeader() &&
        !pageHasOnlyCompatibilityIntro() &&
        fittingRowCount === 1 &&
        remainingRows.length > 1;

      if (canRetryTinyFirstChunk) {
        createPage();
        hadPriorPageContent = false;
        hasRetriedTinyFirstChunk = true;
        continue;
      }

      if (fittingRowCount === 0) {
        const shouldCreateOverflowPage =
          pageHasContent() &&
          !pageHasOnlyQuoteHeader() &&
          !pageHasOnlyCompatibilityIntro();

        if (shouldCreateOverflowPage) {
          createPage();
          hadPriorPageContent = false;
          continue;
        }

        const oversizedChunk = buildTableNode(remainingRows.slice(0, 1));
        appendNode(oversizedChunk);
        nextRowStartIndex += 1;
        hadPriorPageContent = true;

        if (nextRowStartIndex < allRows.length) {
          createPage();
          hadPriorPageContent = false;
        }

        continue;
      }

      const tableChunk = buildTableNode(remainingRows.slice(0, fittingRowCount));
      appendNode(tableChunk);
      nextRowStartIndex += fittingRowCount;
      hadPriorPageContent = true;

      if (nextRowStartIndex < allRows.length) {
        createPage();
        hadPriorPageContent = false;
      }
    }

    return true;
  }

  function appendAdaptiveQuoteTable(block) {
    const quoteTable = block.quoteTable;
    const wasHandled = appendAdaptiveTableRows(quoteTable, (rowNodes) =>
      buildQuoteTableFromStructure(quoteTable, rowNodes),
    );

    if (!wasHandled && block.node) {
      appendBlockWithOverflowCheck(block.node);
    }
  }

  function appendAdaptiveCompatibilityTable(block) {
    const compatibilityTable = block.compatibilityTable;
    const wasHandled = appendAdaptiveTableRows(compatibilityTable, (rowNodes) =>
      buildCompatibilityTableFromStructure(compatibilityTable, rowNodes),
    );

    if (!wasHandled && block.node) {
      appendBlockWithOverflowCheck(block.node);
    }
  }

  const blocks = buildPaginableBlocks(root);
  blocks.forEach((block) => {
    if (block.adaptiveQuoteTable) {
      appendAdaptiveQuoteTable(block);
      return;
    }

    if (block.adaptiveCompatibilityTable) {
      appendAdaptiveCompatibilityTable(block);
      return;
    }

    appendBlockWithOverflowCheck(block.node);
  });

  const renderedPages = Array.from(pagedRoot.querySelectorAll(".pdf-page"));
  for (let pageIndex = renderedPages.length - 1; pageIndex >= 0; pageIndex -= 1) {
    const page = renderedPages[pageIndex];
    if (isMeaningfulPage(page)) {
      break;
    }

    removePageFromState(page);
  }

  if (pagedRoot.parentNode) {
    pagedRoot.remove();
  }

  return pagedRoot;
}

// =========================================
// PDF Export Layer
// =========================================

async function exportPdf(container, opt, cartManifest) {
  if (!container) {
    throw new Error("Cannot export PDF without a container.");
  }

  if (typeof html2pdf !== "function") {
    throw new Error("html2pdf is unavailable for quote PDF export.");
  }

  const exportClassName = "pdf-exporting";
  const hadExportClass = container.classList.contains(exportClassName);
  container.classList.add(exportClassName);

  const exportIframe = document.createElement("iframe");
  exportIframe.setAttribute("aria-hidden", "true");
  exportIframe.setAttribute("tabindex", "-1");
  exportIframe.style.position = "fixed";
  exportIframe.style.left = "0";
  exportIframe.style.top = "0";
  exportIframe.style.width = "0";
  exportIframe.style.height = "0";
  exportIframe.style.border = "0";
  exportIframe.style.pointerEvents = "none";

  let exportDocument = null;
  let exportWindow = null;

  try {
    document.body.appendChild(exportIframe);

    exportDocument = exportIframe.contentDocument;
    exportWindow = exportIframe.contentWindow;

    if (!exportDocument || !exportWindow) {
      throw new Error("Unable to initialize hidden export iframe.");
    }

    exportDocument.open();
    exportDocument.write("<!doctype html><html><head></head><body></body></html>");
    exportDocument.close();

    const styleTagIds = ["quote-pdf-styles", "quote-pdf-metrics"];
    styleTagIds.forEach((styleTagId) => {
      const sourceStyleTag = document.getElementById(styleTagId);
      if (!sourceStyleTag || !sourceStyleTag.textContent) {
        return;
      }

      const targetStyleTag = exportDocument.createElement("style");
      targetStyleTag.id = styleTagId;
      targetStyleTag.textContent = sourceStyleTag.textContent;
      exportDocument.head.appendChild(targetStyleTag);
    });

    exportDocument.body.style.margin = "0";
    exportDocument.body.appendChild(container);

    await new Promise((resolve) => exportWindow.requestAnimationFrame(resolve));
    await new Promise((resolve) => exportWindow.requestAnimationFrame(resolve));

    const pageNodes = Array.from(container.querySelectorAll(".pdf-page"));
    const meaningfulPageNodes = pageNodes.filter((pageNode) =>
      isMeaningfulPdfPage(pageNode),
    );
    if (!meaningfulPageNodes.length) {
      throw new Error("No paginated PDF pages were found for export.");
    }

    const marginArray = Array.isArray(opt?.margin) ? opt.margin : PDF_MARGIN_MM;
    const marginTop = Number(marginArray[0]) || 0;
    const marginRight = Number(marginArray[1]) || 0;
    const marginBottom = Number(marginArray[2]) || 0;
    const marginLeft = Number(marginArray[3]) || 0;
    const html2canvasOptions = {
      scale: 1.5,
      ...(opt?.html2canvas || {}),
      scrollX: 0,
      scrollY: 0,
      allowTaint: false,
      useCORS: true,
      backgroundColor: "#ffffff",
    };

    const imageType =
      typeof opt?.image?.type === "string" &&
      opt.image.type.toLowerCase() === "png"
        ? "PNG"
        : "JPEG";
    const imageMimeType = imageType === "PNG" ? "image/png" : "image/jpeg";
    const imageQuality =
      typeof opt?.image?.quality === "number" ? opt.image.quality : 0.98;

    const firstPageNode = meaningfulPageNodes[0];
    const firstCaptureWidth = Math.max(
      1,
      Math.max(firstPageNode.scrollWidth, firstPageNode.offsetWidth),
    );
    const firstCaptureHeight = Math.max(
      1,
      Math.max(firstPageNode.scrollHeight, firstPageNode.offsetHeight),
    );

    const firstPageWorker = html2pdf()
      .from(firstPageNode)
      .set({
        ...opt,
        pagebreak: { mode: [] },
        html2canvas: {
          ...html2canvasOptions,
          width: firstCaptureWidth,
          height: firstCaptureHeight,
          windowWidth: firstCaptureWidth,
          windowHeight: firstCaptureHeight,
        },
      })
      .toPdf();

    const pdf = await firstPageWorker.get("pdf");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const maxRenderWidth = Math.max(1, pageWidth - marginLeft - marginRight);
    const maxRenderHeight = Math.max(1, pageHeight - marginTop - marginBottom);

    for (
      let pageIndex = 1;
      pageIndex < meaningfulPageNodes.length;
      pageIndex += 1
    ) {
      const pageNode = meaningfulPageNodes[pageIndex];
      const captureWidth = Math.max(
        1,
        Math.max(pageNode.scrollWidth, pageNode.offsetWidth),
      );
      const captureHeight = Math.max(
        1,
        Math.max(pageNode.scrollHeight, pageNode.offsetHeight),
      );

      const canvas = await html2pdf()
        .from(pageNode)
        .set({
          html2canvas: {
            ...html2canvasOptions,
            width: captureWidth,
            height: captureHeight,
            windowWidth: captureWidth,
            windowHeight: captureHeight,
          },
          pagebreak: { mode: [] },
        })
        .toCanvas()
        .get("canvas");

      let renderWidth = maxRenderWidth;
      let renderHeight = (canvas.height * renderWidth) / canvas.width;
      if (renderHeight > maxRenderHeight) {
        const scaleFactor = maxRenderHeight / renderHeight;
        renderHeight = maxRenderHeight;
        renderWidth *= scaleFactor;
      }

      pdf.addPage();
      const offsetX = marginLeft;
      const imageData = canvas.toDataURL(imageMimeType, imageQuality);
      pdf.addImage(
        imageData,
        imageType,
        offsetX,
        marginTop,
        renderWidth,
        renderHeight,
      );
    }

    const pageCount = pdf.internal.getNumberOfPages();
    pdf.setFontSize(10);
    pdf.setTextColor(80, 80, 80);

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      pdf.setPage(pageNumber);
      pdf.text(`Page ${pageNumber} of ${pageCount}`, pageWidth / 2, pageHeight - 10, {
        align: "center",
      });
    }

    if (typeof pdf.setProperties !== "function") {
      throw new Error("jsPDF metadata support is unavailable.");
    }

    pdf.setProperties({
      title: "TechHub Quote",
      subject: buildCartManifestPdfSubject(cartManifest),
      author: "Texas A&M University TechHub",
      keywords: `${QUOTE_CART_MANIFEST_SCHEMA}, restorable cart`,
      creator: "TechHub Quote Builder",
    });

    pdf.save(opt?.filename || "TechHub Quote.pdf");
  } finally {
    if (!hadExportClass) {
      container.classList.remove(exportClassName);
    }
    if (container.parentNode) {
      container.remove();
    }
    if (exportIframe.parentNode) {
      exportIframe.remove();
    }
  }
}

function cloneFixtureData(value) {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function createFixtureSnapshot({
  cartData,
  compatibilityData,
  model,
  cartManifest = null,
}) {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";
  return {
    capturedAt: new Date().toISOString(),
    version: QUOTE_PDF_FIXTURE_VERSION,
    pathname,
    cartData: cloneFixtureData(cartData),
    compatibilityData: cloneFixtureData(compatibilityData),
    model: cloneFixtureData(model),
    cartManifest: cloneFixtureData(cartManifest),
  };
}

function setLatestFixtureSnapshot(snapshot) {
  latestQuotePdfSnapshot = snapshot ? cloneFixtureData(snapshot) : null;
}

function getLatestFixtureSnapshot() {
  return latestQuotePdfSnapshot
    ? cloneFixtureData(latestQuotePdfSnapshot)
    : null;
}

function buildQuoteExportOptions(model) {
  return {
    margin: PDF_MARGIN_MM,
    filename: `TechHub Quote - ${model.header.dateText}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 1.5,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };
}

async function renderAndPaginateModel(model) {
  injectQuoteStyles();
  await waitForFontsReady();

  const renderedRoot = renderQuoteDocument(model);
  const paginationMetrics = getPdfContentMetrics();
  return paginateDocument(renderedRoot, paginationMetrics);
}

function buildModelFromFixture(fixture) {
  if (!fixture || typeof fixture !== "object") {
    throw new Error("Fixture must be a non-null object.");
  }

  const cartData =
    fixture.cartData && typeof fixture.cartData === "object"
      ? fixture.cartData
      : { items: [], grandTotalText: "" };
  const compatibilityData = fixture.compatibilityData || null;
  const cartManifest = fixture.cartManifest || null;

  const fixtureDate = fixture.capturedAt
    ? new Date(fixture.capturedAt)
    : new Date();
  const validDate = Number.isNaN(fixtureDate.getTime())
    ? new Date()
    : fixtureDate;

  return {
    cartData,
    compatibilityData,
    cartManifest,
    model: buildQuoteDocumentModel({
      cartData,
      compatibilityData,
      date: validDate,
    }),
  };
}

function isQuotePdfTestEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get(QUOTE_PDF_TEST_QUERY_PARAM) === "1";
}

function initializeQuotePdfTestNamespace() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (!isQuotePdfTestEnabled()) {
    return;
  }

  const testApi = {
    captureLatest() {
      return getLatestFixtureSnapshot();
    },
    downloadLatestFixture(filename) {
      const snapshot = getLatestFixtureSnapshot();
      if (!snapshot) {
        throw new Error("No quote fixture snapshot is available yet.");
      }

      const fixtureText = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([fixtureText], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeFileName =
        typeof filename === "string" && filename.trim()
          ? filename.trim()
          : `quote-fixture-${Date.now()}.json`;

      anchor.href = downloadUrl;
      anchor.download = safeFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);

      return snapshot;
    },
    async loadFixtureFromObject(fixture) {
      const { cartData, compatibilityData, cartManifest, model } =
        buildModelFromFixture(fixture);
      const snapshot = createFixtureSnapshot({
        cartData,
        compatibilityData,
        model,
        cartManifest,
      });
      setLatestFixtureSnapshot(snapshot);

      const pagedRoot = await renderAndPaginateModel(model);
      const exportOptions = buildQuoteExportOptions(model);
      if (!cartManifest) {
        throw new Error(
          "This fixture does not contain a cart manifest for PDF export.",
        );
      }
      await exportPdf(pagedRoot, exportOptions, cartManifest);

      return {
        pageCount: Array.from(pagedRoot.querySelectorAll(".pdf-page")).filter(
          (pageNode) => isMeaningfulPdfPage(pageNode),
        ).length,
        snapshot,
      };
    },
    async previewFixtureFromObject(fixture) {
      const { cartData, compatibilityData, model } =
        buildModelFromFixture(fixture);
      const snapshot = createFixtureSnapshot({
        cartData,
        compatibilityData,
        model,
      });
      setLatestFixtureSnapshot(snapshot);

      const pagedRoot = await renderAndPaginateModel(model);
      document.body.appendChild(pagedRoot);

      return {
        pageCount: Array.from(pagedRoot.querySelectorAll(".pdf-page")).filter(
          (pageNode) => isMeaningfulPdfPage(pageNode),
        ).length,
        container: pagedRoot,
        snapshot,
      };
    },
  };

  window[QUOTE_PDF_TEST_NAMESPACE] = testApi;
}

// =========================================
// Entrypoint
// =========================================

async function generateQuotePdf() {
  const cartData = extractCartData();
  const cartManifest = await fetchCurrentCartManifest();
  const compatibilityData = await buildCompatibilityData(cartData);
  const model = buildQuoteDocumentModel({
    cartData,
    compatibilityData,
    date: new Date(),
  });
  setLatestFixtureSnapshot(
    createFixtureSnapshot({
      cartData,
      compatibilityData,
      model,
      cartManifest,
    }),
  );

  const pagedRoot = await renderAndPaginateModel(model);
  const exportOptions = buildQuoteExportOptions(model);

  await exportPdf(pagedRoot, exportOptions, cartManifest);
}

initializeQuotePdfTestNamespace();
initializeQuotePdfImportWhenReady();

document.addEventListener("click", async function (event) {
  if (event.target && event.target.id === "generate-quote") {
    try {
      await generateQuotePdf();
    } catch (error) {
      console.error("Quote PDF generation failed:", error);
      window.alert(
        "TechHub could not generate a restorable quote PDF. Please refresh the cart and try again.",
      );
    }
  }

  if (event.target && event.target.id === "send-quote") {
    event.preventDefault();
    console.log("Send Quote button clicked");

    setTimeout(function () {
      window.location.href =
        "https://techhubtest.mybigcommerce.com/send-quote/";
    }, 100);
  }
});
