import { ButtonLink } from "@/components/ui/ButtonLink";

export default function NotFound() {
  return (
    <main
      id="main"
      className="container-page grid min-h-dvh place-content-center gap-6 text-center"
    >
      <p className="label-caps text-accent">404</p>
      <h1 className="font-display text-h2">Page not found.</h1>
      <p className="text-lead text-muted">It may only exist on preview deployments.</p>
      <div>
        <ButtonLink href="/">Back to the homepage</ButtonLink>
      </div>
    </main>
  );
}
