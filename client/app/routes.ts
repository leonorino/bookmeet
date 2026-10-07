import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("manage/:organizerId", "routes/manage.tsx"),
  route("book/:organizerId", "routes/book.tsx"),
  route("cancel", "routes/cancel.tsx"),
  route("privacy", "routes/privacy.tsx"),
] satisfies RouteConfig;
