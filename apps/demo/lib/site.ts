import type { IconName } from "@/components/ui/Icon";

export const SITE = {
  name: "pinpoint",
  tagline: "Visual feedback for preview deployments",
  repoUrl: "https://github.com/pinpoint-dev/pinpoint",
} as const;

export const NAV_SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
] as const;

export interface Step {
  icon: IconName;
  title: string;
  body: string;
}

export const STEPS: readonly Step[] = [
  {
    icon: "link",
    title: "Share the preview",
    body: "Send reviewers the review link: your preview URL with the review token added. No accounts, no browser extension, nothing to install.",
  },
  {
    icon: "pointer",
    title: "Click anything",
    body: "Comment mode outlines the element under the cursor. One click drops a numbered pin anchored to that element.",
  },
  {
    icon: "pullRequest",
    title: "It lands in the PR",
    body: "Each pin becomes one comment on the pull request, with a screenshot and a link straight back to the spot. Replies and resolves update that same comment.",
  },
];

export interface Feature {
  icon: IconName;
  title: string;
  body: string;
}

export const FEATURES: readonly Feature[] = [
  {
    icon: "anchor",
    title: "Anchored to elements",
    body: "Each pin stores a robust CSS selector plus its offset inside the element, so it survives scrolling, resizing and redeploys.",
  },
  {
    icon: "layers",
    title: "Shadow DOM isolation",
    body: "The overlay lives in a shadow root on a fixed layer. Shadow DOM keeps the page's styles out of the widget and the widget's styles out of the page.",
  },
  {
    icon: "camera",
    title: "Screenshots with the pin marked",
    body: "Each comment captures the visible viewport with the pin marked. Capture is best-effort, and with GitHub storage the image is committed to an orphan branch in your repository.",
  },
  {
    icon: "keyboard",
    title: "Keyboard and touch ready",
    body: "Tab or arrow keys pick an element and Enter pins it. On phones, a tap is all it takes.",
  },
  {
    icon: "database",
    title: "Your storage",
    body: "GitHub by default. Postgres when you want a database, with an optional one-way mirror to GitHub.",
  },
  {
    icon: "shield",
    title: "Silent without a token",
    body: "Without a valid review token the widget renders nothing and makes zero network requests.",
  },
];

export type Billing = "monthly" | "yearly";

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: Record<Billing, string>;
  cadence: Record<Billing, string>;
  features: readonly string[];
  cta: string;
  href: string;
  external?: boolean;
  featured?: boolean;
}

/** Anchor of the contact block in the site footer. */
export const CONTACT_ID = "contact";
export const CONTACT_EMAIL = "hello@pinpoint.example";

export const PLANS: readonly Plan[] = [
  {
    id: "self-hosted",
    name: "Self-hosted",
    description: "Everything in the open source package, on your own Vercel project.",
    price: { monthly: "$0", yearly: "$0" },
    cadence: { monthly: "forever", yearly: "forever" },
    features: ["Unlimited pins and reviewers", "GitHub or Postgres storage", "MIT licensed"],
    cta: "Deploy it",
    href: `${SITE.repoUrl}#quick-start`,
    external: true,
  },
  {
    id: "team",
    name: "Team",
    description: "For agencies running many client previews at once.",
    price: { monthly: "$12", yearly: "$10" },
    cadence: { monthly: "per project / month", yearly: "per project / month, billed yearly" },
    features: [
      "Everything in Self-hosted",
      "Shared review dashboard",
      "Slack and Linear notifications",
      "Priority support",
    ],
    cta: "Start a trial",
    href: `#${CONTACT_ID}`,
    featured: true,
  },
  {
    id: "organization",
    name: "Organization",
    description: "Single sign-on, audit logs and a support agreement.",
    price: { monthly: "Custom", yearly: "Custom" },
    cadence: { monthly: "talk to us", yearly: "talk to us" },
    features: ["Everything in Team", "SAML single sign-on", "Audit log export", "Uptime SLA"],
    cta: "Contact sales",
    href: `#${CONTACT_ID}`,
  },
];

export interface Faq {
  question: string;
  answer: string;
}

export const FAQS: readonly Faq[] = [
  {
    question: "Do reviewers need a GitHub account?",
    answer:
      "No. Anyone with the review link can leave pins. With GitHub storage (or the Postgres GitHub mirror) configured, comments are posted to GitHub under the account of the token you configure, with the reviewer's name in the comment body.",
  },
  {
    question: "What happens when the page changes after a pin is left?",
    answer:
      "Pins re-resolve their selector on every load, resize and DOM change. If the element is gone, the pin falls back to its original screen position and is marked as changed.",
  },
  {
    question: "Is the review token safe to share?",
    answer:
      "It gates the API, not the page. Anyone who can open the preview and has the token can comment, so keep previews behind Vercel Deployment Protection for private work.",
  },
  {
    question: "Does it slow down production?",
    answer:
      "No. Outside previews, visitors only get a tiny provider shell inside your normal bundle. It does no token check, touches no storage and makes no network calls. The overlay is a separate chunk of about 16 KB gzipped that downloads only on a preview with a review token, and html-to-image downloads only when a reviewer posts their first comment.",
  },
];
