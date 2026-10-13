export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`}>
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        fill="none"
        aria-hidden="true"
      >
        <path d="M5 7h12a7 7 0 0 1 0 14H5V7Z" fill="currentColor" />
        <path d="M5 15h15a7 7 0 0 1 0 14H5V15Z" fill="currentColor" />
        <path d="M12 12h5v4h-5zM12 21h8v4h-8z" fill="var(--background)" />
      </svg>
      {!small && (
        <span>
          BrickMade<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
