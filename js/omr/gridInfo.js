/**
 * gridInfo.js - Grid dimensions and form layouts
 */

export const KEY_STUDENT_ID = "9999999999";
export const GRID_HORIZONTAL_CELLS = 36;
export const GRID_VERTICAL_CELLS = 48;

export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

export const Field = {
  LAST_NAME: 'LAST_NAME',
  FIRST_NAME: 'FIRST_NAME',
  MIDDLE_NAME: 'MIDDLE_NAME',
  TEST_FORM_CODE: 'TEST_FORM_CODE',
  STUDENT_ID: 'STUDENT_ID',
  COURSE_ID: 'COURSE_ID'
};

export const FieldType = {
  LETTER: 'LETTER',
  NUMBER: 'NUMBER'
};

export const Orientation = {
  VERTICAL: 'VERTICAL',
  HORIZONTAL: 'HORIZONTAL'
};

export class GridGroupInfo {
  constructor(horizontalStart, verticalStart, numFields = 1, fieldsType = FieldType.NUMBER, fieldLength = null, fieldOrientation = Orientation.VERTICAL) {
    this.horizontalStart = horizontalStart;
    this.verticalStart = verticalStart;
    this.numFields = numFields;
    this.fieldsType = fieldsType;
    if (fieldLength !== null) {
      this.fieldLength = fieldLength;
    } else if (fieldsType === FieldType.LETTER) {
      this.fieldLength = LETTERS.length; // 26
    } else {
      this.fieldLength = 10; // digits 0-9
    }
    this.fieldOrientation = fieldOrientation;
  }
}

export const form75q = {
  name: '75q',
  numQuestions: 75,
  fields: {
    [Field.LAST_NAME]: new GridGroupInfo(1, 3, 12, FieldType.LETTER, 26, Orientation.VERTICAL),
    [Field.FIRST_NAME]: new GridGroupInfo(14, 3, 6, FieldType.LETTER, 26, Orientation.VERTICAL),
    [Field.MIDDLE_NAME]: new GridGroupInfo(21, 3, 2, FieldType.LETTER, 26, Orientation.VERTICAL),
    [Field.STUDENT_ID]: new GridGroupInfo(25, 3, 10, FieldType.NUMBER, 10, Orientation.VERTICAL),
    [Field.COURSE_ID]: new GridGroupInfo(25, 16, 10, FieldType.NUMBER, 10, Orientation.VERTICAL),
    [Field.TEST_FORM_CODE]: new GridGroupInfo(27, 28, 1, FieldType.LETTER, 6, Orientation.HORIZONTAL)
  },
  questions: Array.from({ length: 75 }, (_, i) => {
    const col = Math.floor(i / 15);
    const row = i % 15;
    return new GridGroupInfo(
      2 + (7 * col),
      32 + row,
      1,
      FieldType.LETTER,
      5, // choices A, B, C, D, E
      Orientation.HORIZONTAL
    );
  })
};

export const form150q = {
  name: '150q',
  numQuestions: 150,
  fields: {
    [Field.STUDENT_ID]: new GridGroupInfo(25, 3, 10, FieldType.NUMBER, 10, Orientation.VERTICAL),
    [Field.COURSE_ID]: new GridGroupInfo(14, 3, 10, FieldType.NUMBER, 10, Orientation.VERTICAL),
    [Field.TEST_FORM_CODE]: new GridGroupInfo(4, 12, 1, FieldType.LETTER, 6, Orientation.HORIZONTAL)
  },
  questions: Array.from({ length: 150 }, (_, i) => {
    const col = Math.floor(i / 30);
    const row = i % 30;
    return new GridGroupInfo(
      2 + (7 * col),
      17 + row,
      1,
      FieldType.LETTER,
      5, // choices A, B, C, D, E
      Orientation.HORIZONTAL
    );
  })
};
