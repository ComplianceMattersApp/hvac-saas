export function normalizeOpsWorkspaceHref(href: string) {
  const [base, fragment] = href.split("#", 2);
  return fragment === "ops-workspace" ? `${base}#ops-workspace` : href;
}
