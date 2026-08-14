/**
 * gridReader.js - Reads bubble marks from 36x48 transformed grid
 */

import { Point, findGreatestValueIndexes } from './geometry.js';
import {
  GRID_HORIZONTAL_CELLS,
  GRID_VERTICAL_CELLS,
  LETTERS,
  Field,
  FieldType,
  Orientation
} from './gridInfo.js';

const GRID_CELL_CROP_FRACTION = 0.25;

export class Grid {
  constructor(corners, imageMat, cv) {
    this.corners = corners; // [TL, TR, BR, BL]
    this.horizontalCells = GRID_HORIZONTAL_CELLS;
    this.verticalCells = GRID_VERTICAL_CELLS;
    this.imageMat = imageMat;
    this.cv = cv;

    // Perspective: normalized [0,1] space -> image pixel space
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,  1, 0,  1, 1,  0, 1  // unit square TL, TR, BR, BL
    ]);
    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      corners[0].x, corners[0].y,  // TL
      corners[1].x, corners[1].y,  // TR
      corners[2].x, corners[2].y,  // BR
      corners[3].x, corners[3].y   // BL
    ]);

    this._perspMat = cv.getPerspectiveTransform(srcPts, dstPts);
    srcPts.delete();
    dstPts.delete();

    this.horizontalCellSize = 1 / this.horizontalCells;
    this.verticalCellSize = 1 / this.verticalCells;
  }

  _gridToImage(normX, normY) {
    const d = this._perspMat.data64F;
    const w = d[6] * normX + d[7] * normY + d[8];
    return new Point(
      (d[0] * normX + d[1] * normY + d[2]) / w,
      (d[3] * normX + d[4] * normY + d[5]) / w
    );
  }

  getCellShape(across, down) {
    const x0 = across * this.horizontalCellSize;
    const y0 = down * this.verticalCellSize;
    const x1 = (across + 1) * this.horizontalCellSize;
    const y1 = (down + 1) * this.verticalCellSize;
    return [
      this._gridToImage(x0, y0),
      this._gridToImage(x1, y0),
      this._gridToImage(x1, y1),
      this._gridToImage(x0, y1)
    ];
  }

  dispose() {
    if (this._perspMat) {
      this._perspMat.delete();
      this._perspMat = null;
    }
  }

  getCellRange(across, down) {
    const cell = this.getCellShape(across, down);
    const xs = cell.map(p => p.x);
    const ys = cell.map(p => p.y);
    return {
      minX: Math.max(0, Math.min(...xs)),
      maxX: Math.min(this.imageMat.cols - 1, Math.max(...xs)),
      minY: Math.max(0, Math.min(...ys)),
      maxY: Math.min(this.imageMat.rows - 1, Math.max(...ys))
    };
  }

  getCellCircle(across, down) {
    const { minX, maxX, minY, maxY } = this.getCellRange(across, down);
    const avgDim = ((maxX - minX) + (maxY - minY)) / 2;
    const diameter = avgDim * (1 - GRID_CELL_CROP_FRACTION);
    const center = new Point(minX + (maxX - minX) / 2, minY + (maxY - minY) / 2);
    return { center, radius: diameter / 2 };
  }

  getFillPercent(across, down) {
    const { center, radius } = this.getCellCircle(across, down);
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(center.x - radius));
    const maxX = Math.min(this.imageMat.cols - 1, Math.ceil(center.x + radius));
    const minY = Math.max(0, Math.floor(center.y - radius));
    const maxY = Math.min(this.imageMat.rows - 1, Math.ceil(center.y + radius));

    let pixelSum = 0;
    let pixelCount = 0;

    const data = this.imageMat.data;
    const cols = this.imageMat.cols;
    const isGrayscale = this.imageMat.channels() === 1;
    const channels = this.imageMat.channels();

    for (let y = minY; y <= maxY; y++) {
      const dy = y - center.y;
      const dy2 = dy * dy;
      const rowOffset = y * cols * channels;

      for (let x = minX; x <= maxX; x++) {
        const dx = x - center.x;
        if (dx * dx + dy2 <= r2) {
          let val;
          if (isGrayscale) {
            val = data[rowOffset + x];
          } else {
            // RGBA / RGB -> luminance
            const offset = rowOffset + x * channels;
            val = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
          }
          pixelSum += val;
          pixelCount++;
        }
      }
    }

    if (pixelCount === 0) return 0;
    const meanBrightness = pixelSum / pixelCount;
    return 1 - (meanBrightness / 255);
  }
}

/**
 * Calculates adaptive dynamic fill threshold across all bubbles using 1D Otsu variance maximization
 * with a lower bound above the empty-cell background cluster to prevent class imbalance collapse.
 */
