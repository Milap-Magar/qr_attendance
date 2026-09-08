// defining enums - using as const because it might not infer the exact values of each elements of arrays of values:
export const genderEnum = ["male", "female", "other"] as const;
export const roleEnum = ["system" , "admin", "user", "teacher"];
