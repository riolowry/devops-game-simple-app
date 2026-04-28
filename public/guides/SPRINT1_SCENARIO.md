# Sprint 1: Build

The straightforward sprint. Business writes Product Requests against curated drawings. Developers claim from Market, color and upload, and ship through Testing, Security, To Deploy, In Production, Accepted.

## What's available

- All 9 Sprint-1 curated URLs (3 dogs, 3 cats, 3 birds).
- All roles active except Hacker. Random flaws still happen at the configured rate (default 25%), so Security has work even without injections.
- No Code Freeze toggle until cards reach the pipeline.
- No cross-training yet.

## Goals

- Get the team comfortable with the board, the columns, the modal, and the comment system.
- Establish a baseline cadence: how long does a Sprint-1 card take from Market to Accepted?
- Surface mechanical issues (image uploads, browser sync) before stakes go up.

## Watch for

- **Confused Tester**: the role often expects to read the description AND the Acceptance Criteria. Acceptance Criteria is for Business at the end. Tester only checks deliverables vs. description.
- **Security idle**: yes, by design. Random flaws will give them some catches.
- **Premature Acceptance**: Business sometimes accepts on auto-pilot. Reject something to set the bar.
- **Batch confusion**: a card with batch_size 4 needs 4 completed tasks before Send to Testing.
