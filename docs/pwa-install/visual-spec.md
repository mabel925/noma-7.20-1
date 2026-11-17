# Installation guide visual and motion specification

Use noma's existing cream surface, dark text, app icon, rounded controls and CloseIcon. Keep all new measurements, colors and timing in `--install-*` CSS tokens; existing literals are consolidated into these feature-scoped tokens rather than introducing a second visual language.

The compact banner sits below the home header and above the character. The guide is a single-column bottom dialog with three icon/text rows. Primary action is dark, auxiliary text muted, and instructions remain readable on short screens by scrolling inside the sheet. Controls have at least 44px touch targets. The banner CTA and close targets do not overlap.

Entrance uses only opacity and a small translation over 220ms, to connect the guide to its trigger; reduced-motion users get no animation. No backdrop blur, progress indicator, extra page transition or animated illustration is added.

Token gaps resolved: the repository has no shared surface/spacing scale for this feature. The new `--install-*` tokens match current application values and are defined together in index.css. No unresolved token gaps remain.
