const PptxGenJS = require("pptxgenjs");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Estate Pro Team";
pptx.subject = "Estate Pro vs 99acres comparison";
pptx.title = "Estate Pro vs 99acres";
pptx.company = "Estate Pro";

const colors = {
  navy: "0B1F3A",
  blue: "1D4ED8",
  green: "166534",
  light: "F8FAFC",
  white: "FFFFFF",
  gray: "475569",
  border: "CBD5E1",
  softBlue: "DBEAFE",
  softGreen: "DCFCE7",
  softAmber: "FEF3C7",
};

function titleSlide(title, subtitle) {
  const s = pptx.addSlide();
  s.background = { color: colors.navy };
  s.addText(title, {
    x: 0.7, y: 1.5, w: 12, h: 1.1,
    fontSize: 38, bold: true, color: colors.white,
  });
  s.addText(subtitle, {
    x: 0.7, y: 2.8, w: 11.5, h: 1.2,
    fontSize: 20, color: "D1E3FF",
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 4.9, w: 5.4, h: 0.8,
    fill: { color: colors.blue }, line: { color: colors.blue }, radius: 0.08,
  });
  s.addText("Prepared for stakeholder pitch", {
    x: 1.0, y: 5.13, w: 5.0, h: 0.4,
    color: colors.white, fontSize: 16, bold: true,
  });
}

function sectionTitle(slide, title, subtitle) {
  slide.background = { color: colors.light };
  slide.addText(title, {
    x: 0.5, y: 0.25, w: 12.3, h: 0.55,
    fontSize: 30, bold: true, color: colors.navy,
  });
  slide.addText(subtitle, {
    x: 0.5, y: 0.88, w: 12.3, h: 0.4,
    fontSize: 14, color: colors.gray,
  });
}

function comparisonRow(slide, y, topic, estatePro, acres99) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y, w: 12.3, h: 0.78, radius: 0.04,
    fill: { color: colors.white }, line: { color: colors.border, pt: 1 },
  });
  slide.addText(topic, { x: 0.7, y: y + 0.2, w: 2.3, h: 0.35, fontSize: 14, bold: true, color: colors.navy });
  slide.addText(estatePro, { x: 3.1, y: y + 0.18, w: 4.3, h: 0.4, fontSize: 12, color: colors.green });
  slide.addText(acres99, { x: 7.8, y: y + 0.18, w: 4.7, h: 0.4, fontSize: 12, color: "7C2D12" });
}

titleSlide(
  "Estate Pro vs 99acres.com",
  "Key differences and why Estate Pro is the better product choice"
);

{
  const s = pptx.addSlide();
  sectionTitle(s, "Executive Takeaway", "Estate Pro is more workflow-driven and conversion-focused.");

  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.6, y: 1.5, w: 5.9, h: 4.8, radius: 0.08,
    fill: { color: colors.softGreen }, line: { color: "86EFAC" },
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: 6.8, y: 1.5, w: 5.9, h: 4.8, radius: 0.08,
    fill: { color: colors.softBlue }, line: { color: "93C5FD" },
  });

  s.addText("Estate Pro Advantage", {
    x: 0.9, y: 1.8, w: 5.3, h: 0.4, fontSize: 18, bold: true, color: colors.green,
  });
  s.addText(
    [
      { text: "• Built-in broker operations: listing CRUD + inquiry handling\n" },
      { text: "• Role-based UX (Admin / Employee / Broker / Buyer / Guest)\n" },
      { text: "• Integrated trust layer: verification queue + moderation controls\n" },
      { text: "• Faster go-to-market for managed premium inventory" },
    ],
    { x: 0.95, y: 2.3, w: 5.2, h: 3.5, fontSize: 15, color: "14532D" }
  );

  s.addText("99acres (Marketplace Strength)", {
    x: 7.1, y: 1.8, w: 5.3, h: 0.4, fontSize: 18, bold: true, color: colors.blue,
  });
  s.addText(
    [
      { text: "• Massive public listing volume and broad geography\n" },
      { text: "• Strong discovery for generic property search\n" },
      { text: "• Mature public brand for classifieds-style demand\n" },
      { text: "• Better for breadth, not tailored operating workflows" },
    ],
    { x: 7.15, y: 2.3, w: 5.2, h: 3.5, fontSize: 15, color: "1E3A8A" }
  );
}

