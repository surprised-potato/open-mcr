/**
 * geometry.js - Geometric and mathematical utilities for OpenMCR
 */

export class Point {
  constructor(x, y) {
    this.x = Number(x);
    this.y = Number(y);
  }

  distanceTo(other) {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }
}

export class Line {
  constructor(slope, point) {
    this.slope = slope;
    this.point = point;
  }

  getY(x) {
    return this.slope * (x - this.point.x) + this.point.y;
  }
}

export function calc2dDist(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

export function calcAngle(endA, shared, endB) {
  const magA = calc2dDist(shared, endA);
  const magB = calc2dDist(shared, endB);
  const distAB = calc2dDist(endA, endB);
  if (magA === 0 || magB === 0) return 0;
  
  let cosine = (magA * magA + magB * magB - distAB * distAB) / (2 * magA * magB);
  cosine = Math.max(-1, Math.min(1, Math.round(cosine * 10000) / 10000));
  const angle = Math.abs(Math.acos(cosine));
  return angle <= Math.PI ? angle : angle - Math.PI;
}

export function calcCornerAngles(polygon) {
  const result = [];
  const len = polygon.length;
  for (let i = 0; i < len; i++) {
    const prev = polygon[(i - 1 + len) % len];
    const curr = polygon[i];
    const next = polygon[(i + 1) % len];
    result.push(calcAngle(prev, curr, next));
  }
  return result;
}

export function calcSideLengths(polygon) {
  const result = [];
  const len = polygon.length;
  for (let i = 0; i < len; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % len];
    result.push(calc2dDist(curr, next));
  }
  return result;
}

export function allApproxEqual(numbers, target = null, tolerance = 0.25) {
  const targetVal = target !== null ? target : mean(numbers);
  if (targetVal === 0) return numbers.every(n => n === 0);
  return numbers.every(n => Math.abs(n - targetVal) / targetVal <= tolerance);
}

export function allApproxSquare(polygon) {
  const angles = calcCornerAngles(polygon);
  return allApproxEqual(angles, Math.PI / 2, 0.25);
}

export function mean(numbers) {
  if (!numbers || numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

export function isWithinTolerance(val, target, tolerance) {
  return Math.abs(val - target) <= tolerance;
}

export function findGreatestValueIndexes(arr, n = 1) {
  const indexed = arr.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => b.val - a.val);
  return indexed.slice(0, n).map(item => item.idx);
}

export function isAdjacentIndexes(arr, i1, i2) {
  const len = arr.length;
  return (i1 + 1) % len === i2 || (i2 + 1) % len === i1;
}

export function determineWhichIsNext(arr, i1, i2) {
  const len = arr.length;
  if ((i1 + 1) % len === i2) return i2;
  return i1;
}

export function arrangeIndexToFirst(arr, index) {
  return [...arr.slice(index), ...arr.slice(0, index)];
}

export function polygonToClockwise(polygon) {
  // Compute signed polygon area (Shoelace formula)
  let area = 0;
  const len = polygon.length;
  for (let i = 0; i < len; i++) {
    const j = (i + 1) % len;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  // In screen coordinate space (Y down), positive signed area is clockwise
  if (area >= 0) {
    return polygon;
  } else {
    return [...polygon].reverse();
  }
}

export function guessCentroid(polygon) {
  const xs = polygon.map(p => p.x);
  const ys = polygon.map(p => p.y);
  return new Point(
    (Math.max(...xs) + Math.min(...xs)) / 2,
    (Math.max(...ys) + Math.min(...ys)) / 2
  );
}

export const Corner = {
  TL: [1, 0],
  TR: [1, 1],
  BR: [0, 1],
  BL: [0, 0]
};

export function getCorner(square, cornerType) {
  const xs = square.map(p => p.x);
  const highestXs = findGreatestValueIndexes(xs, 2);
  const sidePoints = square.filter((p, i) => {
    return (cornerType[1] === 1 && highestXs.includes(i)) ||
           (cornerType[1] === 0 && !highestXs.includes(i));
  });
  const sideYs = sidePoints.map(p => p.y);
  const highestYIdx = findGreatestValueIndexes(sideYs, 1)[0];
  if (cornerType[0] === 0) {
    return sidePoints[highestYIdx];
  } else {
    const nextIdx = (highestYIdx + 1) % sidePoints.length;
    return sidePoints[nextIdx];
  }
}

export function getCornerWrtBasis(square, cornerType, basis) {
  const transformedSquare = basis.polyToBasis(square);
  const transformedCorner = getCorner(transformedSquare, cornerType);
  return basis.fromBasis(transformedCorner);
}

/**
 * ChangeOfBasisTransformer: Affine coordinate transformation
 */
export class ChangeOfBasisTransformer {
  constructor(origin, bottomLeft, bottomRight) {
    this.origin = origin;
    this.bottomLeft = bottomLeft;
    this.bottomRight = bottomRight;

    // We solve for affine parameters:
    // x_new = a*x + b*y + c
    // y_new = d*x + e*y + f
    // matching: origin -> (0,0), bottomLeft -> (0,1), bottomRight -> (1,1)
    const x0 = origin.x, y0 = origin.y;
    const x1 = bottomLeft.x, y1 = bottomLeft.y;
    const x2 = bottomRight.x, y2 = bottomRight.y;

    const det = x0 * (y1 - y2) - y0 * (x1 - x2) + (x1 * y2 - x2 * y1);
    if (Math.abs(det) < 1e-7) {
      throw new Error("Collinear points in basis transformer");
    }

    // Solve for (a, b, c) -> [0, 0, 1]
    this.a = (y0 - y1) / det;
    this.b = (x1 - x0) / det;
    this.c = (x0 * y1 - x1 * y0) / det;

    // Solve for (d, e, f) -> [0, 1, 1]
    this.d = (y2 - y1) / det;
    this.e = (x1 - x2) / det;
    this.f = (x0 * (y1 - y2) + y0 * (x2 - x1)) / det;

    // Inverse affine transformation parameters
    const tDet = this.a * this.e - this.b * this.d;
    if (Math.abs(tDet) < 1e-7) {
      throw new Error("Singular transformation matrix");
    }
    this.invA = this.e / tDet;
    this.invB = -this.b / tDet;
    this.invD = -this.d / tDet;
    this.invE = this.a / tDet;
  }

  toBasis(point) {
    const x = this.a * point.x + this.b * point.y + this.c;
    const y = this.d * point.x + this.e * point.y + this.f;
    return new Point(x, y);
  }

  fromBasis(point) {
    const xRel = point.x - this.c;
    const yRel = point.y - this.f;
    const x = this.invA * xRel + this.invB * yRel;
    const y = this.invD * xRel + this.invE * yRel;
    return new Point(x, y);
  }

  polyToBasis(polygon) {
    return polygon.map(p => this.toBasis(p));
  }

  polyFromBasis(polygon) {
    return polygon.map(p => this.fromBasis(p));
  }
}
