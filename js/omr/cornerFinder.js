/**
 * cornerFinder.js - Identifies L-mark and 3 square alignment markers
 */

import {
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
import { findPolygons } from './imageUtils.js';

export class LMark {
  constructor(polygon) {
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

    if (!allApproxEqual(unitLengths, null, 0.35)) {
      throw new Error("L-Mark longest sides not twice the length of short sides.");
    }

    const firstIdx = determineWhichIsNext(clockwisePolygon, longestSidesIndexes[0], longestSidesIndexes[1]);
    this.polygon = arrangeIndexToFirst(clockwisePolygon, firstIdx);
    this.unitLength = mean(unitLengths);
  }
}

export class SquareMark {
  constructor(polygon, targetSize = null) {
    if (polygon.length !== 4) {
      throw new Error("Square must have 4 points.");
    }
    if (!allApproxSquare(polygon)) {
      throw new Error("Corners are not square.");
    }

    const sideLengths = calcSideLengths(polygon);
    if (!allApproxEqual(sideLengths, targetSize, 0.45)) {
      throw new Error("Side lengths are not equal or match target size.");
    }

    this.polygon = polygonToClockwise(polygon);
    this.unitLength = mean(sideLengths);
  }
}

export function findCornerMarks(cv, imageMat) {
  const allPolygons = findPolygons(cv, imageMat);

  const hexagons = allPolygons.filter(p => p.length === 6);
  const quadrilaterals = allPolygons.filter(p => p.length === 4);

  for (let i = 0; i < hexagons.length; i++) {
    let lMark;
    try {
      lMark = new LMark(hexagons[i]);
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

    const nominalToRightSide = 50 - 0.5; // 49.5
    const nominalToBottom = (64 - 0.5) / 2; // 31.75
    const xTolerance = 0.25 * nominalToRightSide;
    const yTolerance = 0.25 * nominalToBottom;

    const topRightSquares = [];
    const bottomLeftSquares = [];
    const bottomRightSquares = [];

    for (let q = 0; q < quadrilaterals.length; q++) {
      let square;
      try {
        square = new SquareMark(quadrilaterals[q], lMark.unitLength);
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

    if (
      topRightSquares.length > 0 &&
      bottomLeftSquares.length > 0 &&
      bottomRightSquares.length > 0
    ) {
      // Pick square closest to nominal target point in basis space
      topRightSquares.sort((a, b) => {
        const cA = basisTransformer.toBasis(guessCentroid(a.polygon));
        const cB = basisTransformer.toBasis(guessCentroid(b.polygon));
        return Math.hypot(cA.x - nominalToRightSide, cA.y - 0.5) - Math.hypot(cB.x - nominalToRightSide, cB.y - 0.5);
      });

      bottomLeftSquares.sort((a, b) => {
        const cA = basisTransformer.toBasis(guessCentroid(a.polygon));
        const cB = basisTransformer.toBasis(guessCentroid(b.polygon));
        return Math.hypot(cA.x - 0.5, cA.y - nominalToBottom) - Math.hypot(cB.x - 0.5, cB.y - nominalToBottom);
      });

      bottomRightSquares.sort((a, b) => {
        const cA = basisTransformer.toBasis(guessCentroid(a.polygon));
        const cB = basisTransformer.toBasis(guessCentroid(b.polygon));
        return Math.hypot(cA.x - nominalToRightSide, cA.y - nominalToBottom) - Math.hypot(cB.x - nominalToRightSide, cB.y - nominalToBottom);
      });

      const topLeftCorner = lMark.polygon[0];
      const topRightCorner = getCornerWrtBasis(topRightSquares[0].polygon, Corner.TR, basisTransformer);
      const bottomRightCorner = getCornerWrtBasis(bottomRightSquares[0].polygon, Corner.BR, basisTransformer);
      const bottomLeftCorner = getCornerWrtBasis(bottomLeftSquares[0].polygon, Corner.BL, basisTransformer);

      return {
        corners: [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner],
        lMark: lMark.polygon,
        squares: [topRightSquares[0].polygon, bottomRightSquares[0].polygon, bottomLeftSquares[0].polygon]
      };
    }
  }

  throw new Error("Could not detect alignment fiducial corner marks. Please check scan quality and orientation.");
}
