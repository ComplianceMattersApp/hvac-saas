import { redirect } from "next/navigation";
import { SignupContent, type SignupProductIntent } from "@/app/signup/signup-content";

const PRODUCT_INTENTS: Record<string, SignupProductIntent> = {
  service: "service",
  ecc: "ecc",
};

export default async function ProductSignupPage({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const { product } = await params;
  const productIntent = PRODUCT_INTENTS[product.toLowerCase()];

  if (!productIntent) {
    redirect("/signup");
  }

  return <SignupContent productIntent={productIntent} />;
}
