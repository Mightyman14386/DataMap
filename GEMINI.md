## What this application is

DataMap: The Technical Blueprint
To build this in a hackathon timeframe, you should focus on a Web Dashboard that uses Google/Microsoft OAuth to scan headers, rather than a browser extension. Why? Because browser history is often cleared or inconsistent, but your "Welcome" emails from 2019 are still sitting in your inbox.
1. The "Discovery" Engine (Finding the Accounts)
Instead of reading every email (which is slow and a privacy risk), your script only scans Sender Metadata and Subject Lines.
The Logic: Search for keywords like "Welcome," "Verify your email," "Subscription confirmed," or "Your new account."
The Tech: Use the Gmail API with the q (query) parameter to filter for these keywords. This allows you to build a list of 50+ services in seconds.
2. The "Risk Scorer" (AI Policy Analysis)
Once you have a list (e.g., TikTok, Zoom, Canva), you don't need to scrape their sites live.
The Hack: Use a pre-indexed database of privacy policies or a fast LLM prompt.
The Prompt: "Analyze the 2026 Privacy Policy for [Service Name]. Rate 1-10 on: 1. Data selling, 2. AI training use, 3. Difficulty to delete. Provide a 2-sentence summary."
3. The "Breach Cross-Check"
The Integration: Use the HaveIBeenPwned (HIBP) API.
The Action: For every account found in step 1, check if that specific domain was part of a known breach. If you find a "LinkedIn" account and HIBP says LinkedIn was breached in 2021, that account gets a Red Alert.
📊 The "DataMap" User Journey
The Dashboard Layout:
The Map: A visual "web" showing your central email connected to dozens of nodes (services).
Risk Quadrants:
Red (Critical): High-risk policy + Known breach + Not used in 2+ years.
Yellow (Warning): Moderate risk (e.g., uses data for AI training).
Green (Safe): Strong encryption, no breaches, frequent use.
The "Kill Switch" List: A prioritized list of "Delete these first" with direct links to their specific /settings/delete pages.

## Design
Please adhere strictly to the following design system and aesthetic rules using Tailwind CSS and custom CSS where necessary:

1. Global Aesthetic & Vibe

Style: High-tech, futuristic, HUD (Heads Up Display), dark mode exclusive.

Feel: Elite, analytical, secure, cyberpunk but clean and professional.

Background: Use a base background of #0A0E17. Implement a seamless, infinitely scrolling animated grid background (40px by 40px cells using linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px) and vertical equivalent, animating from 0px 0px to 40px 40px over 20 seconds).

2. Color Palette (Strict)

App Background: Deep Obsidian (#0A0E17).

Panel/Card Background: Translucent Charcoal (rgba(17, 24, 39, 0.75)) with an 8px backdrop blur (Glassmorphism).

Borders & Dividers: Subdued Gray-Blue (#1E293B).

Primary Accent (Interactive/Safe/Cyan): Cyber Blue (#00F0FF). Use for hover states, primary data points, and active tabs.

Success Accent: Matrix Green (#00FF41).

Warning Accent: Caution Yellow (#FFB000).

Critical/Alert Accent: Threat Red (#FF003C).

Primary Text: Ice White (#E2E8F0).

Secondary/Muted Text & Labels: Steel Gray (#94A3B8).

3. Typography

Headers, Titles, & Nav: Space Grotesk (bold, tracking-wider).

Body/General UI: Inter (clean, readable).

Data, Logs, Status, & Timestamps: Fira Code (monospace, uppercase for labels).

4. UI Components & Styling

Glass Panels (Cards): All main content containers should be glass panels with a 1px solid border (#1E293B) and a heavy shadow (box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5)).

HUD Corners: Apply decorative 8x8px border accents to the top-left and bottom-right corners of primary panels using the Primary Accent color (#00F0FF).

Buttons & Interactivity: Use dark backgrounds with thin borders. On hover, transition the border to #00F0FF, change text to #00F0FF, add a #00F0FF inner glow/tint (rgba(0, 240, 255, 0.1)), and an outer box shadow glow (0 0 15px rgba(0, 240, 255, 0.3)).

Status Tags: Use a semi-transparent background of the accent color (e.g., 10% opacity Red) with a solid border and text of the same accent color.

Icons: Use monoline, minimalist icons (like Lucide React). Add drop shadows (e.g., drop-shadow-[0_0_5px_#00F0FF]) to active or important icons.

5. Animations & Micro-Interactions

Include "pulse" animations for active status dots (a ring expanding and fading out).

Make data feel "live" (e.g., scrolling logs, animated progress bars with glow effects).