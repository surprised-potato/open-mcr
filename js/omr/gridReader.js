/**
 * gridReader.js - Reads bubble marks from 36x48 transformed grid
 */

import { Point, ChangeOfBasisTransformer, findGreatestValueIndexes } from './geometry.js';
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

    // Basis transformer: Origin = TL (0), BL = BL (3), BR = BR (2)
    this.basisTransformer = new ChangeOfBasisTransformer(
      corners[0],
      corners[3],
      corners[2]
    );

    this.horizontalCellSize = 1 / this.horizontalCells;
    this.verticalCellSize = 1 / this.verticalCells;
  }

  getCellShapeInBasis(across, down) {
    return [
      new Point(across * this.horizontalCellSize, down * this.verticalCellSize),
      new Point((across + 1) * this.horizontalCellSize, down * this.verticalCellSize),
      new Point((across + 1) * this.horizontalCellSize, (down + 1) * this.verticalCellSize),
      new Point(across * this.horizontalCellSize, (down + 1) * this.verticalCellSize)
    ];
  }

  getCellShape(across, down) {
    return this.basisTransformer.polyFromBasis(this.getCellShapeInBasis(across, down));
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
 * Calculates adaptive dynamic fill threshold across all bubbles
 */
export function calculateBubbleFillThreshold(allFillPercents) {
  const flattened = allFillPercents.flat(Infinity).sort((a, b) => a - b);
  if (flattened.length === 0) return 0.35;

  const topChunkSize = Math.max(2, Math.round(flattened.length / 5));
  const topChunk = flattened.slice(-topChunkSize);

  const diffs = [];
  for (let i = 0; i < topChunk.length - 1; i++) {
    diffs.push(topChunk[i + 1] - topChunk[i]);
  }

  if (diffs.length === 0) return 0.35;
  const bestGapIdx = findGreatestValueIndexes(diffs, 1)[0];
  const threshold = (topChunk[bestGapIdx] + topChunk[bestGapIdx + 1]) / 2;
  return Math.max(0.15, Math.min(0.85, threshold));
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
    const filledIndexes = [];
    for (let i = 0; i < subFills.length; i++) {
      if (subFills[i] > threshold) {
        filledIndexes.push(i);
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
