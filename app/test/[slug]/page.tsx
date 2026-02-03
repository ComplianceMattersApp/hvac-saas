export default async function TestSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;

  return (
    <div style={{ padding: 24 }}>
      <h1>Dynamic route test</h1>
      <pre>{JSON.stringify(resolved, null, 2)}</pre>
    </div>
  );
}
