/**
 * imageUtils.js - OpenCV.js helper functions
 */

import { Point, polygonToClockwise } from './geometry.js';

export function convertToGrayscale(cv, src) {
  const dst = new cv.Mat();
  if (src.channels() === 4) {
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
  } else if (src.channels() === 3) {
    cv.cvtColor(src, dst, cv.COLOR_RGB2GRAY);
  } else {
    src.copyTo(dst);
  }
  return dst;
}

export function removeHfNoise(cv, src) {
  const minDim = Math.min(src.rows, src.cols);
  const sigma = minDim * 1.1314e-3;
  const dst = new cv.Mat();
  const ksize = new cv.Size(0, 0);
  cv.GaussianBlur(src, dst, ksize, sigma, sigma, cv.BORDER_DEFAULT);
  return dst;
}

export function closeGaps(cv, src) {
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  const dst = new cv.Mat();
  cv.morphologyEx(src, dst, cv.MORPH_CLOSE, kernel);
  kernel.delete();
  return dst;
}

export function detectEdges(cv, src) {
  const tempDst = new cv.Mat();
  const otsuThresh = cv.threshold(src, tempDst, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
  tempDst.delete();

  const low = Math.round(Math.max(20, otsuThresh * 0.25));
  const high = Math.round(Math.min(200, otsuThresh * 0.65));

  const dst = new cv.Mat();
  cv.Canny(src, dst, low, high, 3, true);
  return dst;
}

export function extractContours(cv, src) {
  const gray = convertToGrayscale(cv, src);
  const smoothed = removeHfNoise(cv, gray);
  const closed = closeGaps(cv, smoothed);
  const edges = detectEdges(cv, closed);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

  edges.delete();
  closed.delete();
  smoothed.delete();
  gray.delete();
  hierarchy.delete();

  return contours;
}

export function contoursToPolygons(cv, contours, epsilonFraction = 0.02) {
  const polygons = [];
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const perimeter = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, epsilonFraction * perimeter, true);

    const polyPoints = [];
    for (let j = 0; j < approx.rows; j++) {
      polyPoints.push(new Point(approx.data32S[j * 2], approx.data32S[j * 2 + 1]));
    }
    approx.delete();
    contour.delete();

    if (polyPoints.length >= 3) {
      polygons.push(polygonToClockwise(polyPoints));
    }
  }
  return polygons;
}

export function findPolygons(cv, src, epsilonFraction = 0.02) {
  const contours = extractContours(cv, src);
  const polygons = contoursToPolygons(cv, contours, epsilonFraction);
  contours.delete();
  return polygons;
}

export function thresholdImage(cv, src) {
  const gray = convertToGrayscale(cv, src);
  const smoothed = removeHfNoise(cv, gray);
  const dst = new cv.Mat();
  cv.threshold(smoothed, dst, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
  gray.delete();
  smoothed.delete();
  return dst;
}
