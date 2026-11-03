// The extension: a fifth Ask Copper tool, compare_products. Everything it says
// comes from the catalog, so these tests change the catalog and check that the
// answers follow.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@/lib/copper/catalog");
  vi.resetModules();
});

async function loadTools() {
  vi.resetModules();
  return import("@/lib/copper/assistant/tools");
}

describe("compare_products", () => {
  it("puts Copper Home and Copper Notes side by side from the catalog", async () => {
    const { compareProducts, compareProductsInput } = await loadTools();
    const result = compareProducts(
      compareProductsInput.parse({ products: ["copper-home", "copper-notes"] }),
    );

    expect(result.products.map((p) => [p.name, p.priceUsd])).toEqual([
      ["Copper Home", 149],
      ["Copper Notes", 129],
    ]);
    expect(result.cheaper).toBe("Copper Notes");
    expect(result.priceDifferenceUsd).toBe(20);
    // Night Sky is the one color both products come in.
    expect(result.sharedColors).toEqual(["Night Sky"]);
    for (const product of result.products) {
      expect(product.features).toHaveLength(3);
      expect(product.colors.length).toBeGreaterThan(0);
    }
  });

  it("keeps the order the shopper asked for", async () => {
    const { compareProducts } = await loadTools();
    const result = compareProducts({
      products: ["copper-notes", "copper-home"],
    });
    expect(result.products.map((p) => p.id)).toEqual([
      "copper-notes",
      "copper-home",
    ]);
    expect(result.cheaper).toBe("Copper Notes");
    expect(result.priceDifferenceUsd).toBe(20);
  });

  it("follows the catalog when prices change", async () => {
    vi.doMock("@/lib/copper/catalog", async (importOriginal) => {
      const real =
        await importOriginal<typeof import("@/lib/copper/catalog")>();
      return {
        ...real,
        getProducts: () =>
          real
            .getProducts()
            .map((p) =>
              p.id === "copper-home" ? { ...p, priceUsd: 99.5 } : p,
            ),
      };
    });
    const { compareProducts } = await loadTools();
    const result = compareProducts({
      products: ["copper-home", "copper-notes"],
    });
    expect(result.cheaper).toBe("Copper Home");
    expect(result.priceDifferenceUsd).toBe(29.5);
  });

  it("says so when the prices match", async () => {
    vi.doMock("@/lib/copper/catalog", async (importOriginal) => {
      const real =
        await importOriginal<typeof import("@/lib/copper/catalog")>();
      return {
        ...real,
        getProducts: () =>
          real.getProducts().map((p) => ({ ...p, priceUsd: 100 })),
      };
    });
    const { compareProducts } = await loadTools();
    const result = compareProducts({
      products: ["copper-home", "copper-notes"],
    });
    expect(result.cheaper).toBeNull();
    expect(result.priceDifferenceUsd).toBe(0);
  });

  it("rejects input outside its contract", async () => {
    const { compareProductsInput } = await loadTools();
    const bad = [
      { products: ["copper-home"] }, // needs two
      { products: ["copper-home", "copper-home"] }, // two different ones
      { products: ["copper-home", "copper-notes", "copper-home"] }, // exactly two
      { products: ["copper-home", "copper-watch"] }, // not a Copper product
      { products: [] },
      {},
    ];
    for (const input of bad) {
      expect(
        compareProductsInput.safeParse(input).success,
        JSON.stringify(input),
      ).toBe(false);
    }
    expect(
      compareProductsInput.safeParse({
        products: ["copper-notes", "copper-home"],
      }).success,
    ).toBe(true);
  });

  it("is a fifth tool for Ask Copper, while the four course tools stay four", async () => {
    const { copperTools, extendedTools } = await loadTools();
    expect(Object.keys(copperTools)).toHaveLength(4);
    expect(Object.keys(extendedTools).sort()).toEqual([
      "calculate_cost",
      "check_availability",
      "compare_products",
      "get_prices",
      "get_products",
    ]);
    const tool = extendedTools.compare_products;
    expect(tool.description).toMatch(/\w{4,}/);
    expect(typeof tool.execute).toBe("function");
  });

  it("is mentioned in Copper's instructions and has a plain-English label", async () => {
    const { COPPER_INSTRUCTIONS } =
      await import("@/lib/copper/assistant/instructions");
    const { TOOL_LABELS } = await import("@/lib/copper/assistant/progress");
    expect(COPPER_INSTRUCTIONS).toContain("compare_products");
    expect(TOOL_LABELS.compare_products).toBeTruthy();
  });
});
