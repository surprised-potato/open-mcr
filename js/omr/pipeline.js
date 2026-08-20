/**
 * pipeline.js - Coordinates the complete OMR scanning process on an image matrix
 */

import { findCornerMarks } from './cornerFinder.js';
import { form75q, form150q, Field, FieldType } from './gridInfo.js';
import {
  Grid,
  calculateBubbleFillThreshold,
  readFieldGroup,
  decodeFieldValue,
  decodeQuestionAnswer,
  evaluateQuestionDetails
} from './gridReader.js';

export function processScanImage(cv, imageMat, options = {}) {
  const variantName = options.variant === '150' ? '150q' : '75q';
  const formVariant = variantName === '150q' ? form150q : form75q;
  const multiAsF = Boolean(options.multiAsF);
  const emptyAsG = Boolean(options.emptyAsG);

  // 1. Locate fiducial alignment marks or use manual corners if provided
  let corners, lMark, squares, rotation = null;
  let processedMat = imageMat;
  let didRotate = false;

  if (options.manualCorners && Array.isArray(options.manualCorners) && options.manualCorners.length === 4) {
    corners = options.manualCorners;
    lMark = null;
    squares = [];
  } else {
    const found = findCornerMarks(cv, imageMat);
    corners = found.corners;
    lMark = found.lMark;
    squares = found.squares;
    rotation = found.rotation !== undefined ? found.rotation : null;
    if (rotation !== null) {
      processedMat = new cv.Mat();
      cv.rotate(imageMat, processedMat, rotation);
      didRotate = true;
    }
  }

  // 2. Construct transformed grid
  const grid = new Grid(corners, processedMat, cv);

  // 3. Read metadata fields
  const fieldData = {};
  const allFillValues = [];
  const fieldBubbleOverlays = [];

  for (const [fieldName, groupInfo] of Object.entries(formVariant.fields)) {
    if (!groupInfo) continue;
    const { fills, bubbleCoordinates } = readFieldGroup(grid, groupInfo);
    fieldData[fieldName] = { fills, groupInfo };
    allFillValues.push(...fills);
    fieldBubbleOverlays.push({ fieldName, bubbleCoordinates });
  }

  // 4. Read question answers
  const questionFills = [];
  const questionBubbleOverlays = [];

  for (let q = 0; q < formVariant.questions.length; q++) {
    const qInfo = formVariant.questions[q];
    const { fills, bubbleCoordinates } = readFieldGroup(grid, qInfo);
    questionFills.push(fills[0]);
    allFillValues.push(fills[0]);
    questionBubbleOverlays.push({ questionIndex: q, bubbleCoordinates: bubbleCoordinates[0] });
  }

  // Dispose OpenCV perspective matrix
  grid.dispose();
  const resultImageWidth = processedMat.cols;
  const resultImageHeight = processedMat.rows;
  if (didRotate) {
    processedMat.delete();
  }

  // 5. Calculate dynamic adaptive threshold
  const threshold = calculateBubbleFillThreshold(allFillValues);

  // 6. Decode metadata values
  const decodedFields = {};
  for (const [fieldName, data] of Object.entries(fieldData)) {
    const isLetter = data.groupInfo.fieldsType === FieldType.LETTER;
    decodedFields[fieldName] = decodeFieldValue(
      data.fills,
      threshold,
      data.groupInfo.fieldsType,
      multiAsF
    );
  }

  // Combine names for 75q
  let studentName = '';
  if (formVariant.fields[Field.LAST_NAME]) {
    const last = decodedFields[Field.LAST_NAME] || '';
    const first = decodedFields[Field.FIRST_NAME] || '';
    const mid = decodedFields[Field.MIDDLE_NAME] || '';
    studentName = [last, first, mid].filter(Boolean).join(' ').trim();
  }

  // 7. Decode answers and calculate per-question confidence & flags
  const questionDetails = [];
  const answers = [];
  let multipleMarksCount = 0;
  let faintMarksCount = 0;
  let blankCount = 0;
  let lowConfidenceCount = 0;

  for (let i = 0; i < questionFills.length; i++) {
    const qFills = questionFills[i];
    const details = evaluateQuestionDetails(qFills, threshold, multiAsF, emptyAsG);
    const qNum = i + 1;

    answers.push(details.answer);
    questionDetails.push({
      q: qNum,
      answer: details.answer,
      confidence: details.confidence,
      flags: details.flags,
      margin: details.margin,
      top1: details.top1,
      top2: details.top2
    });

    if (details.flags.includes('multiple_marks')) multipleMarksCount++;
    if (details.flags.includes('faint_mark')) faintMarksCount++;
    if (details.flags.includes('blank')) blankCount++;
    if (details.flags.includes('low_confidence')) lowConfidenceCount++;
  }

  const flagsSummary = {
    multipleMarks: multipleMarksCount,
    faintMarks: faintMarksCount,
    blankCount,
    lowConfidence: lowConfidenceCount,
    totalFlags: multipleMarksCount + faintMarksCount + lowConfidenceCount
  };

  const hasFlags = flagsSummary.totalFlags > 0;

  // 8. Package bubble annotations for canvas visual inspector
  const annotatedBubbles = [];

  // Question bubbles
  questionBubbleOverlays.forEach((qOverlay, qIdx) => {
    qOverlay.bubbleCoordinates.forEach((bubble, choiceIdx) => {
      const choiceLetter = ['A', 'B', 'C', 'D', 'E'][choiceIdx];
      const isFilled = bubble.fill > threshold;
      annotatedBubbles.push({
        type: 'question',
        qNumber: qIdx + 1,
        choice: choiceLetter,
        center: bubble.center,
        radius: bubble.radius,
        fill: Number(bubble.fill.toFixed(3)),
        isFilled
      });
    });
  });

  // Metadata bubbles
  fieldBubbleOverlays.forEach(fOverlay => {
    fOverlay.bubbleCoordinates.forEach(subField => {
      subField.forEach(bubble => {
        const isFilled = bubble.fill > threshold;
        annotatedBubbles.push({
          type: 'metadata',
          fieldName: fOverlay.fieldName,
          center: bubble.center,
          radius: bubble.radius,
          fill: Number(bubble.fill.toFixed(3)),
          isFilled
        });
      });
    });
  });

  return {
    success: true,
    studentId: decodedFields[Field.STUDENT_ID] || '',
    studentName,
    testFormCode: decodedFields[Field.TEST_FORM_CODE] || '',
    courseId: decodedFields[Field.COURSE_ID] || '',
    answers,
    questionDetails,
    flags: flagsSummary,
    hasFlags,
    threshold: Number(threshold.toFixed(4)),
    corners,
    lMark,
    squares,
    rotation,
    annotatedBubbles,
    imageWidth: resultImageWidth,
    imageHeight: resultImageHeight
  };
}
