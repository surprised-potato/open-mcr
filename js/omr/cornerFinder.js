/**
 * cornerFinder.js - Identifies L-mark and 3 square alignment markers
 */

import {
  Point,
  calcSideLengths,
  allApproxSquare,
  allApproxEqual,
  mean,
  findGreatestValueIndexes,
  isAdjacentIndexes,
  determineWhichIsNext,
  arrangeIndexToFirst,
  polygonToClockwise,
  guessCentroid,
  isWithinTolerance,
  getCornerWrtBasis,
  calc2dDist,
  calcCornerAngles,
  Corner,
  ChangeOfBasisTransformer
} from './geometry.js';
import { extractContours, contoursToPolygons, findPolygons } from './imageUtils.js';

export class LMark {
  constructor(polygon, toleranceMult = 1.0) {
    if (polygon.length !== 6) {
      throw new Error("L-Mark must have 6 points.");
    }
    if (!allApproxSquare(polygon)) {
      throw new Error("L-Mark corners are not square.");
    }

    const clockwisePolygon = polygonToClockwise(polygon);
    const sideLengths = calcSideLengths(clockwisePolygon);
    const longestSidesIndexes = findGreatestValueIndexes(sideLengths, 2);

    if (!isAdjacentIndexes(sideLengths, longestSidesIndexes[0], longestSidesIndexes[1])) {
      throw new Error("L-Mark longest sides are not adjacent.");
    }

    // The 2 longest sides should be ~2x the length of the other 4 sides
    const unitLengths = sideLengths.map((len, idx) => {
      return longestSidesIndexes.includes(idx) ? len / 2 : len;
    });

    if (!allApproxEqual(unitLengths, null, 0.35 * Math.min(1.5, toleranceMult))) {
      throw new Error("L-Mark longest sides not twice the length of short sides.");
    }

    const firstIdx = determineWhichIsNext(clockwisePolygon, longestSidesIndexes[0], longestSidesIndexes[1]);
    this.polygon = arrangeIndexToFirst(clockwisePolygon, firstIdx);
    this.unitLength = mean(unitLengths);
  }
}

export class SquareMark {
  constructor(polygon, targetSize = null, toleranceMult = 1.0) {
    if (polygon.length !== 4) {
      throw new Error("Square must have 4 points.");
    }
    if (!allApproxSquare(polygon)) {
      throw new Error("Corners are not square.");
    }

    const sideLengths = calcSideLengths(polygon);
    if (!allApproxEqual(sideLengths, targetSize, 0.45 * Math.min(1.5, toleranceMult))) {
      throw new Error("Side lengths are not equal or match target size.");
    }

    this.polygon = polygonToClockwise(polygon);
    this.unitLength = mean(sideLengths);
  }
}

