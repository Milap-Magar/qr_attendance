import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { classes, credentials, students } from "../../db/schema";
import { AppError, isUniqueViolation } from "../../common/errors";
import { classLabel, classServices } from "../classes/class.services";
import { issueCardFor, type Tx } from "../qr/credential.core";
import type { CreateStudentInput, ImportStudentsInput, ListStudentsQuery, UpdateStudentInput } from "./student.types";

const studentColumns = {
  id: students.id,
  organizationId: students.organizationId,
  classId: students.classId,
  rollNo: students.rollNo,
  name: students.name,
  gender: students.gender,
  isActive: students.isActive,
  createdAt: students.createdAt,
};

// Does this student hold a card that still works? Cheaper than joining the whole credentials
// table when all the roster needs is a yes/no badge.
const hasActiveCard = sql<boolean>`exists (
  select 1 from ${credentials}
  where ${credentials.studentId} = ${students.id} and ${credentials.revokedAt} is null
)`.as("hasActiveCard");

// A register is read in roll-number order. Roll numbers are text, so "10" would sort before "2";
// sorting by length first fixes that for the numeric ones without breaking "2026/007".
const byRollNo = [sql`length(${students.rollNo})`, asc(students.rollNo)];

// class fields every student row carries, so the frontend can group and label without a second call
const classFields = {
  class: {
    id: classes.id,
    grade: classes.grade,
    section: classes.section,
    academicYear: classes.academicYear,
  },
};

const withClassLabel = <T extends { class: { grade: string; section: string } }>(row: T) => ({
  ...row,
  class: { ...row.class, label: classLabel(row.class) },
});

// Every function takes the caller's school. A student from another school is a 404,
// exactly like one that doesn't exist.
export const studentServices = {
  // Add one student AND issue their QR card, both or neither.
  // The returned `card.token` is readable only here — print it before leaving the page.
  async create(input: CreateStudentInput, orgId: string) {
    await classServices.getById(input.classId, orgId); // 404 if the class is missing / another school's

    try {
      return await db.transaction(async (tx) => {
        const [student] = await tx.insert(students)
          .values({ ...input, organizationId: orgId })
          .returning(studentColumns);
        const card = await issueCardFor(student!.id, tx);
        return { student: student!, card };
      });
    } catch (error) {
      if (isUniqueViolation(error, "students_class_roll_no_unique")) {
        throw new AppError(409, `Roll number ${input.rollNo} is already used in this class`, "ROLL_NO_TAKEN");
      }
      throw error;
    }
  },

  // Bulk add one class's roster (from a CSV the frontend already parsed).
  //
  // A duplicate roll number skips THAT row and keeps going, instead of failing the whole file —
  // re-uploading a corrected sheet, or one with a few students already added, then does the right
  // thing. Each row runs in its own SAVEPOINT (`tx.transaction` nested), so a rejected row rolls
  // back cleanly without taking the rows around it with it.
  async importMany({ classId, rows }: ImportStudentsInput, orgId: string) {
    await classServices.getById(classId, orgId); // 404 if the class is missing / another school's

    const created: Array<Awaited<ReturnType<typeof studentServices.create>>> = [];
    const skipped: Array<{ rollNo: string; name: string; reason: string }> = [];

    await db.transaction(async (tx: Tx) => {
      for (const row of rows) {
        try {
          await tx.transaction(async (savepoint) => {
            const [student] = await savepoint.insert(students)
              .values({ ...row, classId, organizationId: orgId })
              .returning(studentColumns);
            const card = await issueCardFor(student!.id, savepoint);
            created.push({ student: student!, card });
          });
        } catch (error) {
          // covers both "already in the class" and "twice in the same file"
          if (isUniqueViolation(error, "students_class_roll_no_unique")) {
            skipped.push({ rollNo: row.rollNo, name: row.name, reason: "Roll number already used in this class" });
            continue;
          }
          throw error;
        }
      }
    });

    return { created, skipped, imported: created.length, skippedCount: skipped.length };
  },

  async list(orgId: string, filters: ListStudentsQuery = { includeInactive: false }) {
    const search = filters.q ? `%${filters.q}%` : null;
    const rows = await db
      .select({ ...studentColumns, ...classFields, hasActiveCard })
      .from(students)
      .innerJoin(classes, eq(classes.id, students.classId))
      .where(and(
        eq(students.organizationId, orgId),
        filters.classId ? eq(students.classId, filters.classId) : undefined,
        filters.includeInactive ? undefined : eq(students.isActive, true),
        search ? or(ilike(students.name, search), ilike(students.rollNo, search)) : undefined,
      ))
      .orderBy(...byRollNo);
    return rows.map(withClassLabel);
  },

  // one class's roster, including students who left (the frontend greys them out)
  async listByClass(classId: string, orgId: string) {
    await classServices.getById(classId, orgId); // 404 if the class is missing / another school's
    return await studentServices.list(orgId, { classId, includeInactive: true });
  },

  async getById(id: string, orgId: string) {
    const [found] = await db
      .select({ ...studentColumns, ...classFields, hasActiveCard })
      .from(students)
      .innerJoin(classes, eq(classes.id, students.classId))
      .where(and(eq(students.id, id), eq(students.organizationId, orgId)));
    if (!found) {
      throw new AppError(404, "Student not found", "STUDENT_NOT_FOUND");
    }
    return withClassLabel(found);
  },

  async update(id: string, orgId: string, input: UpdateStudentInput) {
    await studentServices.getById(id, orgId); // 404 if missing / other school
    // moving a student to another class: that class must be ours too
    if (input.classId) await classServices.getById(input.classId, orgId);

    try {
      const [updated] = await db.update(students)
        .set(input)
        .where(and(eq(students.id, id), eq(students.organizationId, orgId)))
        .returning(studentColumns);
      return await studentServices.getById(updated!.id, orgId);
    } catch (error) {
      if (isUniqueViolation(error, "students_class_roll_no_unique")) {
        throw new AppError(409, "That roll number is already used in the target class", "ROLL_NO_TAKEN");
      }
      throw error;
    }
  },

  // A student who LEFT should be deactivated, not deleted — deleting throws their attendance
  // history away with them (the card and records cascade). Deletion is for a row added by mistake.
  async remove(id: string, orgId: string) {
    await studentServices.getById(id, orgId); // 404 if missing / other school
    await db.delete(students).where(and(eq(students.id, id), eq(students.organizationId, orgId)));
    return { id };
  },
};
