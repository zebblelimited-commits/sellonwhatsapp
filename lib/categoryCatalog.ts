import { STORE_CATEGORIES } from "@/app/dashboard/nigeriaData";

export type StoreCategoryRecord = Record<string, unknown>;

export const HOME_CATEGORY_DEFINITIONS = [
  {
    id: "fashion",
    name: "Fashion",
    iconKey: "fashion",
    aliases: ["fashion", "fashion & clothing", "shoes & footwear", "bags & luggage", "jewelry & watches"],
  },
  {
    id: "tech",
    name: "Tech",
    iconKey: "tech",
    aliases: ["tech", "technology", "electronics", "phones & tablets", "computers & accessories", "electronics & gadgets", "gaming & consoles"],
  },
  {
    id: "beauty",
    name: "Beauty",
    iconKey: "beauty",
    aliases: ["beauty", "beauty & personal care", "makeup artist", "hair salon", "nail technician", "spa services"],
  },
  {
    id: "home-decor",
    name: "Home Decor",
    iconKey: "home",
    aliases: ["home", "home decor", "home & kitchen", "furniture", "home appliances", "home repairs", "interior design"],
  },
  {
    id: "food-drinks",
    name: "Food & Drinks",
    iconKey: "food",
    aliases: ["food", "food & drinks", "groceries & food items", "drinks & beverages", "catering services", "private chef"],
  },
  {
    id: "digital-products",
    name: "Digital Products",
    iconKey: "digital",
    aliases: ["digital", "digital products"],
  },
  {
    id: "services",
    name: "Services",
    iconKey: "services",
    aliases: ["service", "services"],
  },
] as const;

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function matchesAlias(values: string[], aliases: readonly string[]) {
  return aliases.some((alias) => {
    const target = normalize(alias);
    return values.some((value) => value === target || value.includes(target) || target.includes(value));
  });
}

export function isPublicStore(store: StoreCategoryRecord) {
  const status = normalize(store.status);
  return (
    store.isDeleted !== true &&
    store.isActive !== false &&
    !["inactive", "banned", "suspended"].includes(status)
  );
}

function storeCategoryValues(store: StoreCategoryRecord) {
  return [
    store.mainCategory,
    store.subCategory,
    store.category,
    store.storeCategory,
    store.businessCategory,
    store.categoryName,
  ]
    .map(normalize)
    .filter(Boolean);
}

export function matchesHomeCategory(store: StoreCategoryRecord, categoryId: string) {
  const values = storeCategoryValues(store);
  const mainCategory = values[0];
  const definition = HOME_CATEGORY_DEFINITIONS.find((category) => category.id === categoryId);
  if (!definition) return false;

  if (categoryId === "digital-products" && mainCategory === "digital-products") return true;
  if (categoryId === "services" && ["freelance-services", "bookable-services", "events-tickets"].includes(mainCategory)) return true;

  return matchesAlias(values, definition.aliases);
}

export function countHomeCategoryStores(stores: StoreCategoryRecord[], categoryId: string) {
  return stores.filter((store) => isPublicStore(store) && matchesHomeCategory(store, categoryId)).length;
}

export function countCategoryStores(stores: StoreCategoryRecord[], categoryId: string) {
  const category = STORE_CATEGORIES.find((item) => item.id === categoryId);
  if (!category) return 0;

  return stores.filter((store) => {
    if (!isPublicStore(store)) return false;
    const values = storeCategoryValues(store);
    return (
      matchesAlias(values, [categoryId, category.name]) ||
      category.subcategories.some((subcategory) => matchesAlias(values, [subcategory]))
    );
  }).length;
}

export function countSubcategoryStores(
  stores: StoreCategoryRecord[],
  subcategory: string,
) {
  const target = normalize(subcategory);
  return stores.filter((store) => isPublicStore(store) && matchesAlias(storeCategoryValues(store), [target])).length;
}

export { STORE_CATEGORIES };