export function findCornerMarksFromPolygons(allPolygons, toleranceMult = 1.0) {
  const hexagons = allPolygons.filter(p => p.length === 6);
  const quadrilaterals = allPolygons.filter(p => p.length === 4);

  const nominalToRightSide = 49.5;
  const nominalToBottom = 31.75;
  const candidates = [];

  for (let i = 0; i < hexagons.length; i++) {
    let lMark;
    try {
      lMark = new LMark(hexagons[i], toleranceMult);
    } catch {
      continue;
    }

    // Points 0, 5, 4 of the L-mark define the coordinate basis
    let basisTransformer;
    try {
      basisTransformer = new ChangeOfBasisTransformer(
        lMark.polygon[0],
        lMark.polygon[5],
        lMark.polygon[4]
      );
    } catch {
      continue;
    }

    const trSquares = [];
    const blSquares = [];
    const brSquares = [];

    for (let q = 0; q < quadrilaterals.length; q++) {
      let square;
      try {
        square = new SquareMark(quadrilaterals[q], lMark.unitLength, toleranceMult);
      } catch {
        continue;
      }

      const centroid = guessCentroid(square.polygon);
      const cb = basisTransformer.toBasis(centroid);

      // Top-Right region in basis space
      if (cb.x >= 30 && cb.x <= 65 && cb.y >= -5 && cb.y <= 10) {
        trSquares.push({ square, cb });
      }
      // Bottom-Left region in basis space
      if (cb.x >= -5 && cb.x <= 10 && cb.y >= 18 && cb.y <= 45) {
        blSquares.push({ square, cb });
      }
      // Bottom-Right region in basis space
      if (cb.x >= 30 && cb.x <= 65 && cb.y >= 18 && cb.y <= 45) {
        brSquares.push({ square, cb });
      }
    }

    // 1. Full 3-square combinations evaluated holistically
    if (trSquares.length > 0 && blSquares.length > 0 && brSquares.length > 0) {
      for (const tr of trSquares) {
        for (const bl of blSquares) {
          for (const br of brSquares) {
            const topLeft = lMark.polygon[0];
            const topRight = getCornerWrtBasis(tr.square.polygon, Corner.TR, basisTransformer);
            const bottomRight = getCornerWrtBasis(br.square.polygon, Corner.BR, basisTransformer);
            const bottomLeft = getCornerWrtBasis(bl.square.polygon, Corner.BL, basisTransformer);

            const topLen = calc2dDist(topLeft, topRight);
            const botLen = calc2dDist(bottomLeft, bottomRight);
            const leftLen = calc2dDist(topLeft, bottomLeft);
            const rightLen = calc2dDist(topRight, bottomRight);

            const widthDiff = Math.abs(topLen - botLen) / Math.max(topLen, botLen);
            const heightDiff = Math.abs(leftLen - rightLen) / Math.max(leftLen, rightLen);

            const avgW = (topLen + botLen) / 2;
            const avgH = (leftLen + rightLen) / 2;
            const aspect = avgH / avgW;
            const aspectDiff = Math.abs(aspect - (32 / 50)) / (32 / 50);

            const angles = calcCornerAngles([topLeft, topRight, bottomRight, bottomLeft]);
            const angleError = angles.reduce((sum, a) => sum + Math.abs(a - Math.PI / 2), 0);

            const sizeError = (
              Math.abs(tr.square.unitLength - lMark.unitLength) +
              Math.abs(bl.square.unitLength - lMark.unitLength) +
              Math.abs(br.square.unitLength - lMark.unitLength)
            ) / lMark.unitLength;

            const basisPosError = (
              Math.hypot(tr.cb.x - nominalToRightSide, tr.cb.y - 0.5) +
              Math.hypot(bl.cb.x - 0.5, bl.cb.y - nominalToBottom) +
              Math.hypot(br.cb.x - nominalToRightSide, br.cb.y - nominalToBottom)
            );

            const totalScore = (
              sizeError * 25.0 +
              widthDiff * 30.0 +
              heightDiff * 30.0 +
              aspectDiff * 20.0 +
              angleError * 15.0 +
              basisPosError * 0.5
            );

            candidates.push({
              score: totalScore,
              isFull: true,
              corners: [topLeft, topRight, bottomRight, bottomLeft],
              lMark: lMark.polygon,
              squares: [tr.square.polygon, br.square.polygon, bl.square.polygon]
            });
          }
        }
      }
    }
    // 2. Partial match fallback (2 of 3 squares) with global vector parallelogram completion
    else if (trSquares.length > 0 && blSquares.length > 0) {
      for (const tr of trSquares) {
        for (const bl of blSquares) {
          const topLeft = lMark.polygon[0];
          const topRight = getCornerWrtBasis(tr.square.polygon, Corner.TR, basisTransformer);
          const bottomLeft = getCornerWrtBasis(bl.square.polygon, Corner.BL, basisTransformer);
          // Global vector parallelogram: BR = TR + BL - TL
          const bottomRight = new Point(
            topRight.x + bottomLeft.x - topLeft.x,
            topRight.y + bottomLeft.y - topLeft.y
          );

          const sizeError = (
            Math.abs(tr.square.unitLength - lMark.unitLength) +
            Math.abs(bl.square.unitLength - lMark.unitLength)
          ) / lMark.unitLength;

          const basisPosError = (
            Math.hypot(tr.cb.x - nominalToRightSide, tr.cb.y - 0.5) +
            Math.hypot(bl.cb.x - 0.5, bl.cb.y - nominalToBottom)
          );

          candidates.push({
            score: 100 + sizeError * 25.0 + basisPosError * 0.5,
            isFull: false,
            corners: [topLeft, topRight, bottomRight, bottomLeft],
            lMark: lMark.polygon,
            squares: [tr.square.polygon, bl.square.polygon]
          });
        }
      }
    } else if (trSquares.length > 0 && brSquares.length > 0) {
      for (const tr of trSquares) {
        for (const br of brSquares) {
          const topLeft = lMark.polygon[0];
          const topRight = getCornerWrtBasis(tr.square.polygon, Corner.TR, basisTransformer);
          const bottomRight = getCornerWrtBasis(br.square.polygon, Corner.BR, basisTransformer);
          // Global vector parallelogram: BL = TL + BR - TR
          const bottomLeft = new Point(
            topLeft.x + bottomRight.x - topRight.x,
            topLeft.y + bottomRight.y - topRight.y
          );

          const sizeError = (
            Math.abs(tr.square.unitLength - lMark.unitLength) +
            Math.abs(br.square.unitLength - lMark.unitLength)
          ) / lMark.unitLength;

          const basisPosError = (
            Math.hypot(tr.cb.x - nominalToRightSide, tr.cb.y - 0.5) +
            Math.hypot(br.cb.x - nominalToRightSide, br.cb.y - nominalToBottom)
          );

          candidates.push({
            score: 100 + sizeError * 25.0 + basisPosError * 0.5,
            isFull: false,
            corners: [topLeft, topRight, bottomRight, bottomLeft],
            lMark: lMark.polygon,
            squares: [tr.square.polygon, br.square.polygon]
          });
        }
      }
    } else if (blSquares.length > 0 && brSquares.length > 0) {
      for (const bl of blSquares) {
        for (const br of brSquares) {
          const topLeft = lMark.polygon[0];
          const bottomLeft = getCornerWrtBasis(bl.square.polygon, Corner.BL, basisTransformer);
          const bottomRight = getCornerWrtBasis(br.square.polygon, Corner.BR, basisTransformer);
          // Global vector parallelogram: TR = TL + BR - BL
          const topRight = new Point(
            topLeft.x + bottomRight.x - bottomLeft.x,
            topLeft.y + bottomRight.y - bottomLeft.y
          );

          const sizeError = (
            Math.abs(bl.square.unitLength - lMark.unitLength) +
            Math.abs(br.square.unitLength - lMark.unitLength)
          ) / lMark.unitLength;

          const basisPosError = (
            Math.hypot(bl.cb.x - 0.5, bl.cb.y - nominalToBottom) +
            Math.hypot(br.cb.x - nominalToRightSide, br.cb.y - nominalToBottom)
          );

          candidates.push({
            score: 100 + sizeError * 25.0 + basisPosError * 0.5,
            isFull: false,
            corners: [topLeft, topRight, bottomRight, bottomLeft],
            lMark: lMark.polygon,
            squares: [br.square.polygon, bl.square.polygon]
          });
        }
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    return {
      corners: best.corners,
      lMark: best.lMark,
      squares: best.squares
    };
  }

  throw new Error("Could not detect alignment fiducial corner marks. Please check scan quality and orientation.");
}

export function findCornerMarksCore(cv, imageMat, epsilon = 0.02, toleranceMult = 1.0) {
  const allPolygons = findPolygons(cv, imageMat, epsilon);
  return findCornerMarksFromPolygons(allPolygons, toleranceMult);
}

export function findCornerMarks(cv, imageMat) {
  const rotations = [null, cv.ROTATE_90_CLOCKWISE, cv.ROTATE_180, cv.ROTATE_90_COUNTERCLOCKWISE];
  const epsilons = [0.02, 0.03, 0.05];
  const toleranceMultipliers = [1.0, 1.5, 2.0];

  for (const rotation of rotations) {
    let mat = imageMat;
    if (rotation !== null) {
      mat = new cv.Mat();
      cv.rotate(imageMat, mat, rotation);
    }

    const contours = extractContours(cv, mat);

    for (const eps of epsilons) {
      const allPolygons = contoursToPolygons(cv, contours, eps);
      for (const mult of toleranceMultipliers) {
        try {
          const result = findCornerMarksFromPolygons(allPolygons, mult);
          contours.delete();
          if (rotation !== null) {
            mat.delete();
          }
          return { ...result, rotation };
        } catch {
          continue;
        }
      }
    }

    contours.delete();
    if (rotation !== null) {
      mat.delete();
    }
  }

  throw new Error("Could not detect alignment fiducial corner marks. Please check scan quality and orientation.");
}

