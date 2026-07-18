export const metadata = { title: "Accessibility — Prometheon Engine" };

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.75, margin: "0 0 1rem" }}>
      {children}
    </p>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", margin: "1.75rem 0 0.6rem" }}>
      {children}
    </h2>
  );
}

export default function AccessibilityPage() {
  return (
    <div style={{ maxWidth: 720, paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
        Accessibility Statement
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right,var(--accent-gold),transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.5rem" }} />

      <P>
        Prometheon Engine is committed to making its research tools usable by as many people as
        possible, including people who rely on assistive technology. We aim to conform to the
        Web Content Accessibility Guidelines (WCAG) 2.1, Level AA.
      </P>

      <H2>What we do</H2>
      <P>
        The site supports keyboard navigation, uses semantic HTML with ARIA labels on interactive
        controls, offers both light and dark themes, and validates chart color palettes for
        color-vision deficiency (protan, deutan, and tritan) and contrast against their background.
        Charts additionally label every series in legends and tooltips, so color is never the only
        way information is conveyed.
      </P>

      <H2>Accessibility options</H2>
      <P>
        The accessibility button in the bottom-right corner of every page (or Ctrl+U) opens a
        menu with options to increase text size (two levels), raise text and border contrast,
        highlight links, widen text spacing, increase line height, pause animations, hide images,
        switch to a dyslexia-friendlier font, enlarge the cursor, and desaturate colors.
        Preferences are saved in your browser and persist between visits.
      </P>

      <H2>Known limitations</H2>
      <P>
        Some embedded third-party content — such as TradingView charts — is rendered inside an
        iframe we do not control, and may not fully conform to WCAG. Where possible, a built-in
        alternative chart is offered alongside the embed.
      </P>

      <H2>Feedback</H2>
      <P>
        If you encounter an accessibility barrier on this site, please email{" "}
        <a href="mailto:matthanasab@gmail.com" style={{ color: "var(--accent-gold)" }}>
          matthanasab@gmail.com
        </a>{" "}
        and we will do our best to address it promptly.
      </P>

      <P>This statement was last reviewed on July 17, 2026.</P>
    </div>
  );
}
