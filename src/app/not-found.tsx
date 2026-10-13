import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div id="page-content" className="empty-state">
      <span className="eyebrow">A little detour</span>
      <h1>This piece is missing.</h1>
      <p>Let’s get you back to your builds.</p>
      <Link className="button button-primary" href="/">
        Back home <ArrowRight size={17} />
      </Link>
    </div>
  );
}
