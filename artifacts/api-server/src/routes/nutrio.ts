import { Router, type IRouter } from "express";
import {
  CreateContactMessageBody,
  CreateContactMessageResponse,
  CreateFoodOrderBody,
  CreateFoodOrderResponse,
  CreateGymPartnershipBody,
  CreateGymPartnershipResponse,
  GetFoodParams,
  GetFoodResponse,
  GetFoodsResponse,
  GetGymsQueryParams,
  GetGymsResponse,
  GetRecipeParams,
  GetRecipeResponse,
  GetRecipesResponse,
} from "@workspace/api-zod";
import {
  db,
  foodOrdersTable,
  gymPartnershipsTable,
  contactMessagesTable,
} from "@workspace/db";
import { catalogueRows, findCatalogueItem, publicListing } from "../lib/catalogue-store";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

function trimInput(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(trimInput);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, trimInput(item)]),
    );
  }
  return value;
}

router.get("/foods", async (_req, res): Promise<void> => {
  res.json(GetFoodsResponse.parse((await catalogueRows("food", true)).map(publicListing)));
});

router.get("/foods/:slug", async (req, res): Promise<void> => {
  const parsed = GetFoodParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid food identifier." });
    return;
  }
  const food = await findCatalogueItem("food", parsed.data.slug);
  if (!food) {
    res.status(404).json({ error: "Food not found." });
    return;
  }
  res.json(GetFoodResponse.parse(food));
});

router.get("/recipes", async (_req, res): Promise<void> => {
  res.json(GetRecipesResponse.parse((await catalogueRows("recipe", true)).map(publicListing)));
});

router.get("/recipes/:slug", async (req, res): Promise<void> => {
  const parsed = GetRecipeParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid recipe identifier." });
    return;
  }
  const recipe = await findCatalogueItem("recipe", parsed.data.slug);
  if (!recipe) {
    res.status(404).json({ error: "Recipe not found." });
    return;
  }
  res.json(GetRecipeResponse.parse(recipe));
});

router.get("/gyms", async (req, res): Promise<void> => {
  const parsed = GetGymsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid location search." });
    return;
  }
  const search = parsed.data.search?.trim().toLowerCase() ?? "";
  const gyms = GetGymsResponse.parse((await catalogueRows("gym", true)).map(publicListing));
  const result = gyms.filter((gym) =>
    `${gym.name} ${gym.locality} ${gym.city}`.toLowerCase().includes(search),
  );
  res.json(GetGymsResponse.parse(result));
});

router.post("/food-orders", async (req, res): Promise<void> => {
  const parsed = CreateFoodOrderBody.safeParse(trimInput(req.body));
  if (!parsed.success) {
    res.status(400).json({ error: "Please check the order details and try again." });
    return;
  }
  const data = parsed.data;
  if (!/^[+()\d\s-]{8,20}$/.test(data.phone)) {
    res.status(400).json({ error: "Please enter a valid contact phone number." });
    return;
  }
  let totalInRupees = 0;
  for (const item of data.items) {
    const food = await findCatalogueItem("food", item.foodSlug, true);
    if (!food || !("priceInRupees" in food)) {
      res.status(400).json({ error: "A selected food is no longer in the catalogue." });
      return;
    }
    totalInRupees += food.priceInRupees * item.quantity;
  }
  const [order] = await db
    .insert(foodOrdersTable)
    .values({ ...data, totalInRupees, ownerId: getAuth(req).userId })
    .returning();
  if (!order) throw new Error("Order enquiry could not be stored.");
  res.status(201).json(
    CreateFoodOrderResponse.parse({
      id: `NTR-${String(order.id).padStart(5, "0")}`,
      status: "Enquiry received — pending confirmation",
      submittedAt: order.createdAt.toISOString(),
      totalInRupees,
      itemCount: data.items.reduce((total, item) => total + item.quantity, 0),
    }),
  );
});

router.post("/gym-partnerships", async (req, res): Promise<void> => {
  const parsed = CreateGymPartnershipBody.safeParse(trimInput(req.body));
  if (!parsed.success) {
    res.status(400).json({ error: "Please check the partnership details and try again." });
    return;
  }
  if (!/^[+()\d\s-]{8,20}$/.test(parsed.data.phone)) {
    res.status(400).json({ error: "Please enter a valid contact phone number." });
    return;
  }
  const [enquiry] = await db
    .insert(gymPartnershipsTable)
    .values({ ...parsed.data, ownerId: getAuth(req).userId })
    .returning();
  if (!enquiry) throw new Error("Partnership enquiry could not be stored.");
  res.status(201).json(
    CreateGymPartnershipResponse.parse({
      id: `PARTNER-${String(enquiry.id).padStart(5, "0")}`,
      submittedAt: enquiry.createdAt.toISOString(),
      message: "Your partnership enquiry has been received.",
    }),
  );
});

router.post("/contact-messages", async (req, res): Promise<void> => {
  const parsed = CreateContactMessageBody.safeParse(trimInput(req.body));
  if (!parsed.success) {
    res.status(400).json({ error: "Please check your message and try again." });
    return;
  }
  const [message] = await db
    .insert(contactMessagesTable)
    .values({ ...parsed.data, ownerId: getAuth(req).userId })
    .returning();
  if (!message) throw new Error("Contact message could not be stored.");
  res.status(201).json(
    CreateContactMessageResponse.parse({
      id: `CONTACT-${String(message.id).padStart(5, "0")}`,
      submittedAt: message.createdAt.toISOString(),
      message: "Your message has been received.",
    }),
  );
});

export default router;