{
  const s = pptx.addSlide();
  sectionTitle(s, "Feature-by-Feature Comparison", "Where Estate Pro differentiates at product level.");

  s.addText("Capability", { x: 0.7, y: 1.35, w: 2.4, h: 0.3, fontSize: 12, bold: true, color: colors.gray });
  s.addText("Estate Pro", { x: 3.1, y: 1.35, w: 4.2, h: 0.3, fontSize: 12, bold: true, color: colors.gray });
  s.addText("99acres.com", { x: 7.8, y: 1.35, w: 4.5, h: 0.3, fontSize: 12, bold: true, color: colors.gray });

  comparisonRow(s, 1.65, "User Roles", "Native role-based access and route controls", "Primarily consumer marketplace behavior");
  comparisonRow(s, 2.55, "Broker Ops", "Built-in listing manager + inquiries workflow", "Often requires external CRM for advanced workflows");
  comparisonRow(s, 3.45, "Admin Control", "Verification queue + moderation controls in platform", "Trust tools exist, but less workflow-custom for your team");
  comparisonRow(s, 4.35, "Experience", "Focused, premium UX for high-value deals", "High-volume discovery UX for broad audiences");
  comparisonRow(s, 5.25, "Positioning", "Conversion-ready managed platform", "Large listing marketplace at scale");
}

{
  const s = pptx.addSlide();
  sectionTitle(s, "Why Estate Pro Wins for Business Outcomes", "Benefits tied to revenue and operational efficiency.");

  const points = [
    "Shorter lead response cycle with integrated inquiry handling",
    "Higher broker productivity via in-app listing and pipeline actions",
    "Cleaner supply quality using verification and moderation checkpoints",
    "Better conversion potential in premium/luxury and curated segments",
    "Greater control over product roadmap vs dependence on marketplace rules",
  ];

  points.forEach((p, i) => {
    const y = 1.6 + i * 0.85;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.8, y, w: 11.8, h: 0.62, radius: 0.05,
      fill: { color: i % 2 ? "EFF6FF" : colors.white },
      line: { color: colors.border, pt: 1 },
    });
    s.addText(`${i + 1}`, {
      x: 1.05, y: y + 0.14, w: 0.35, h: 0.3, fontSize: 16, bold: true, color: colors.blue,
    });
    s.addText(p, {
      x: 1.55, y: y + 0.14, w: 10.8, h: 0.35, fontSize: 15, color: colors.navy,
    });
  });
}

{
  const s = pptx.addSlide();
  sectionTitle(s, "Proof from Current Estate Pro Build", "Implemented modules already support this positioning.");

  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 1.45, w: 12.0, h: 4.8, radius: 0.07,
    fill: { color: colors.white }, line: { color: colors.border },
  });

  s.addText(
    [
      { text: "• Auth & route guard by role: " },
      { text: "Admin, Employee, Broker, Buyer, Guest\n", options: { bold: true } },
      { text: "• Broker dashboard: " },
      { text: "add/edit/delete listings + inquiry center\n", options: { bold: true } },
      { text: "• Admin dashboard: " },
      { text: "verification queue + user management + moderation controls\n", options: { bold: true } },
      { text: "• Buyer journey: " },
      { text: "map-led property discovery + search filters\n", options: { bold: true } },
      { text: "• Integrated UX direction: " },
      { text: "premium, high-intent transaction flow", options: { bold: true } },
    ],
    { x: 1.0, y: 1.9, w: 11.3, h: 3.8, fontSize: 17, color: colors.navy, breakLine: true }
  );
}

{
  const s = pptx.addSlide();
  sectionTitle(s, "Positioning Statement for Pitch", "Use this message with investors, partners, and clients.");

  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.9, y: 1.75, w: 11.3, h: 2.2, radius: 0.08,
    fill: { color: colors.softAmber }, line: { color: "FCD34D" },
  });
  s.addText(
    "\"99acres is a broad marketplace. Estate Pro is a managed, role-driven real estate platform built to convert high-intent demand into faster, higher-quality transactions.\"",
    {
      x: 1.2, y: 2.25, w: 10.7, h: 1.4,
      fontSize: 22, bold: true, italic: true, color: "78350F", align: "center",
    }
  );

  s.addText("Go-to-market recommendation:", {
    x: 1.0, y: 4.45, w: 4.0, h: 0.3, fontSize: 14, bold: true, color: colors.gray,
  });
  s.addText(
    "Lead with curated premium inventory, broker productivity, and trust workflows as your primary differentiators.",
    { x: 1.0, y: 4.78, w: 11.0, h: 0.7, fontSize: 14, color: colors.navy }
  );
}

{
  const s = pptx.addSlide();
  s.background = { color: colors.navy };
  s.addText("Thank You", {
    x: 0.8, y: 1.7, w: 4.2, h: 0.8, fontSize: 44, bold: true, color: colors.white,
  });
  s.addText("Estate Pro is ready for focused, high-conversion growth.", {
    x: 0.8, y: 2.8, w: 10.8, h: 0.6, fontSize: 20, color: "BFDBFE",
  });
  s.addText("Source note: 99acres points are based on publicly advertised features and general market positioning.", {
    x: 0.8, y: 6.6, w: 11.8, h: 0.3, fontSize: 11, color: "94A3B8",
  });
}

pptx.writeFile({ fileName: "EstatePro-vs-99acres.pptx" });
