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

export function extractContours(cv, src, pass = 1) {
  return extractContoursAdaptive(cv, src, pass);
}

export function extractContoursAdaptive(cv, src, pass = 1) {
  const gray = convertToGrayscale(cv, src);
  const smoothed = removeHfNoise(cv, gray);
  const minDim = Math.min(smoothed.rows, smoothed.cols);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  if (pass === 1) {
    // Pass 1: Standard Binary Otsu + Canny edge contours
    const thresh = new cv.Mat();
    cv.threshold(smoothed, thresh, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);

    cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const closed = closeGaps(cv, smoothed);
    const edges = detectEdges(cv, closed);
    const edgeContours = new cv.MatVector();
    const edgeHierarchy = new cv.Mat();
    cv.findContours(edges, edgeContours, edgeHierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < edgeContours.size(); i++) {
      contours.push_back(edgeContours.get(i));
    }

    thresh.delete();
    kernel.delete();
    edges.delete();
    edgeHierarchy.delete();
    edgeContours.delete();
    closed.delete();
  } else if (pass === 2) {
    // Pass 2: Adaptive Gaussian Thresholding for shadow gradients & non-uniform lighting
    let blockSize = Math.floor(minDim / 24);
    if (blockSize % 2 === 0) blockSize += 1;
    blockSize = Math.max(15, blockSize);

    const adaptiveThresh = new cv.Mat();
    cv.adaptiveThreshold(smoothed, adaptiveThresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, blockSize, 5);
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.morphologyEx(adaptiveThresh, adaptiveThresh, cv.MORPH_CLOSE, kernel);

    cv.findContours(adaptiveThresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    adaptiveThresh.delete();
    kernel.delete();
  } else if (pass === 3) {
    // Pass 3: Morphological Black-Hat filter to isolate dark marks on variable/faint backgrounds
    let morphDim = Math.max(9, Math.floor(minDim / 35));
    if (morphDim % 2 === 0) morphDim += 1;
    const morphKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(morphDim, morphDim));
    const blackhat = new cv.Mat();
    cv.morphologyEx(smoothed, blackhat, cv.MORPH_BLACKHAT, morphKernel);
    morphKernel.delete();

    const thresh = new cv.Mat();
    cv.threshold(blackhat, thresh, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);

    cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    blackhat.delete();
    thresh.delete();
  }

  hierarchy.delete();
  smoothed.delete();
  gray.delete();

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

export function findPolygons(cv, src, epsilonFraction = 0.02, pass = 1) {
  const contours = extractContoursAdaptive(cv, src, pass);
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
