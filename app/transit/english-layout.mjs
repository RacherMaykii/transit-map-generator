/**
 * Choose a two-line layout using whitespace boundaries only. A word is never
 * split, and no hyphen or other continuation marker is inserted.
 *
 * @param {string} text
 * @param {number} size
 * @param {(text: string, size: number) => number} measureWidth
 * @returns {string[]}
 */
function splitAtWordBoundary(text, size, measureWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text];

  let bestLines = [text];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const leftWidth = measureWidth(left, size);
    const rightWidth = measureWidth(right, size);
    const score = Math.max(leftWidth, rightWidth) + Math.abs(leftWidth - rightWidth) * 0.02;
    if (score < bestScore) {
      bestScore = score;
      bestLines = [left, right];
    }
  }
  return bestLines;
}

/**
 * Fit English station text into at most two lines. Wrapping happens only
 * between complete words. If the configured minimum is still too large, this
 * one label is reduced further so it cannot overflow.
 *
 * @param {string} name
 * @param {number} initialSize
 * @param {number} configuredMinSize
 * @param {number} maxWidth
 * @param {(text: string, size: number) => number} measureWidth
 * @returns {{ lines: string[], size: number }}
 */
export function fitEnglishTextLayout(name, initialSize, configuredMinSize, maxWidth, measureWidth) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return { lines: [""], size: initialSize };

  const minSize = Math.min(initialSize, configuredMinSize);
  for (let size = initialSize; size >= minSize - 0.001; size -= 0.25) {
    if (measureWidth(clean, size) <= maxWidth) return { lines: [clean], size };
    const lines = splitAtWordBoundary(clean, size, measureWidth);
    if (lines.length === 2 && lines.every((line) => measureWidth(line, size) <= maxWidth)) {
      return { lines, size };
    }
  }

  const lines = splitAtWordBoundary(clean, minSize, measureWidth);
  const widestLine = Math.max(...lines.map((line) => measureWidth(line, minSize)), 1);
  const exactFitSize = minSize * Math.min(1, maxWidth / widestLine);
  const size = Math.max(1, Math.floor(exactFitSize * 4) / 4);
  return { lines, size };
}
