export interface SamplePlan {
  id: "starter" | "team" | "studio";
  name: string;
  price: string;
  body: string;
}

export const SAMPLE_PLANS: readonly SamplePlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$0",
    body: "One site, unlimited pins, and comments saved in your browser.",
  },
  {
    id: "team",
    name: "Team",
    price: "$12",
    body: "Shared folders, review links for clients, and a weekly digest.",
  },
  {
    id: "studio",
    name: "Studio",
    price: "$29",
    body: "Everything in Team, plus custom branding on review links.",
  },
];

export const SAMPLE_VALUES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Clear feedback",
    body: "Every comment points at one thing and says what should change.",
  },
  {
    title: "Fewer meetings",
    body: "Reviews happen on the page itself, whenever people have a moment.",
  },
  {
    title: "Done means done",
    body: "Resolved comments stay on record, so nothing is asked for twice.",
  },
];

export const SAMPLE_FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "What is this page?",
    answer:
      "A sample page to try reviewing on. Add it to Squint as a website project, or open it with a review token to use the pinpoint widget.",
  },
  {
    question: "Are these prices real?",
    answer: "No. The plans are placeholder content so there is something to comment on.",
  },
  {
    question: "Where do comments go?",
    answer:
      "Squint keeps comments in this browser. The pinpoint widget sends them to the server configured for this deployment.",
  },
];
