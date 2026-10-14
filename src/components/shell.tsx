"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Plus,
  Blocks,
  Layers,
  UserRound,
  ArrowUpRight,
} from "lucide-react";
import { BrandMark } from "./brand-mark";

const links = [
  { href: "/", label: "Home", icon: House },
  { href: "/create", label: "Create", icon: Plus },
  { href: "/builder", label: "Builder", icon: Blocks },
  { href: "/parts", label: "Parts", icon: Layers },
  { href: "/account", label: "Account", icon: UserRound },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()?.replace(/\/$/, "") || "/";
  const isActive = (href: string) =>
    pathname === href ||
    (href === "/parts" && ["/catalog", "/connections"].includes(pathname));
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" aria-label="BrickMade home">
            <BrandMark />
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            {links.slice(0, 4).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="header-right">
            <span className="private-badge">
              <span />
              Prototype preview
            </span>
            <Link
              href="/account"
              className="profile-button"
              aria-label="Account"
            >
              <UserRound size={18} />
            </Link>
          </div>
        </div>
      </header>
      <main className="main-content">{children}</main>
      <footer className="site-footer">
        <BrandMark small />
        <span>Your world. Made personal.</span>
        <span className="footer-right">
          <Link href="/catalog">
            Geometry: LDraw contributors · CC BY <ArrowUpRight size={13} />
          </Link>
        </span>
      </footer>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(link.href) ? "page" : undefined}
          >
            <link.icon
              size={21}
              strokeWidth={isActive(link.href) ? 2.2 : 1.7}
            />
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
