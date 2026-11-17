# Installation guide visual and motion specification

The home banner uses a black surface at 30% opacity, white copy, a 48px app icon and a content-sized Add button. Add reuses Memory's Select All gradient pill component, with its original gradient, typography and 34px height. The 14px close icon sits in a 20px dark circle overlapping the top-right edge, within a 44px touch target. The guide retains noma's existing cream surface and dark text; its logo has a 3px white border and 20px corner radius. Both surfaces reuse CloseIcon.

The compact banner sits below the home header and above the character. The guide is a single-column bottom dialog with three icon/text rows. Primary action is dark, auxiliary text muted, and instructions remain readable on short screens by scrolling inside the sheet. Controls have at least 44px touch targets. The banner CTA and close targets do not overlap.

Entrance uses only opacity and a small translation over 220ms, to connect the guide to its trigger; reduced-motion users get no animation. No backdrop blur, progress indicator, extra page transition or animated illustration is added.

Token gaps resolved: the repository has no shared surface/spacing scale for this feature. The new `--install-*` tokens match current application values and are defined together in index.css. No unresolved token gaps remain.
