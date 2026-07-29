import Link from "next/link";

export function DocsContentFooter() {
  return (
    <footer className="mt-12 border-t border-white/8 pb-2 pt-6 text-xs text-white/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} Aurove. Protocol documentation for Mezo testnet deployments.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/docs" className="hover:text-white/70">
            Docs home
          </Link>
          <Link href="/earn" className="hover:text-white/70">
            App
          </Link>
          <a
            href="https://x.com/aurove_xyz"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white/70"
          >
            X
          </a>
        </div>
      </div>
    </footer>
  );
}
