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
  const sigma = minDim * 5.6569e-4;
  const dst = new cv.Mat();
  const ksize = new cv.Size(0, 0);
  cv.GaussianBlur(src, dst, ksize, sigma, sigma, cv.BORDER_DEFAULT);
  return dst;
}

export function detectEdges(cv, src) {
  const dst = new cv.Mat();
  const lowThreshold = 100;
  cv.Canny(src, dst, lowThreshold, lowThreshold * 3, 3, true);
  return dst;
}

export function findPolygons(cv, src) {
  const gray = convertToGrayscale(cv, src);
  const smoothed = removeHfNoise(cv, gray);
  const edges = detectEdges(cv, smoothed);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

  const polygons = [];
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const perimeter = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.05 * perimeter, true);

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

  contours.delete();
  hierarchy.delete();
  edges.delete();
  smoothed.delete();
  gray.delete();

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
