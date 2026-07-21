# Frontend Design Notes

Use the bundled workbench as a dense production console, not a marketing page.

- Keep the five-step workflow visible at the top: image generation, action animation, timing, GIF generation, and scale tuning.
- Keep each module split into a left control rail and a right production canvas/status area.
- Align module window tabs with the page title/content start. Do not float tabs into the previous section.
- Use compact controls: icon buttons for actions, toggles for binary options, selects for stage/species, sliders for scale/timing values.
- Do not nest cards inside cards. Use cards only for repeated assets, logs, and operation panels.
- GIF generation must show stage inventory counts and runtime logs after every run, including failed snapshot syncs.
- New species setup must be interactive: detect missing species, ask for code/name/status/legendary/sort/description, then write database or snapshot scaffolding after confirmation.
- Qiniu upload must expose the API key field when CDN upload is enabled. Do not hardcode a real key in published source.
