import type { ReactNode } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { LanguageProvider } from "./lib/i18n";
import "./styles.css";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-US">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Meeting Booking" },
    {
      name: "description",
      content: "A simple way to share your availability and book a meeting.",
    },
  ];
}

export default function App() {
  return <LanguageProvider><Outlet /></LanguageProvider>;
}
