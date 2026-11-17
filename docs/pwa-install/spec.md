# Home Screen installation guide

## L1 — Intent
Help mobile browser visitors open noma as a full-screen app. Keep browser use available. This flow adds no authentication, uploads, model requests, or automatic installation.

## L2 — Structure
`template: custom`: a compact home banner and an explicitly opened bottom dialog, preserving the existing home canvas. Banner: icon, brief invitation, right-aligned gradient Add action, circular dismissal at the upper-right corner. Dialog: app icon with a 3px white border and 20px corner radius, benefit, three device-specific steps, close, single primary action. An account link provides a permanent way to reopen guidance after dismissal.

## L3 — Flow
Once the home scene is ready, mobile browser users see the banner. Opening Chat, Memory, capture, scanning or login hides the banner. Tapping the invitation opens instructions; it never opens automatically. iOS uses manual share-menu instructions. Android uses native installation when beforeinstallprompt is available; otherwise menu instructions. Closing or dismissing snoozes the banner for seven days. Account entry can reopen it immediately.

## L4 — Components / domain
InstallBanner is a non-blocking invitation. InstallDialog owns manual steps and user-triggered native installation. InstallPrompt is a single-use browser event, captured before the asynchronous startup gate; it is never invoked without a tap. Dismissal is a local timestamp, independent of the user account and cloud data. appinstalled and standalone display changes hide all installation UI. Existing CloseIcon is reused.

## L5 — Edges
Desktop and standalone launches do not show install UI. iPad desktop user agents are recognized via touch support. Known embedded browsers are told to open Safari/Chrome first. Blocked storage still permits in-memory dismissal. Native prompt dismissal closes the guide; rejection shows manual fallback. UI does not claim installation succeeded until the browser signals it. No network wait is added. Escape, trapped keyboard focus, visible close controls, scrollable short-screen content and reduced motion are supported.

## L6 — Acceptance / QA
- iOS browser: banner only on idle home; invitation opens three instructions including Share, Add to Home Screen and Open as Web App if shown.
- Desktop/PWA: no banner or account install action; ordinary navigation is unchanged.
- Close banner, navigate and reopen: banner stays snoozed. Account action can still open the guide.
- Native prompt: one tap invokes one prompt, concurrent use cannot duplicate it, rejection falls back to manual instructions.
- No real installation, email, camera or AI request is required for local QA. Development-only `?installGuide=ios` / `android` previews device guidance on desktop; `pwa=1` still suppresses it.
- Unit tests cover platform routing, blocked storage, early event capture, installation completion, single-use prompts and error/dismissal paths. Type-check/build and visual browser checks complete verification; actual iOS installation remains a device check.

## Evaluation
The existing page hierarchy is preserved. Installation is optional and deferred to a tap; account and capture actions stay available. No alternative IA is needed for this contained feature. No new permission or data collection is introduced.
