# Sprint 2: Threat

A Hacker is among the Developers. Cross-training is now active.

## What changed at the boundary

- One or more participants are promoted to Hacker. The UI still shows them as Developer.
- Cross-training assigned: each Developer, Tester, Security, and SysAdmin gets a secondary role on their own team via deterministic round-robin (Developer 1 → Tester, Developer 2 → Security, Developer 3 → SysAdmin, repeating).
- Devaluation: every non-accepted Sprint-1 card has its price halved.
- Code freezes auto-clear.
- Sprint-2 curated URLs unlock (cars, boats).

## What's new

- **Inject Flaw** appears for the Hacker on cards in In Progress, Testing, Security, or To Deploy that aren't already containerized or already injected.
- **Shift-left security check** appears for Developer or Tester on their own team's pipeline cards. Advisory; same flaw-detection logic as Security's check.
- The cross-training banner appears in the header for affected users.

## Goals

- Test the team's communication under uncertainty. Can the Tester explain why they rejected? Can the Developer pick up the comment and fix it?
- Get a baseline catch rate for Security. The hacker_log on the admin tab tracks caught vs. leaked.
- See whether cross-training matters. Do Developers actually run shift-left? Does the Tester help the SysAdmin clear a backlog?

## Watch for

- **Hacker over-injection**: if a hacker injects on every card, Security will catch most. The teaching moment is timing.
- **Security paranoia**: they may reject everything as a defense. Random flaw rate plus injection still leaves clean cards.
- **Cross-training ignored**: many participants miss the banner. Point it out at the sprint kickoff.
- **Stale Clarifications**: a card sent to Clarifications targeted to Team A's developer can't be picked up by Team B. If a dev quits or steps away, you may need to re-target it manually via the database.
