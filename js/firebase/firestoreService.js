/**
 * firestoreService.js - Cloud Firestore CRUD operations for exam data (no images)
 */

import { getFirestore, initFirebase } from './config.js';

export async function saveExamToCloud(examConfig, answerKeys, submissions) {
  const { db, modules } = getFirestore();
  if (!db || !modules) {
    const initRes = await initFirebase();
    if (!initRes.connected) {
      throw new Error(initRes.error || "Firebase is not connected.");
    }
  }

  const { firestoreMod } = getFirestore().modules;
  const firestoreDb = getFirestore().db;

  const { doc, setDoc, collection } = firestoreMod;
  const examId = examConfig.id || `exam_${Date.now()}`;

  // 1. Save exam metadata
  const examRef = doc(firestoreDb, 'openmcr_exams', examId);
  await setDoc(examRef, {
    id: examId,
    name: examConfig.name || 'Untitled Exam',
    variant: examConfig.variant || '75',
    numQuestions: Number(examConfig.variant === '150' ? 150 : 75),
    updatedAt: new Date().toISOString(),
    submissionCount: submissions.length
  }, { merge: true });

  // 2. Save answer keys
  const keysRef = doc(firestoreDb, 'openmcr_exams', examId, 'settings', 'answerKeys');
  await setDoc(keysRef, {
    keys: answerKeys,
    updatedAt: new Date().toISOString()
  });

  // 3. Save student results (batch or per-doc)
  const resultsCol = collection(firestoreDb, 'openmcr_exams', examId, 'submissions');
  for (const sub of submissions) {
    const docId = sub.studentId ? `sub_${sub.studentId.replace(/[^a-zA-Z0-9_-]/g, '_')}` : `sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const subRef = doc(resultsCol, docId);
    await setDoc(subRef, {
      studentId: sub.studentId || '',
      studentName: sub.studentName || '',
      testFormCode: sub.testFormCode || '',
      courseId: sub.courseId || '',
      score: sub.score || 0,
      points: sub.points || 0,
      answers: sub.answers || [],
      threshold: sub.threshold || 0,
      scannedAt: sub.scannedAt || new Date().toISOString()
    }, { merge: true });
  }

  return { success: true, examId };
}

export async function loadExamsFromCloud() {
  const { db, modules } = getFirestore();
  if (!db || !modules) {
    const initRes = await initFirebase();
    if (!initRes.connected) return [];
  }

  const { firestoreMod } = getFirestore().modules;
  const firestoreDb = getFirestore().db;
  const { collection, getDocs } = firestoreMod;

  const examsCol = collection(firestoreDb, 'openmcr_exams');
  const snap = await getDocs(examsCol);

  const exams = [];
  snap.forEach(docSnap => {
    exams.push(docSnap.data());
  });

  return exams;
}

export async function loadExamDetails(examId) {
  const { firestoreMod } = getFirestore().modules;
  const firestoreDb = getFirestore().db;
  const { doc, getDoc, collection, getDocs } = firestoreMod;

  // Metadata
  const examRef = doc(firestoreDb, 'openmcr_exams', examId);
  const examSnap = await getDoc(examRef);
  if (!examSnap.exists()) {
    throw new Error("Exam not found in cloud.");
  }
  const examData = examSnap.data();

  // Keys
  const keysRef = doc(firestoreDb, 'openmcr_exams', examId, 'settings', 'answerKeys');
  const keysSnap = await getDoc(keysRef);
  const answerKeys = keysSnap.exists() ? (keysSnap.data().keys || {}) : {};

  // Submissions
  const subsCol = collection(firestoreDb, 'openmcr_exams', examId, 'submissions');
  const subsSnap = await getDocs(subsCol);
  const submissions = [];
  subsSnap.forEach(s => submissions.push(s.data()));

  return { examData, answerKeys, submissions };
}
