import Image from "next/image";
import Link from "next/link";

import borekLogo from "../../../../static images/logo.svg";

interface BrandLogoProps {
  href?: string;
  /** Show the product name beside the corporate logo (header only). */
  showProductName?: boolean;
  className?: string;
}

export function BrandLogo({
  href = "/clients",
  showProductName = false,
  className = "",
}: BrandLogoProps) {
  const logo = (
    <>
      <Image
        src={borekLogo}
        alt="Borek Solutions Group"
        width={220}
        height={48}
        className="brand-logo-image"
        priority
      />
      {showProductName ? (
        <span className="brand-logo-product">Pitch Factory</span>
      ) : null}
    </>
  );

  const classes = ["brand-logo", className].filter(Boolean).join(" ");

  return (
    <Link href={href} className={classes}>
      {logo}
    </Link>
  );
}
