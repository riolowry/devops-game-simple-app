# Sprint 3: DevOps

CI/CD bypass is on. Containers are now a thing. Roles swap.

## What changed at the boundary

- Devaluation: every non-accepted card from Sprint 1 or 2 has its price halved (compounding for Sprint-1 cards, which are now at 25% of original).
- **Role swap** (default on): every Tester becomes Developer; every Security becomes SysAdmin. Their `hacker_previous_role` is preserved (so demote still works).
- Code freezes auto-clear.
- Sprint-3 curated URLs unlock (aliens, unicorns).

## What's new

- **Containerized tasks** are available. When a Developer adds a task, they can mark it containerized. The whole card becomes containerized.
- **CI/CD bypass** (default on): a containerized card, on **Send to Testing**, is shipped directly to **In Production**. It skips Tester, Security, and SysAdmin entirely.
- **Stop Container**: Hackers can stop containerized cards in Production. The card persists but is marked stopped.
- **Restart Container**: SysAdmin restores it.

## Goals

- Force the trade-off: speed vs. quality. Containerization is faster but skips the gates.
- Test the team's response to a fundamental rule change. After two sprints of pipelining, half the steps are gone for some cards.
- Surface the SysAdmin role's importance. Stops happen. Restarts matter.

## Watch for

- **Everything containerized**: if Developers default to containers, Tester and Security have no work. Note this for the retrospective. The point is the trade-off, not "always containerize."
- **Acceptance Criteria neglect**: with no Tester or Security review, Business is the only check on container cards. Are they actually inspecting?
- **Hacker container-stop spree**: a single hacker can stop several containers. SysAdmin needs to be alert.
- **Role-swap confusion**: ex-Testers now have Developer powers but no team assignment automatically. They may need to be claimed onto a team via the admin Users tab.

## Variations

- Set CI/CD bypass off in admin Settings to keep the standard pipeline through Sprint 3. Containers then just become a marketing label with no behavioral effect.
- Set role swap off to keep specialists in their lanes.
- Set the random flaw rate to 0 to isolate hacker injections as the only defects.
