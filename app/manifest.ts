import type { MetadataRoute } from "next";
import { resolveAppTheme, themeColorFor } from "@/lib/config/theme";
import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/seo/site";

export default function manifest(): MetadataRoute.Manifest {
  const theme = resolveAppTheme();
  const chrome = themeColorFor(theme);
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: theme === "dark" ? "#070b10" : "#f4efe6",
    theme_color: chrome,
    orientation: "portrait-primary",
    categories: ["finance", "business"],
    icons: [
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
