<!--
  Thanks for contributing! Please fill out the sections below.
  See CONTRIBUTING.md for setup, coding standards, and how to test native
  changes on a device (the only test that matters for a background-location lib).
-->

## Description

<!-- What does this PR do, and why? Link any related issue, e.g. "Closes #123". -->

## Type of change

<!-- Check all that apply. -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that changes existing behavior or the public API)
- [ ] Documentation only
- [ ] Build / CI / tooling
- [ ] Refactor (no functional change)

## Platforms affected

- [ ] Android (Kotlin)
- [ ] iOS (Swift)
- [ ] Config plugin
- [ ] JS / TypeScript API
- [ ] Docs only

## Platform tested

<!-- Background location MUST be verified on a physical device. List what you ran. -->

- [ ] Tested on a physical **Android** device (model + OS version: ___ )
- [ ] Tested on a physical **iOS** device (model + OS version: ___ )
- [ ] Verified the relevant kill/background scenario (swipe-to-kill / force-quit / reboot), if applicable
- [ ] N/A (docs / tooling only)

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm run build` passes (builds **src** and the config **plugin**)
- [ ] The native ⇄ JS contract is in sync (function/event names + `LocationFix` keys match across `src/`, Android, and iOS) — if I changed it
- [ ] Tested on a real device for the affected platform(s)
- [ ] Documentation updated (README / JSDoc / type docs) — if behavior or API changed
- [ ] Changelog entry added — if user-facing
- [ ] My changes respect the project's honest scope (no claims of continuous iOS-after-force-quit or guaranteed OEM-killer survival)

## Additional notes

<!-- Anything reviewers should know: trade-offs, follow-ups, screenshots, logs. -->
