import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // public
  index("routes/landing.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"), // a school signs up; students never get an account
  route("logout", "routes/logout.tsx"),

  // everything inside the dashboard needs a logged-in user (checked in layout.tsx)
  layout("routes/dashboard/layout.tsx", [
    route("dashboard", "routes/dashboard/home.tsx"),
    route("scan", "routes/dashboard/scan.tsx"),
    route("register", "routes/dashboard/register.tsx"), // the daily present/absent register
    route("classes", "routes/dashboard/classes.tsx"),
    route("classes/:classId", "routes/dashboard/class-detail.tsx"),
    route("students", "routes/dashboard/students.tsx"),
    route("students/:studentId", "routes/dashboard/student-detail.tsx"),
    route("sessions", "routes/dashboard/sessions.tsx"),
    route("sessions/:sessionId", "routes/dashboard/session-detail.tsx"),
    route("users", "routes/dashboard/users.tsx"), // staff accounts
    route("school", "routes/dashboard/school.tsx"), // school settings (admins)
    route("schools", "routes/dashboard/schools.tsx"), // every school on the platform (system)
  ]),
] satisfies RouteConfig;
