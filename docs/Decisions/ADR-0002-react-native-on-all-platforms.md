---
title: ADR-0002 — One React Native codebase for iOS, Android and web
project: kv-eendracht
status: accepted
date: 2026-07-25
tags: [adr, architecture, frontend, react-native, expo, web]
updated: 2026-07-25
---

# ADR-0002 — One React Native codebase for iOS, Android and web

## Status

Accepted, 2026-07-25.

## Context

v1 is a React Native app built with Expo, shipping to iOS and Android only. Two gaps follow
from that:

- The club has **no public website**. Agenda, news and standings are invisible to anyone who
  has not installed the app — a real problem for a village sports club that wants to be
  found.
- **Tournament administration is phone-only.** The builder wizard in
  [[SCREENS]] involves selecting dozens of participants, reviewing a draw, and moving players
  between teams. That is desktop work being done on a 6-inch screen.

Two ways to close the gap: add a separate web application (Next.js) alongside the React
Native app, or compile the existing React Native code to web as well.

## Decision

**One Expo Router codebase targeting iOS, Android and web.** Expo Router compiles to web via
`react-native-web`, so the same routes and components serve all three platforms. Web is built
with `web.output: 'static'`, which pre-renders an HTML document per route rather than shipping
a bare single-page-app shell.

Responsiveness is handled with a `useBreakpoint` hook: the shell renders a bottom tab bar on
phones and a sidebar with wider content on desktop, and the admin screens get genuinely
different, denser layouts above the tablet breakpoint.

## Alternatives considered

**React Native + a separate Next.js web app.** Better web output — true server rendering,
strong SEO, HTML-native tables and forms for the admin console. Rejected because it means two
UI codebases for one small club maintained by essentially one person. Every screen, every
Dutch string and every design token would need building and then keeping in step twice. The
maintenance cost outweighs the rendering benefit at this size.

**Mobile only, as today.** Rejected: it leaves both gaps above unaddressed.

## Consequences

**Good**

- One set of screens, one design system, one set of Dutch copy.
- The web build is a static bundle, so it containerizes trivially — a build stage plus Caddy.
- Anyone can use the club site without installing anything, and admins get a real desktop
  surface for draws.

**Bad**

- **Weaker SEO than server-rendered HTML.** Static export produces correct per-route titles
  and meta tags, but page *content* still arrives via JavaScript, so search engines index the
  club site less richly than a Next.js site would.
- **Heavier payload for web visitors** — the React Native web runtime is shipped to every
  browser.
- Dense data tables and drag-and-drop draws need more work in React Native primitives than
  they would in HTML.

**Accepted deliberately.** These were weighed at decision time and judged worth one codebase.
If search visibility later becomes a priority, the escape hatch is a small server-rendered
surface for just the public content (news, agenda), leaving the app itself untouched.

## Related

- [[ADR-0004-pnpm-monorepo]] — how the shared code is organised
- [[SCREENS]] — the 24 routes this applies to
- [[KV-EENDRACHT-APP-SPEC#6. Screen map and user flows]]
