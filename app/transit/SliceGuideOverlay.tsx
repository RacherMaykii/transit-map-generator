export default function SliceGuideOverlay({
  count,
  tileSize,
  zoom,
}: {
  count: number;
  tileSize: number;
  zoom: number;
}) {
  return (
    <div
      className="slice-guide-overlay"
      style={{ gridTemplateColumns: `repeat(${count}, ${tileSize * zoom}px)` }}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <span key={index}><i>{String(index + 1).padStart(2, "0")}</i></span>
      ))}
    </div>
  );
}
