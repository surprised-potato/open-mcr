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

  const nominalToRightSide = 50 - 0.5; // 49.5
  const nominalToBottom = (64 - 0.5) / 2; // 31.75
  const xTolerance = 0.25 * toleranceMult * nominalToRightSide;
  const yTolerance = 0.25 * toleranceMult * nominalToBottom;

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

    const topRightSquares = [];
    const bottomLeftSquares = [];
    const bottomRightSquares = [];

    for (let q = 0; q < quadrilaterals.length; q++) {
      let square;
      try {
        square = new SquareMark(quadrilaterals[q], lMark.unitLength, toleranceMult);
      } catch {
        continue;
      }

      const centroid = guessCentroid(square.polygon);
      const centroidBasis = basisTransformer.toBasis(centroid);

      if (
        isWithinTolerance(centroidBasis.x, nominalToRightSide, xTolerance) &&
        isWithinTolerance(centroidBasis.y, 0.5, yTolerance)
      ) {
        topRightSquares.push(square);
      } else if (
        isWithinTolerance(centroidBasis.x, 0.5, xTolerance) &&
        isWithinTolerance(centroidBasis.y, nominalToBottom, yTolerance)
      ) {
        bottomLeftSquares.push(square);
      } else if (
        isWithinTolerance(centroidBasis.x, nominalToRightSide, xTolerance) &&
        isWithinTolerance(centroidBasis.y, nominalToBottom, yTolerance)
      ) {
        bottomRightSquares.push(square);
      }
    }

    // Sort matching squares by distance to nominal in basis space
    if (topRightSquares.length > 0) {
      topRightSquares.sort((a, b) => {
        const cA = basisTransformer.toBasis(guessCentroid(a.polygon));
        const cB = basisTransformer.toBasis(guessCentroid(b.polygon));
        return Math.hypot(cA.x - nominalToRightSide, cA.y - 0.5) - Math.hypot(cB.x - nominalToRightSide, cB.y - 0.5);
      });
    }

    if (bottomLeftSquares.length > 0) {
      bottomLeftSquares.sort((a, b) => {
        const cA = basisTransformer.toBasis(guessCentroid(a.polygon));
        const cB = basisTransformer.toBasis(guessCentroid(b.polygon));
        return Math.hypot(cA.x - 0.5, cA.y - nominalToBottom) - Math.hypot(cB.x - 0.5, cB.y - nominalToBottom);
      });
    }

    if (bottomRightSquares.length > 0) {
      bottomRightSquares.sort((a, b) => {
        const cA = basisTransformer.toBasis(guessCentroid(a.polygon));
        const cB = basisTransformer.toBasis(guessCentroid(b.polygon));
        return Math.hypot(cA.x - nominalToRightSide, cA.y - nominalToBottom) - Math.hypot(cB.x - nominalToRightSide, cB.y - nominalToBottom);
      });
    }

    // 1. Full 3-square match
    if (topRightSquares.length > 0 && bottomLeftSquares.length > 0 && bottomRightSquares.length > 0) {
      const cTR = basisTransformer.toBasis(guessCentroid(topRightSquares[0].polygon));
      const cBL = basisTransformer.toBasis(guessCentroid(bottomLeftSquares[0].polygon));
      const cBR = basisTransformer.toBasis(guessCentroid(bottomRightSquares[0].polygon));

      const trDist = Math.hypot(cTR.x - nominalToRightSide, cTR.y - 0.5);
      const blDist = Math.hypot(cBL.x - 0.5, cBL.y - nominalToBottom);
      const brDist = Math.hypot(cBR.x - nominalToRightSide, cBR.y - nominalToBottom);
      const score = trDist + blDist + brDist;

      const topLeftCorner = lMark.polygon[0];
      const topRightCorner = getCornerWrtBasis(topRightSquares[0].polygon, Corner.TR, basisTransformer);
      const bottomRightCorner = getCornerWrtBasis(bottomRightSquares[0].polygon, Corner.BR, basisTransformer);
      const bottomLeftCorner = getCornerWrtBasis(bottomLeftSquares[0].polygon, Corner.BL, basisTransformer);

      candidates.push({
        score,
        isFull: true,
        corners: [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner],
        lMark: lMark.polygon,
        squares: [topRightSquares[0].polygon, bottomRightSquares[0].polygon, bottomLeftSquares[0].polygon]
      });
    }
    // 2. Partial match fallback (2 of 3 squares)
    else if (topRightSquares.length > 0 && bottomLeftSquares.length > 0) {
      const cTR = basisTransformer.toBasis(guessCentroid(topRightSquares[0].polygon));
      const cBL = basisTransformer.toBasis(guessCentroid(bottomLeftSquares[0].polygon));
      const trDist = Math.hypot(cTR.x - nominalToRightSide, cTR.y - 0.5);
      const blDist = Math.hypot(cBL.x - 0.5, cBL.y - nominalToBottom);

      const topLeftCorner = lMark.polygon[0];
      const topRightCorner = getCornerWrtBasis(topRightSquares[0].polygon, Corner.TR, basisTransformer);
      const bottomLeftCorner = getCornerWrtBasis(bottomLeftSquares[0].polygon, Corner.BL, basisTransformer);
      const trBasis = basisTransformer.toBasis(topRightCorner);
      const blBasis = basisTransformer.toBasis(bottomLeftCorner);
      const bottomRightCorner = basisTransformer.fromBasis(new Point(trBasis.x, blBasis.y));

      candidates.push({
        score: 100 + trDist + blDist,
        isFull: false,
        corners: [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner],
        lMark: lMark.polygon,
        squares: [topRightSquares[0].polygon, bottomLeftSquares[0].polygon]
      });
    } else if (topRightSquares.length > 0 && bottomRightSquares.length > 0) {
      const cTR = basisTransformer.toBasis(guessCentroid(topRightSquares[0].polygon));
      const cBR = basisTransformer.toBasis(guessCentroid(bottomRightSquares[0].polygon));
      const trDist = Math.hypot(cTR.x - nominalToRightSide, cTR.y - 0.5);
      const brDist = Math.hypot(cBR.x - nominalToRightSide, cBR.y - nominalToBottom);

      const topLeftCorner = lMark.polygon[0];
      const topRightCorner = getCornerWrtBasis(topRightSquares[0].polygon, Corner.TR, basisTransformer);
      const bottomRightCorner = getCornerWrtBasis(bottomRightSquares[0].polygon, Corner.BR, basisTransformer);
      const brBasis = basisTransformer.toBasis(bottomRightCorner);
      const bottomLeftCorner = basisTransformer.fromBasis(new Point(0, brBasis.y));

      candidates.push({
        score: 100 + trDist + brDist,
        isFull: false,
        corners: [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner],
        lMark: lMark.polygon,
        squares: [topRightSquares[0].polygon, bottomRightSquares[0].polygon]
      });
    } else if (bottomLeftSquares.length > 0 && bottomRightSquares.length > 0) {
      const cBL = basisTransformer.toBasis(guessCentroid(bottomLeftSquares[0].polygon));
      const cBR = basisTransformer.toBasis(guessCentroid(bottomRightSquares[0].polygon));
      const blDist = Math.hypot(cBL.x - 0.5, cBL.y - nominalToBottom);
      const brDist = Math.hypot(cBR.x - nominalToRightSide, cBR.y - nominalToBottom);

      const topLeftCorner = lMark.polygon[0];
      const bottomLeftCorner = getCornerWrtBasis(bottomLeftSquares[0].polygon, Corner.BL, basisTransformer);
      const bottomRightCorner = getCornerWrtBasis(bottomRightSquares[0].polygon, Corner.BR, basisTransformer);
      const brBasis = basisTransformer.toBasis(bottomRightCorner);
      const topRightCorner = basisTransformer.fromBasis(new Point(brBasis.x, 0));

      candidates.push({
        score: 100 + blDist + brDist,
        isFull: false,
        corners: [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner],
        lMark: lMark.polygon,
        squares: [bottomRightSquares[0].polygon, bottomLeftSquares[0].polygon]
      });
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

