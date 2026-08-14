const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const cv = require('../vendor/opencv.js');

cv.onRuntimeInitialized = async () => {
  const { processScanImage } = await import('../js/omr/pipeline.js');

  function loadImageMat(imagePath) {
    const pyCode = `
import cv2, sys
img = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
if img is None:
    sys.exit(1)
if len(img.shape) == 2:
    img = cv2.cvtColor(img, cv2.COLOR_GRAY2RGBA)
elif img.shape[2] == 3:
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
elif img.shape[2] == 4:
    img = cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
h, w = img.shape[:2]
sys.stdout.buffer.write(f"{w},{h}\\n".encode('ascii'))
sys.stdout.buffer.write(img.tobytes())
`;
    const result = spawnSync('python3', ['-c', pyCode, imagePath], { maxBuffer: 50 * 1024 * 1024 });
    if (result.status !== 0) {
      throw new Error(`Failed to load image: ${imagePath}`);
    }

    const newlineIdx = result.stdout.indexOf(10); // '\n'
    const header = result.stdout.subarray(0, newlineIdx).toString('ascii');
    const [w, h] = header.split(',').map(Number);
    const rawBytes = result.stdout.subarray(newlineIdx + 1);

    const mat = new cv.Mat(h, w, cv.CV_8UC4);
    mat.data.set(rawBytes);
    return mat;
  }

  const testCases = [
    { name: 'Sample Scan 1', path: 'assets/sample_scan_1.png', shouldPass: true },
    { name: 'Sample Scan 2', path: 'assets/sample_scan_2.png', shouldPass: true },
    { name: 'Sample Scan 3', path: 'assets/sample_scan_3.png', shouldPass: true },
    { name: 'Sample Exam Scan', path: 'assets/sample_exam_scan.png', shouldPass: true },
    { name: 'Failing E33_028', path: 'Scans-20260813T013806Z-1-001/Scans/E33/PNG/Scan2023-11-09_191403_028.jpg', shouldPass: true },
    { name: 'Failing E33_023', path: 'Scans-20260813T013806Z-1-001/Scans/E33/PNG/Scan2023-11-09_191403_023.jpg', shouldPass: true },
    { name: 'Failing E33_024', path: 'Scans-20260813T013806Z-1-001/Scans/E33/PNG/Scan2023-11-09_191403_024.jpg', shouldPass: true },
    { name: 'Failing E33_033', path: 'Scans-20260813T013806Z-1-001/Scans/E33/PNG/Scan2023-11-09_191403_033.jpg', shouldPass: true },
    { name: 'Failing E34_008', path: 'Scans-20260813T013806Z-1-001/Scans/E34/PNG/Scan2023-11-09_193010_008.jpg', shouldPass: true },
    { name: 'Failing E34_013', path: 'Scans-20260813T013806Z-1-001/Scans/E34/PNG/Scan2023-11-09_193010_013.jpg', shouldPass: true },
    { name: 'Rotated 90deg', path: 'test/end-to-end/rotation/input/90deg.jpg', shouldPass: true },
    { name: 'Rotated 180deg', path: 'test/end-to-end/rotation/input/180deg.jpg', shouldPass: true },
    { name: 'Rotated 270deg', path: 'test/end-to-end/rotation/input/270deg.jpg', shouldPass: true },
    { name: 'Reject File', path: 'test/end-to-end/rejected-file/input/reject.png', shouldPass: false }
  ];

  console.log(`\n================= STARTING JS OMR PIPELINE TESTS =================\n`);
  let passedCount = 0;
  let totalCount = testCases.length;

  for (const tc of testCases) {
    const fullPath = path.resolve(tc.path);
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️ SKIPPING [${tc.name}]: File not found at ${fullPath}`);
      continue;
    }

    const t0 = Date.now();
    try {
      const mat = loadImageMat(fullPath);
      const res = processScanImage(cv, mat, { variant: '75' });
      mat.delete();
      const elapsed = Date.now() - t0;

      if (tc.shouldPass) {
        console.log(`✅ PASS [${tc.name}] (${elapsed}ms): StudentID='${res.studentId}', Form='${res.testFormCode}', Rotation=${res.rotation !== null ? res.rotation : 'None'}, Answers=${res.answers.filter(Boolean).length}`);
        passedCount++;
      } else {
        console.log(`❌ FAIL [${tc.name}] (${elapsed}ms): Expected to reject, but passed.`);
      }
    } catch (err) {
      const elapsed = Date.now() - t0;
      if (!tc.shouldPass) {
        console.log(`✅ PASS [${tc.name}] (${elapsed}ms): Correctly rejected (${err.message})`);
        passedCount++;
      } else {
        console.log(`❌ FAIL [${tc.name}] (${elapsed}ms): Unexpected error: ${err.message}`);
      }
    }
  }

  console.log(`\n==================================================================`);
  console.log(`RESULTS: ${passedCount}/${totalCount} tests passed.`);
  console.log(`==================================================================\n`);

  if (passedCount !== totalCount) {
    process.exit(1);
  }
};
