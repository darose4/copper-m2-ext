// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  getPlans,
  getProducts,
  type Plan,
  type ProductId,
} from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

const PRODUCT_IDS = ["copper-home", "copper-notes"] as const;

/** Round to whole cents. */
const cents = (usd: number) => Math.round(usd * 100) / 100;

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map(({ id, name, type, priceUsd, colors }) => ({
      id,
      name,
      type,
      priceUsd,
      colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

export const calculateCostInput: z.ZodType<CalculateCostInput> = z.object({
  products: z.array(z.enum(PRODUCT_IDS)).max(5),
  plan: z.enum(["free", "copper-plus"]),
  billing: z.enum(["monthly", "annual"]),
  years: z.number().int().min(1).max(5),
});

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const products = getProducts();
  const lines: CostBreakdown["lines"] = [];

  // Each device is paid for once.
  for (const id of input.products) {
    const product = products.find((p) => p.id === id);
    if (product)
      lines.push({ item: product.name, usd: cents(product.priceUsd) });
  }

  // Copper Plus covers the whole household, so it's one line however many
  // devices there are. The free plan costs nothing, so it adds no line.
  const plan = getPlans().find((p) => p.id === input.plan);
  if (plan && plan.id !== "free") {
    const usd =
      input.billing === "monthly"
        ? plan.monthlyUsd * 12 * input.years
        : plan.annualUsd * input.years;
    const label = input.billing === "monthly" ? "monthly" : "yearly";
    lines.push({
      item: `${plan.name}, paid ${label}, ${input.years} ${input.years === 1 ? "year" : "years"}`,
      usd: cents(usd),
    });
  }

  return {
    lines,
    totalUsd: cents(lines.reduce((sum, line) => sum + line.usd, 0)),
  };
}

export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> =
  z.object({
    product: z.enum(PRODUCT_IDS),
    color: z.string().optional(),
  });

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find((p) => p.id === input.product);
  if (!product) {
    return { status: "unavailable", message: "That product isn't known." };
  }

  // Check the color against the catalog first, so a color the product doesn't
  // come in is never mistaken for a stock problem.
  const wanted = input.color?.trim().toLowerCase();
  const colors = wanted
    ? product.colors.filter((c) => c.toLowerCase() === wanted)
    : product.colors;
  if (wanted && colors.length === 0) {
    return {
      status: "not_a_color",
      product: product.name,
      color: input.color ?? "",
      colors: product.colors,
    };
  }

  // Stock changes, so read it every time and never keep a copy.
  const rows = await readInventory();
  if (rows === null) {
    return {
      status: "unavailable",
      message: "Stock can't be checked right now.",
    };
  }

  // A stock row holds the product's display name, not its id.
  const stock = colors.flatMap((color) => {
    const row = rows.find(
      (r) => r.product === product.name && r.color === color,
    );
    if (!row) return [];
    const level: Stock =
      row.units_in_stock === 0
        ? "backordered"
        : row.units_in_stock < 10
          ? "low_stock"
          : "in_stock";
    return [
      {
        color,
        stock: level,
        restockDate: level === "backordered" ? row.next_shipment : null,
      },
    ];
  });

  return { status: "ok", product: product.name, colors: stock };
}

export type CompareProductsInput = { products: ProductId[] };

export type ProductComparison = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
    features: string[];
  }[];
  /** How much cheaper the cheaper one is, in dollars (0 when the prices match). */
  priceDifferenceUsd: number;
  /** Name of the cheaper product, or null when the prices match. */
  cheaper: string | null;
  /** Colors both products come in. */
  sharedColors: string[];
};

export const compareProductsInput: z.ZodType<CompareProductsInput> = z
  .object({ products: z.array(z.enum(PRODUCT_IDS)).length(2) })
  .refine(({ products }) => products[0] !== products[1], {
    message: "Pick two different products to compare.",
  });

/** compare_products: two products side by side, all from the catalog. */
export function compareProducts({
  products: [firstId, secondId],
}: CompareProductsInput): ProductComparison {
  const catalog = getProducts();
  const first = catalog.find((p) => p.id === firstId);
  const second = catalog.find((p) => p.id === secondId);
  if (!first || !second) throw new Error("Unknown product.");

  const priceDifferenceUsd = cents(Math.abs(first.priceUsd - second.priceUsd));
  const cheaper =
    priceDifferenceUsd === 0
      ? null
      : first.priceUsd < second.priceUsd
        ? first.name
        : second.name;

  return {
    products: [first, second].map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      priceUsd: p.priceUsd,
      colors: p.colors,
      features: p.features.map((f) => f.name),
    })),
    priceDifferenceUsd,
    cheaper,
    sharedColors: first.colors.filter((c) => second.colors.includes(c)),
  };
}

/** The tools the model can call. The descriptions tell it when to use each one. */
export const copperTools: ToolSet = {
  get_products: tool({
    description:
      "List every Copper product with its type, price and the colors it comes in (no stock information).",
    inputSchema: z.object({}),
    execute: async () => listProducts(),
  }),
  get_prices: tool({
    description:
      "Get the current price of every Copper product and the monthly and yearly price of each plan.",
    inputSchema: z.object({}),
    execute: async () => getPrices(),
  }),
  calculate_cost: tool({
    description:
      "Work out the total cost of devices plus a plan, billed monthly or yearly, over a number of years.",
    inputSchema: calculateCostInput,
    execute: async (input) => calculateCost(input),
  }),
  check_availability: tool({
    description:
      "Check whether a product, or one of its colors, is in stock today, low on stock or back-ordered.",
    inputSchema: checkAvailabilityInput,
    execute: async (input) => checkAvailability(input),
  }),
};

/**
 * The extension: the four course tools plus compare_products. `copperTools`
 * stays at exactly four because the course's tests require that; Ask Copper
 * uses this list.
 */
export const extendedTools: ToolSet = {
  ...copperTools,
  compare_products: tool({
    description:
      "Compare two Copper products side by side: price, type, colors, features, and which one costs less.",
    inputSchema: compareProductsInput,
    execute: async (input) => compareProducts(input),
  }),
};
