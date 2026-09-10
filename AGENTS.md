# Rock Lab development

- Every parameter label needs a tooltip that explains what it changes and, where useful, what lower and higher values do. Add the explanation to `src/tooltips.js` when adding a control.
- Tooltips belong on parameter labels. Do not add native `title` attributes or custom tooltips to action buttons, cards, or tabs.
- Preserve keyboard and touch access, label/control associations, and existing validation descriptions. Check the menus and tooltips at desktop and narrow widths.
- File actions belong in the header's File menu. Preserve recipe compatibility when adding settings.
- Run `npm run verify`, `npm run verify:fracture`, and `npm run build` for geometry/material changes. UI changes need the relevant browser QA and visual inspection.
- Public builds must exclude `public/audio/private/` and local reference art. Keep private assets, credentials, local histories, and QA artifacts out of Git. Use the synthesized public sound bank by default.
