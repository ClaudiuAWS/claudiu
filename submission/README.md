# Submission package — Brezn / Fan Squad

This folder contains the deliverables for the AWS World Sports Innovation Cup 2026 (Fan Squad challenge).

## Required items (per the brief)

| File | Status | Notes |
|---|---|---|
| `github_link.txt` | ✅ Ready | Repo URL only, no hackathon data committed |
| `presentation_video.mp4` | ⏳ TODO | Max 3 min, < 720p. Record screen + voiceover. |
| `executive_summary.pdf` | ⏳ Convert | Source: `executive_summary.md` — 5 slides max |
| `prfaq.pdf` | ⏳ Convert | Source: `prfaq.md` — optional but high-impact |

## Steps to package

1. **Decide team name.** The zip MUST be named `<TeamName>.zip`.
2. **Record the demo video.**
   - 3 min max, < 720p resolution
   - Show: signup → invite a friend → draft → live match → halftime quiz → match-end celebration
   - Tools: OBS Studio (free), QuickTime (Mac), or Loom (browser)
   - Save as `presentation_video.mp4`
3. **Convert the markdown drafts to PDFs.**
   - `executive_summary.md` → open in PowerPoint or Google Slides (one `##` = one slide) → export as `executive_summary.pdf`
   - `prfaq.md` → open in any markdown-to-PDF tool (VS Code "Markdown PDF" extension, Pandoc, or paste into Google Docs → File → Download → PDF) → save as `prfaq.pdf`
4. **Update placeholders in the docs:**
   - Team name in `executive_summary.md` and `prfaq.md` (search for `(team name)` and `(presenter name)`)
   - Live URL in `prfaq.md` (search for `(CloudFront URL)`)
   - GitHub URL in `prfaq.md` (already filled — verify it's correct)
5. **If repo is private, invite `MoellerO` to the GitHub repo** (per the brief).
6. **Zip everything:**
   ```
   <TeamName>/
     github_link.txt
     presentation_video.mp4
     executive_summary.pdf
     prfaq.pdf
   ```
   Save as `<TeamName>.zip`. Keep total size small.
7. **Submit via the Box file request link** provided in the brief.

## Brief reminders

- **Do NOT upload any hackathon data** (player stats, the XML match feed, etc.) to the GitHub repo. We don't commit any of that today — `frontend/public/players.json` is the only player data and it was loaded from the public XML feed at app build time.
- **README must have clear execute instructions** so judges can reproduce. See the root `README.md` "Quick Start" section.
- If you need to resubmit, use the same team name with a version suffix (e.g., `<TeamName>_v2.zip`).
- Avoid resubmitting many times.

## Reach for help

Discord: https://discord.gg/EBYZNDbwzp
