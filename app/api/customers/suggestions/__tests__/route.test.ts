import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const searchScopedCustomerSuggestions = vi.fn();
const createClient = vi.fn(async () => ({ auth: { getUser } }));

vi.mock("@/lib/customers/visibility", () => ({
  searchScopedCustomerSuggestions: (...args: unknown[]) =>
    searchScopedCustomerSuggestions(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

async function getSuggestions(query: string | null) {
  const { GET } = await import("@/app/api/customers/suggestions/route");
  const url = new URL("http://localhost/api/customers/suggestions");
  if (query !== null) url.searchParams.set("q", query);
  return GET(new Request(url));
}

describe("GET /api/customers/suggestions — scoped customer typeahead", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    searchScopedCustomerSuggestions.mockResolvedValue({
      results: [{ id: "cust-1", label: "Acme Co" }],
    });
  });

  it("returns 401 and never searches when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await getSuggestions("acme");

    expect(res.status).toBe(401);
    expect(searchScopedCustomerSuggestions).not.toHaveBeenCalled();
  });

  it("returns empty suggestions without searching when the query is shorter than 2 characters", async () => {
    const res = await getSuggestions("a");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
    expect(searchScopedCustomerSuggestions).not.toHaveBeenCalled();
  });

  it("treats a whitespace-padded 1-character query as too short after trimming", async () => {
    const res = await getSuggestions("  a  ");

    expect(await res.json()).toEqual({ suggestions: [] });
    expect(searchScopedCustomerSuggestions).not.toHaveBeenCalled();
  });

  it("returns empty suggestions when the query param is absent", async () => {
    const res = await getSuggestions(null);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
    expect(searchScopedCustomerSuggestions).not.toHaveBeenCalled();
  });

  it("searches with the trimmed query scoped to the caller and returns the scoped results", async () => {
    const res = await getSuggestions("  acme  ");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [{ id: "cust-1", label: "Acme Co" }] });
    expect(searchScopedCustomerSuggestions).toHaveBeenCalledWith({
      supabase: expect.anything(),
      userId: "user-1",
      searchText: "acme",
      resultLimit: 6,
    });
  });
});
