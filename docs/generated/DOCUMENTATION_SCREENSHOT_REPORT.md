# Documentation screenshot report

| | |
|---|---|
| Screenshots planned | **20** |
| Captured | **0** |
| Applied to articles | **0** |
| Referenced by articles | 20 |
| Missing | **20** |
| Desktop | 0 |
| Mobile | 0 |
| Privacy reviewed | 0 |

## Why nothing is captured

Capture needs an authenticated browser session per role. Blocked on tooling,
not on permission:

- The Claude Chrome extension is not connected.
- Neither Playwright nor Puppeteer is installed, and adding a ~300 MB browser
  dependency to the project was not something to do unasked.

## Role availability

| Role | Credential | Capturable |
|---|---|---|
| Management | ABC Academi test account | **Yes**, once a browser is connected |
| Admin | none | ROLE UNAVAILABLE |
| Coordinator | none | ROLE UNAVAILABLE |
| Teacher | none | ROLE UNAVAILABLE |
| Parent | none | ROLE UNAVAILABLE |
| Platform Admin | none | ROLE UNAVAILABLE |

## Which tenant to capture from

**ABC Academi, not ARK.** ABC holds only `PHASE8A-TEST` records, so no real
child’s name, phone number or fee history can reach an image committed to the
repository. ARK has 134 real students; capturing from it would put their data
into the repo. That constraint stands regardless of access.

## Enforcement

Five gate assertions now cover screenshot provenance:

- a file on disk must be marked `capturedFromRealApp: true` — FAILURE otherwise
- a file on disk must be marked `privacyReviewed: true` — FAILURE otherwise
- `capturedFromRealApp: true` with no file — FAILURE
- a screenshot route not found in the inventory — FAILURE
- screenshots not yet captured — **warning only**

An unattested image cannot be published. That is what makes “no fabricated
screenshots” checkable rather than merely promised.
