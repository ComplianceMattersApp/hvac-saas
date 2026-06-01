const DEFAULT_SERVICE_WORKER_SCRIPT_URL = "/sw.js";
const DEFAULT_SERVICE_WORKER_SCOPE = "/";

function supportsServiceWorker(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

export async function getOrRegisterServiceWorkerRegistration(
  scriptURL = DEFAULT_SERVICE_WORKER_SCRIPT_URL,
  scope = DEFAULT_SERVICE_WORKER_SCOPE,
): Promise<ServiceWorkerRegistration | null> {
  if (!supportsServiceWorker()) return null;

  return (
    (await navigator.serviceWorker.getRegistration(scope)) ??
    (await navigator.serviceWorker.register(scriptURL, { scope }))
  );
}
