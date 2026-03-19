type JobLocationPreviewProps = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  className?: string;
};

type StreetViewMetadataResponse = {
  status?: string;
};

function compact(parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part ?? "").trim()).filter(Boolean);
}

function buildAddressDisplay(props: JobLocationPreviewProps) {
  const locality = compact([
    props.city,
    compact([props.state, props.zip]).join(" "),
  ]).join(", ");

  const parts = compact([
    props.addressLine1,
    props.addressLine2,
    locality,
  ]);

  return parts.join(", ");
}

function buildMapsSearchUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function buildMapsDirectionsUrl(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

async function hasStreetView(address: string, apiKey: string) {
  const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?size=640x360&location=${encodeURIComponent(address)}&source=outdoor&key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(metadataUrl, {
      next: { revalidate: 86400 },
    });

    if (!response.ok) return false;

    const data = (await response.json()) as StreetViewMetadataResponse;
    return data.status === "OK";
  } catch {
    return false;
  }
}

export default async function JobLocationPreview(props: JobLocationPreviewProps) {
  const addressDisplay = buildAddressDisplay(props);

  if (!addressDisplay) {
    return (
      <div className={props.className}>
        <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-4 text-center text-sm font-medium text-slate-600">
          Location preview unavailable
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Add a full service address to enable property preview and map actions.
        </p>
      </div>
    );
  }

  const mapsSearchUrl = buildMapsSearchUrl(addressDisplay);
  const mapsDirectionsUrl = buildMapsDirectionsUrl(addressDisplay);
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY ?? "").trim();

  let imageUrl: string | null = null;
  let imageAlt = `Location preview for ${addressDisplay}`;

  if (apiKey) {
    const streetViewAvailable = await hasStreetView(addressDisplay, apiKey);

    imageUrl = streetViewAvailable
      ? `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${encodeURIComponent(addressDisplay)}&source=outdoor&fov=80&pitch=0&key=${encodeURIComponent(apiKey)}`
      : `https://maps.googleapis.com/maps/api/staticmap?size=640x360&scale=2&maptype=roadmap&markers=color:red%7C${encodeURIComponent(addressDisplay)}&key=${encodeURIComponent(apiKey)}`;

    imageAlt = streetViewAvailable
      ? `Street View preview for ${addressDisplay}`
      : `Static map preview for ${addressDisplay}`;
  }

  return (
    <div className={props.className}>
      <a
        href={mapsSearchUrl}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm transition hover:border-slate-300"
        aria-label={`Open ${addressDisplay} in Google Maps`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt}
            className="aspect-[16/9] w-full object-cover transition duration-200 group-hover:scale-[1.01]"
          />
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center px-4 text-center text-sm font-medium text-slate-600">
            Location preview unavailable
          </div>
        )}
      </a>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <a
          href={mapsDirectionsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Navigate
        </a>
        <a
          href={mapsSearchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
        >
          Open in Maps
        </a>
      </div>
    </div>
  );
}