export function calculateBubbleFillThreshold(allFillPercents) {
  const flat = allFillPercents.flat(Infinity).filter(v => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
  if (flat.length === 0) return 0.35;

  // Discard top 0.5% extreme outliers (e.g. solid border artifacts, printed box lines)
  const validCount = Math.floor(flat.length * 0.995);
  const data = flat.slice(0, validCount);

  const min = data[0];
  const max = data[data.length - 1];
  if (max - min < 0.08) return min + 0.15;

  // Estimate empty background cluster baseline (50th percentile median and 80th percentile)
  const p50 = data[Math.floor(data.length * 0.50)]; // median empty
  const p80 = data[Math.floor(data.length * 0.80)];
  // Enforce that the threshold candidate must be strictly above the empty cluster
  const minThresholdBound = Math.max(p50 + 0.045, p80 + 0.01);

  const numBins = 100;
  const hist = new Array(numBins).fill(0);
  for (const v of data) {
    const b = Math.min(numBins - 1, Math.floor(((v - min) / (max - min)) * numBins));
    hist[b]++;
  }

  const total = data.length;
  let sum = 0;
  for (let i = 0; i < numBins; i++) sum += i * hist[i];

  const minBin = Math.max(0, Math.floor(((minThresholdBound - min) / (max - min)) * numBins));

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let bestBin = minBin;

  for (let t = 0; t < numBins; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    if (t < minBin) continue; // enforce lower bound above empty cluster

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const betweenVariance = wB * wF * (mB - mF) * (mB - mF);
    if (betweenVariance > maxVariance) {
      maxVariance = betweenVariance;
      bestBin = t;
    }
  }

  const otsuVal = min + ((bestBin + 0.5) / numBins) * (max - min);
  return Math.max(minThresholdBound, Math.min(0.70, otsuVal));
}

export function readFieldGroup(grid, groupInfo) {
  const isVertical = groupInfo.fieldOrientation === Orientation.VERTICAL;
  const numSubFields = groupInfo.numFields;
  const fieldLen = groupInfo.fieldLength;

  const fills = [];
  const bubbleCoordinates = [];

  for (let f = 0; f < numSubFields; f++) {
    const subFills = [];
    const subCoords = [];
    for (let c = 0; c < fieldLen; c++) {
      const across = isVertical ? groupInfo.horizontalStart + f : groupInfo.horizontalStart + c;
      const down = isVertical ? groupInfo.verticalStart + c : groupInfo.verticalStart + f;
      const fill = grid.getFillPercent(across, down);
      const { center, radius } = grid.getCellCircle(across, down);
      subFills.push(fill);
      subCoords.push({ across, down, center, radius, fill });
    }
    fills.push(subFills);
    bubbleCoordinates.push(subCoords);
  }

  return { fills, bubbleCoordinates };
}

export function decodeFieldValue(fills, threshold, fieldsType, multiAsF = false) {
  const chars = [];

  for (let f = 0; f < fills.length; f++) {
    const subFills = fills[f];
    if (!subFills || subFills.length === 0) {
      chars.push(' ');
      continue;
    }

    // Compute column baseline (median fill of this subfield column)
    const sortedFills = subFills.slice().sort((a, b) => a - b);
    const colMedian = sortedFills[Math.floor(sortedFills.length * 0.5)];

    const indexed = subFills.map((val, idx) => ({ val, idx })).sort((a, b) => b.val - a.val);
    const top1 = indexed[0];
    const top2 = indexed.length > 1 ? indexed[1] : null;

    // Minimum darkness required for a filled bubble in this column
    const minFillDarkness = Math.max(threshold * 0.90, colMedian + 0.055);

    const filledIndexes = [];
    if (top1 && top1.val >= minFillDarkness) {
      if (!top2 || top1.val >= top2.val + 0.035 || top1.val >= colMedian + 0.085) {
        filledIndexes.push(top1.idx);
      } else if (top2 && top2.val >= minFillDarkness) {
        // Genuinely multiple marked
        filledIndexes.push(top1.idx, top2.idx);
      }
    }

    if (filledIndexes.length === 0) {
      chars.push(' ');
    } else if (filledIndexes.length === 1) {
      const idx = filledIndexes[0];
      chars.push(fieldsType === FieldType.LETTER ? LETTERS[idx] : String(idx));
    } else {
      if (multiAsF) {
        chars.push('F');
      } else {
        const lettersOrDigits = filledIndexes.map(idx =>
          fieldsType === FieldType.LETTER ? LETTERS[idx] : String(idx)
        );
        chars.push(`[${lettersOrDigits.join('|')}]`);
      }
    }
  }

  return chars.join('').trim();
}

export function decodeQuestionAnswer(fills, threshold, multiAsF = false, emptyAsG = false) {
  const filledIndexes = [];
  for (let i = 0; i < fills.length; i++) {
    if (fills[i] > threshold) {
      filledIndexes.push(i);
    }
  }

  // If no bubble passed the global threshold, check if one choice clearly stands out above the others in this row (local contrast)
  if (filledIndexes.length === 0 && fills.length >= 2) {
    const sorted = fills.map((val, idx) => ({ val, idx })).sort((a, b) => b.val - a.val);
    const top1 = sorted[0];
    const top2 = sorted[1];
    const rowMean = fills.reduce((a, b) => a + b, 0) / fills.length;

    // A bubble is clearly filled if it is significantly above the rest of its row
    if (top1.val >= 0.22 && (top1.val >= top2.val + 0.04 || top1.val >= top2.val * 1.22) && top1.val >= rowMean + 0.035) {
      filledIndexes.push(top1.idx);
    }
  }

  if (filledIndexes.length === 0) {
    return emptyAsG ? 'G' : '';
  } else if (filledIndexes.length === 1) {
    return LETTERS[filledIndexes[0]];
  } else {
    if (multiAsF) {
      return 'F';
    } else {
      const letters = filledIndexes.map(idx => LETTERS[idx]);
      return `[${letters.join('|')}]`;
    }
  }
}
