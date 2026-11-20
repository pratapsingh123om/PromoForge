# PromoForge Design Principles

PromoForge should feel like a focused editorial studio: cinematic, intelligent, trustworthy, and calm. Every screen should help an editor make the next decision quickly.

## 1. Design Direction

- Use a dark, cinematic workspace with restrained color.
- Prefer clarity over decoration and confidence over visual noise.
- Let promo imagery and editorial evidence carry the emotion.
- Make the product feel specialized for storytelling, not like a generic AI dashboard.

## 2. Attention and Hierarchy

Every page should have one obvious reading order:

1. Page purpose
2. Primary action
3. Main working content
4. Supporting evidence and metadata

- Use one dominant call to action per page.
- Reserve bright orange for the current action, active state, or most important signal.
- Avoid giving several controls equal visual emphasis.
- Keep headings concise and benefit-oriented.
- Use whitespace to separate decisions, not to create empty decoration.

## 3. Core Workflow

The product should reinforce this sequence:

`Projects → Discover → Edit → Campaign → Export`

- Narrative Explorer and Evaluation support the workflow as analysis tools.
- Navigation labels should describe tasks in the user's language.
- Always make the next useful action easy to find.
- Preserve context when moving between projects, promos, and campaigns.

## 4. Typography

- Page title: 28–32 px, bold, with tight line height.
- Section title: 16–20 px, semibold.
- Body text: at least 13 px on desktop and 14 px on mobile.
- Metadata and labels: at least 11 px.
- Avoid 7–10 px text except for nonessential decorative marks.
- Use short lines and plain language; avoid dense paragraphs.

## 5. Color and Contrast

- Background: near-black, not pure black.
- Panels: slightly lighter than the page background.
- Primary text: warm white.
- Secondary text must maintain at least 4.5:1 contrast.
- Orange: primary actions and active editorial states.
- Green: success and approved states.
- Red: destructive actions, errors, and high risk.
- Purple: narrative or model-related information.
- Never communicate status through color alone; include text or an icon.

## 6. Layout and Components

- Use consistent panel borders, spacing, and corner radii.
- Keep primary content above the fold when practical.
- Prefer progressive disclosure over displaying every detail at once.
- Cards should contain only information needed to compare or act.
- Buttons should clearly distinguish primary, secondary, and destructive actions.
- Use a minimum interactive height of 40 px on desktop and 44 px on touch devices.

## 7. Editorial Intelligence

- Never present an AI score without context.
- Explain why a promo scored highly and show the supporting evidence.
- Display confidence, spoiler risk, and uncertainty where relevant.
- Separate measured data from model estimates.
- Use honest states such as “Awaiting data” instead of fabricated metrics.

## 8. Interaction and Feedback

- Every action should produce immediate visible feedback.
- Use loading, success, empty, and error states consistently.
- Provide undo for approvals, rejections, removals, and other consequential decisions.
- Keep the user's work when navigating between pages.
- Disable unavailable actions and explain what is required to enable them.
- Motion should be subtle, fast, and functional.

## 9. Accessibility

- All functionality must work with a keyboard.
- Every interactive element needs a visible focus state and accessible name.
- Maintain WCAG AA contrast for text and controls.
- Use semantic headings, landmarks, labels, and table structure.
- Respect reduced-motion preferences.
- Do not rely only on hover, color, or icons to communicate meaning.

## 10. Responsive Design

- Design desktop and mobile intentionally; do not simply stack desktop panels.
- Keep the mobile header compact and the navigation dismissible.
- Move complex filtering into a drawer or compact control when space is limited.
- Prevent horizontal page scrolling; allow it only inside data-heavy components.
- Prioritize the primary action and current content on small screens.

## 11. Content Style

- Be direct, specific, and editorial rather than promotional.
- Prefer “Approve cut” over vague labels such as “Continue.”
- Explain technical terms when they affect a decision.
- Clearly label fictional, estimated, or incomplete data.
- Error messages should state what happened and what the user can do next.

## 12. Screen Priorities

- **Discover:** make comparison, evidence, and shortlisting effortless.
- **Promo Studio:** keep the preview central and the decision controls visible.
- **Narrative Explorer:** favor legibility and relationships over graph complexity.
- **Campaign Lab:** show selection, strategy, and generation status clearly.
- **Exports:** communicate readiness, format, and destination before download.
- **Evaluation:** distinguish quality signals from failures that need action.

## Definition of Done

Before a frontend change is complete, verify:

- The page has one clear primary action.
- Body and metadata text meet the minimum sizes.
- Text and controls meet contrast requirements.
- Keyboard focus and accessible labels are present.
- Loading, empty, error, and success states are covered.
- The layout works at desktop, tablet, and 390 px mobile width.
- Important actions provide confirmation or undo.
- AI-generated values include evidence or an explanation.

