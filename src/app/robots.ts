import type { MetadataRoute } from "next";

// The site is unlisted: anyone with the link can use it, but search engines are asked not to list it.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
