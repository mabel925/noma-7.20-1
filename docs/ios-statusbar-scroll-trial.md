# iOS 27 status-bar scroll experiment

WebKit issue: https://bugs.webkit.org/show_bug.cgi?id=324438

This is an experiment, not a confirmed fix for the system blur. It runs once per document, after `noma-home-ready`, on iOS 27 standalone/fullscreen PWAs in portrait. Ordinary Safari/browser tabs, Android, older iOS versions, and landscape launches do not run it. It does not run again on focus or visibility changes.

The app normally locks document scrolling. The experiment briefly enables the root scrolling element and inserts a hidden spacer, scrolls the actual window to 1px, then returns it to 0 after 50ms. The app canvas stays fixed; app height, background positioning and navigation safe areas are untouched. The normal overflow settings are restored and the spacer is removed. A 250ms watchdog and input, page-hide, and visibility events cancel and clean up the experiment. An open dialog, focused editor, or active capture skips the experiment entirely, including a restored OTP form.

Disable for a deployment with `VITE_IOS_STATUSBAR_SCROLL_TRIAL=0`, or disable for a launch with `?statusbarScrollTest=0`. Local development can exercise the mechanism in a desktop browser with `?statusbarScrollTest=1`. The development override is unavailable in production.

Read-only diagnostics on `document.documentElement.dataset`:

- `nomaStatusbarScrollTrial`: `scrolled`, `no-scroll`, `interrupted`, or `skipped-active-ui`.
- `nomaStatusbarScrollPath`: measured window scroll positions, ideally `0,1,0`.

`scrolled` confirms the scroll happened and was restored. It does not confirm the native blur disappeared. On an actual iPhone, launch the updated PWA in portrait with no login dialog open, observe the status-bar region, and navigate through Home, Chat, Memory and capture. Also leave the app and return, and verify normal browser mode and OTP switching still behave normally. This first experiment deliberately does not repeat on resume.
