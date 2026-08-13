/** Shared travel semantics and platform presentation helpers. */
export function flipDirection(direction) {
  return direction === "forward" ? "reverse" : "forward";
}

/** Side platforms reverse the readable left-to-right presentation, never the journey. */
export function visualDirectionFor(direction, platformType = "island") {
  return platformType === "side" ? flipDirection(direction) : direction;
}

export function displayStationsForPlatform(stations, platformType = "island") {
  const ordered = platformType === "side"
    ? stations.map((station, logicalIndex) => ({ station, logicalIndex })).reverse()
    : stations.map((station, logicalIndex) => ({ station, logicalIndex }));
  return ordered.map((item, displayIndex) => ({ ...item, displayIndex }));
}

export function terminusForDirection(stations, direction) {
  return direction === "forward" ? stations.at(-1) : stations[0];
}

export function terminusSideFor(direction, platformType = "island") {
  const semanticSide = direction === "forward" ? "right" : "left";
  return platformType === "side" ? (semanticSide === "right" ? "left" : "right") : semanticSide;
}

export function stepForDirection(direction) {
  return direction === "forward" ? 1 : -1;
}

export function nextIndexForDirection(currentIndex, count, direction, loop = false) {
  if (!count) return undefined;
  const target = currentIndex + stepForDirection(direction);
  if (loop) return (target + count) % count;
  return target >= 0 && target < count ? target : undefined;
}

export function previousIndexForDirection(currentIndex, count, direction, loop = false) {
  return nextIndexForDirection(currentIndex, count, flipDirection(direction), loop);
}
