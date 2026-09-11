import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // public
  index("routes/landing.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"), // a school signs up
  route("register", "routes/register.tsx"), // a student joins a school (?code=JOINCODE)
  route("logout", "routes/logout.tsx"),

  // everything inside the dashboard needs a logged-in user (checked in layout.tsx)
  layout("routes/dashboard/layout.tsx", [
    route("dashboard", "routes/dashboard/home.tsx"),
    route("scan", "routes/dashboard/scan.tsx"),
    route("sessions", "routes/dashboard/sessions.tsx"),
    route("sessions/:sessionId", "routes/dashboard/session-detail.tsx"),
    route("users", "routes/dashboard/users.tsx"),
    route("attendance", "routes/dashboard/my-attendance.tsx"),
    route("my-qr", "routes/dashboard/my-qr.tsx"),
    route("school", "routes/dashboard/school.tsx"), // school settings + join code (admins)
    route("schools", "routes/dashboard/schools.tsx"), // every school on the platform (system)
  ]),
] satisfies RouteConfig;
