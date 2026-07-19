export const GOOGLE_MAPS_SCRIPT_ID = "everystep-google-maps-javascript";

export type PlaceLike = {
  addressComponents?: readonly unknown[] | null;
  fetchFields(options: { fields: readonly ["addressComponents"] }): Promise<void>;
};

type PlacePredictionLike = {
  toPlace(): PlaceLike;
};

export type PlacePredictionSelectEventLike = Event & {
  placePrediction?: PlacePredictionLike;
};

export type PlaceAutocompleteElementLike = HTMLElement & {
  includedRegionCodes: string[];
  includedPrimaryTypes: string[];
  placeholder: string;
};

export type PlacesLibraryLike = {
  PlaceAutocompleteElement: new () => PlaceAutocompleteElementLike;
};

type GoogleMapsGlobal = {
  maps?: {
    importLibrary?: (name: "places") => Promise<unknown>;
  };
};

type BrowserWindow = Window & { google?: GoogleMapsGlobal };

export type PlacesLoadResult =
  | { status: "available"; library: PlacesLibraryLike }
  | { status: "missing_key" }
  | { status: "unavailable"; reason: "not_in_browser" | "script_error" | "library_error" };

type LoaderEnvironment = {
  apiKey?: string;
  window?: BrowserWindow;
  document?: Document;
};

function configuredBrowserKey(): string {
  return String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY ?? "").trim();
}

function scriptUrl(apiKey: string): string {
  const params = new URLSearchParams({
    key: apiKey,
    loading: "async",
    v: "weekly",
    language: "en",
    region: "US",
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

async function importPlaces(win: BrowserWindow): Promise<PlacesLoadResult> {
  const importLibrary = win.google?.maps?.importLibrary;
  if (!importLibrary) return { status: "unavailable", reason: "library_error" };

  try {
    const library = (await importLibrary("places")) as PlacesLibraryLike;
    if (typeof library?.PlaceAutocompleteElement !== "function") {
      return { status: "unavailable", reason: "library_error" };
    }
    return { status: "available", library };
  } catch {
    return { status: "unavailable", reason: "library_error" };
  }
}

async function importPlacesWithRetry(win: BrowserWindow): Promise<PlacesLoadResult> {
  const firstResult = await importPlaces(win);
  if (firstResult.status === "available") return firstResult;

  // The async Maps bootstrap can fire its script load event just before the
  // Places library is ready to import. Give that handoff one bounded retry.
  await new Promise((resolve) => setTimeout(resolve, 100));
  return importPlaces(win);
}

function waitForScript(script: HTMLScriptElement): Promise<"loaded" | "error"> {
  return new Promise((resolve) => {
    const onLoad = () => {
      cleanup();
      resolve("loaded");
    };
    const onError = () => {
      cleanup();
      resolve("error");
    };
    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
  });
}

export function createGooglePlacesLoader(defaultEnvironment: LoaderEnvironment = {}) {
  let loadPromise: Promise<PlacesLoadResult> | null = null;

  return function loadGooglePlacesLibrary(overrides: LoaderEnvironment = {}): Promise<PlacesLoadResult> {
    const apiKey = String(overrides.apiKey ?? defaultEnvironment.apiKey ?? configuredBrowserKey()).trim();
    if (!apiKey) return Promise.resolve({ status: "missing_key" });

    const win = overrides.window ?? defaultEnvironment.window ??
      (typeof window === "undefined" ? undefined : (window as BrowserWindow));
    const doc = overrides.document ?? defaultEnvironment.document ??
      (typeof document === "undefined" ? undefined : document);
    if (!win || !doc) return Promise.resolve({ status: "unavailable", reason: "not_in_browser" });

    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      if (win.google?.maps?.importLibrary) return importPlacesWithRetry(win);

      let script = doc.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
      if (!script) {
        script = doc.createElement("script");
        script.id = GOOGLE_MAPS_SCRIPT_ID;
        script.src = scriptUrl(apiKey);
        script.async = true;
        script.defer = true;
        doc.head.appendChild(script);
      }

      const scriptResult = await waitForScript(script);
      if (scriptResult === "error") return { status: "unavailable", reason: "script_error" };
      return importPlacesWithRetry(win);
    })();

    void loadPromise.then((result) => {
      if (result.status !== "available") loadPromise = null;
    });

    return loadPromise;
  };
}

export const loadGooglePlacesLibrary = createGooglePlacesLoader();
