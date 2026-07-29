"use client";

import Script from "next/script";

/** Hotjar site id for Aurove (https://insights.hotjar.com). */
const HOTJAR_ID = 6754703;
const HOTJAR_SV = 6;

export function Hotjar() {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  return (
    <Script id="hotjar" strategy="afterInteractive">
      {`
        (function (h, o, t, j, a, r) {
          h.hj =
            h.hj ||
            function () {
              (h.hj.q = h.hj.q || []).push(arguments);
            };
          h._hjSettings = { hjid: ${HOTJAR_ID}, hjsv: ${HOTJAR_SV} };
          a = o.getElementsByTagName("head")[0];
          r = o.createElement("script");
          r.async = 1;
          r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
          a.appendChild(r);
        })(window, document, "https://static.hotjar.com/c/hotjar-", ".js?sv=");
      `}
    </Script>
  );
}
