# AhaKudos V28.61 — Google Sheet DATA as Master Data

## Source of truth
Google Sheet: **AhaKudos V28 — Vercel Test**
Spreadsheet ID: `131PBqAbeNPRGVrmqVs7i-vQ0IL8yo2zRULPVvQBr7RY`
Master tab: `DATA`

## DATA mapping currently supported
| Google Sheet column | AhaKudos field |
| --- | --- |
| Work Email | email |
| Full Name | name |
| Department | department |
| Section | section |
| Onboard Day | join date |
| Tenure (Days) | tenure days |
| Employee ID | employee id |
| Location | location |
| Job Title | job title |
| Level | level |

Optional birthday headers supported when added later: `Date of Birth`, `DOB`, `Birthday`, or `DATE_OF_BIRTH`.

> Current DATA tab does **not** contain a birthday column, so birthday suggestions will stay empty until one of the supported birthday columns is added.

## Deploy Apps Script
1. Open the Apps Script project used by the AhaKudos V28 backend.
2. Replace the current `Code.gs` with `Code.gs` in this folder.
3. Keep the existing HMAC bridge secret / Vercel origin configuration.
4. Run `khoiTao()` once with the authorized company account.
5. Ensure the Vercel bridge is enabled with the existing `batCauNoiVercel()` flow if it is currently disabled.
6. Create a **new Apps Script deployment version** and keep the `/exec` URL configured in Vercel as `GAS_EXEC_URL`.
7. Redeploy the Vercel package supplied with V28.61.

The Vercel app still reads all people through `layTrangThai()`. The change is server-side: `layTrangThai()` now uses the live `DATA` tab as the primary people source instead of the V27 sample roster / MASTER_DATA tab.
