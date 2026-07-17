import { describe, expect, it, vi } from "vitest";
import { createGooglePlacesLoader } from "../load-places-library";

describe("createGooglePlacesLoader", () => {
  it("returns a safe missing-key state without touching the DOM", async () => {
    const loader = createGooglePlacesLoader({ apiKey: "" });
    await expect(loader()).resolves.toEqual({ status: "missing_key" });
  });

  it("is SSR-safe when a key exists without browser globals", async () => {
    const loader = createGooglePlacesLoader({ apiKey: "test-key" });
    await expect(loader()).resolves.toEqual({ status: "unavailable", reason: "not_in_browser" });
  });

  it("shares one in-flight Places import across concurrent callers", async () => {
    let resolveImport!: (value: unknown) => void;
    const importLibrary = vi.fn(() => new Promise((resolve) => { resolveImport = resolve; }));
    const fakeWindow = { google: { maps: { importLibrary } } } as never;
    const fakeDocument = {} as Document;
    const loader = createGooglePlacesLoader({
      apiKey: "test-key",
      window: fakeWindow,
      document: fakeDocument,
    });

    const first = loader();
    const second = loader();
    expect(first).toBe(second);
    expect(importLibrary).toHaveBeenCalledTimes(1);

    class FakeAutocompleteElement {}
    resolveImport({ PlaceAutocompleteElement: FakeAutocompleteElement });
    await expect(first).resolves.toMatchObject({ status: "available" });
    await expect(second).resolves.toMatchObject({ status: "available" });
  });

  it("turns a Places import rejection into a safe unavailable result", async () => {
    const fakeWindow = {
      google: { maps: { importLibrary: vi.fn().mockRejectedValue(new Error("load failed")) } },
    } as never;
    const loader = createGooglePlacesLoader({
      apiKey: "test-key",
      window: fakeWindow,
      document: {} as Document,
    });
    await expect(loader()).resolves.toEqual({ status: "unavailable", reason: "library_error" });
  });
});
