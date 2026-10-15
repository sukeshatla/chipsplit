# Feature PDF source

Builds [`docs/Chip-n-Split-Features.pdf`](../Chip-n-Split-Features.pdf), the overview shared with new users.

| File | What it is |
|---|---|
| `features.html` | The whole PDF: text, layout, print styles (US Letter). Edit this to change wording. |
| `capture.mjs` | Takes the app screenshots and share pictures into `shots/` from demo mode. |
| `lb.mjs` | Takes the poker leaderboard screenshot. |
| `build.sh` | Starts the dev server and headless Chrome, runs both captures, prints the PDF into `docs/`. |
| `shots/` | Screenshots the PDF uses. |

## Rebuild

```bash
docs/feature-pdf/build.sh
```

Needs Google Chrome (set `CHROME=` to its binary if it isn't in `/Applications`) and Node 22+
(the capture scripts use the built-in `WebSocket`). Look over the changed pages, then commit the
PDF together with any changed `shots/` and `features.html`.

## Not captured automatically

- `shots/login.png` and `shots/google.png` (Security page): the sign-in screen and Google's own
  page. Take them by hand on a phone-sized window (390 × 844 at 2×) if they need to change.
- The home-screen icon on the Install page comes straight from `public/icon.svg`.
