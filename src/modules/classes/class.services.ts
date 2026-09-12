import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { classes, students } from "../../db/schema";
import { AppError, isUniqueViolation } from "../../common/errors";
import type { CreateClassInput, ListClassesQuery, UpdateClassInput } from "./class.types";

const classColumns = {
  id: classes.id,
  organizationId: classes.organizationId,
  grade: classes.grade,
  section: classes.section,
  academicYear: classes.academicYear,
  createdAt: classes.createdAt,
};

// "Grade 10 A" / "Grade 10" — one place that decides how a class reads, so the API,
// the printed card and the report all say the same thing.
export const classLabel = (c: { grade: string; section: string }) =>
  c.section ? `${c.grade} ${c.section}` : c.grade;

const withLabel = <T extends { grade: string; section: string }>(c: T) => ({ ...c, label: classLabel(c) });

// Classes sort the way a register does: by year (newest first), then grade, then section.
// grade is text ("10", "9", "Nursery"), so a plain sort puts "10" before "9". Sorting by
// length first keeps single-digit grades together and ahead of double-digit ones.
const classOrder = [
  sql`${classes.academicYear} desc`,
  sql`length(${classes.grade})`,
  asc(classes.grade),
  asc(classes.section),
];

// Every function takes the caller's school. A class from another school is a 404,
// exactly like one that doesn't exist.
export const classServices = {
  async create(input: CreateClassInput, orgId: string) {
    try {
      const [created] = await db.insert(classes)
        .values({ ...input, organizationId: orgId })
        .returning(classColumns);
      return withLabel({ ...created!, studentCount: 0 });
    } catch (error) {
      if (isUniqueViolation(error, "classes_org_grade_section_year_unique")) {
        throw new AppError(409, `${classLabel(input)} already exists for ${input.academicYear}`, "CLASS_EXISTS");
      }
      throw error;
    }
  },

  // every class in the school with how many students are on its roster
  async list(orgId: string, filters: ListClassesQuery = {}) {
    const rows = await db
      .select({ ...classColumns, studentCount: count(students.id) })
      .from(classes)
      // LEFT JOIN so a class with nobody in it still shows up, with 0
      .leftJoin(students, and(eq(students.classId, classes.id), eq(students.isActive, true)))
      .where(and(
        eq(classes.organizationId, orgId),
        filters.academicYear ? eq(classes.academicYear, filters.academicYear) : undefined,
        filters.grade ? eq(classes.grade, filters.grade) : undefined,
      ))
      .groupBy(classes.id)
      .orderBy(...classOrder);
    return rows.map(withLabel);
  },

  async getById(id: string, orgId: string) {
    const [found] = await db
      .select({ ...classColumns, studentCount: count(students.id) })
      .from(classes)
      .leftJoin(students, and(eq(students.classId, classes.id), eq(students.isActive, true)))
      .where(and(eq(classes.id, id), eq(classes.organizationId, orgId)))
      .groupBy(classes.id);
    if (!found) {
      throw new AppError(404, "Class not found", "CLASS_NOT_FOUND");
    }
    return withLabel(found);
  },

  // the distinct academic years this school has classes for — the year picker on the classes page
  async academicYears(orgId: string) {
    const rows = await db
      .selectDistinct({ academicYear: classes.academicYear })
      .from(classes)
      .where(eq(classes.organizationId, orgId))
      .orderBy(sql`${classes.academicYear} desc`);
    return rows.map((row) => row.academicYear);
  },

  async update(id: string, orgId: string, input: UpdateClassInput) {
    await classServices.getById(id, orgId); // 404 if missing / other school
    try {
      const [updated] = await db.update(classes)
        .set(input)
        .where(and(eq(classes.id, id), eq(classes.organizationId, orgId)))
        .returning(classColumns);
      return withLabel(updated!);
    } catch (error) {
      if (isUniqueViolation(error, "classes_org_grade_section_year_unique")) {
        throw new AppError(409, "Another class already has that grade, section and year", "CLASS_EXISTS");
      }
      throw error;
    }
  },

  // Deleting a class with students would orphan their attendance history, so it's blocked
  // (the FK is ON DELETE RESTRICT as well — this check exists to give a readable message).
  // Move or remove the students first.
  async remove(id: string, orgId: string) {
    const found = await classServices.getById(id, orgId);
    // counts EVERY student, not just active ones: `found.studentCount` excludes students who
    // left mid-year, and those rows would still make the FK refuse the delete.
    const [totals] = await db.select({ total: count() }).from(students).where(eq(students.classId, id));
    const total = totals?.total ?? 0;
    if (total > 0) {
      throw new AppError(409, `${found.label} still has ${total} student(s). Move or remove them first.`, "CLASS_NOT_EMPTY");
    }
    await db.delete(classes).where(and(eq(classes.id, id), eq(classes.organizationId, orgId)));
    return { id };
  },
};
