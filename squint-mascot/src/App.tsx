import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { Download, Moon, Sun } from "lucide-react";
import { ease, duration, pageTransition, spring, stagger } from "./lib/motion";
import { MOODS, MOOD_SPECS, SquintMascot, type Mood } from "./mascot";
import { MoodPicker, Toggle } from "./demo/Controls";
import { ChatDemo } from "./demo/ChatDemo";

const USAGE = `import { SquintMascot } from "./mascot";

<SquintMascot
  mood="thinking"      // idle | listening | thinking | talking
                       // happy | surprised | sleeping | resolved | searching
  size={160}
  followCursor         // eyes track the pointer
  draggable            // pick up, fling, springs home
  onPoke={() => {}}    // makes it a button (click, Enter, Space)
/>`;

type Theme = "light" | "dark";

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [theme, setTheme] as const;
}

export function App() {
  const reduce = useReducedMotion();
  const [theme, setTheme] = useTheme();
  const [mood, setMood] = useState<Mood>("idle");
  const [follow, setFollow] = useState(true);
  const [draggable, setDraggable] = useState(true);
  const [pokes, setPokes] = useState(0);

  const page: Variants = {
    initial: { opacity: 0, y: reduce ? 0 : 16 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { ...pageTransition, staggerChildren: stagger.children, delayChildren: stagger.delay },
    },
    exit: { opacity: 0, y: reduce ? 0 : -8, transition: { duration: duration.component, ease: ease.out } },
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div key="home" variants={page} initial="initial" animate="animate" exit="exit">
        <header className="shell topbar">
          <motion.div className="brand" variants={item(reduce)}>
            <img src="/squint-mark.svg" alt="" />
            Squint
            <small>Mascot kit</small>
          </motion.div>
          <motion.button
            type="button"
            className="icon-btn"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={spring.ui}
            variants={item(reduce)}
          >
            {theme === "dark" ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
          </motion.button>
        </header>

        <main>
          <section className="shell hero">
            <div>
              <motion.p className="eyebrow" variants={item(reduce)}>
                Meet the character
              </motion.p>
              <motion.h1 variants={item(reduce)}>Squint, now with a pulse.</motion.h1>
              <motion.p className="lede" variants={item(reduce)}>
                The speech bubble from the logo, rebuilt as a living mascot. It blinks, follows your cursor, reacts
                when poked, and shifts mood with the product.
              </motion.p>

              <motion.div className="controls" variants={item(reduce)}>
                <div>
                  <p className="control-label">Mood</p>
                  <MoodPicker value={mood} onChange={setMood} />
                </div>
                <div className="toggles">
                  <Toggle label="Follow cursor" checked={follow} onChange={setFollow} />
                  <Toggle label="Draggable" checked={draggable} onChange={setDraggable} />
                </div>
                <p className="poke-count" aria-live="polite">
                  {pokes === 0 ? "Tip: click Squint, or focus it and press Enter." : `Poked ${pokes} ${pokes === 1 ? "time" : "times"}.`}
                </p>
              </motion.div>
            </div>

            <motion.div className="stage" variants={item(reduce)}>
              <SquintMascot
                mood={mood}
                size="62%"
                followCursor={follow}
                draggable={draggable}
                onPoke={() => setPokes((n) => n + 1)}
              />
              <p className="stage-hint">{draggable ? "Click to poke. Drag to fling." : "Click to poke."}</p>
            </motion.div>
          </section>

          <Section
            eyebrow="All moods"
            title="Eight states, one character"
            body="Every mood running live, side by side. Click any of them to load it into the stage above."
          >
            <ul className="mood-grid">
              {MOODS.map((m) => (
                <li key={m}>
                  <motion.button
                    type="button"
                    className="mood-card"
                    aria-pressed={m === mood}
                    onClick={() => {
                      setMood(m);
                      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
                    }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    transition={spring.ui}
                  >
                    <SquintMascot mood={m} size={120} label={`Squint, ${MOOD_SPECS[m].label}`} />
                    <span>{MOOD_SPECS[m].label}</span>
                  </motion.button>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            eyebrow="In context"
            title="A co-pilot that shows what it's doing"
            body="Moods map to product states. Focus the field and type to see it listen, send to watch it think and answer, then resolve the thread to see it celebrate. Leave it alone and it dozes off."
          >
            <ChatDemo />
          </Section>

          <Section
            eyebrow="Scales down"
            title="Works from favicon to hero"
            body="Every size keeps the same rig, so small avatars still blink and glance around."
          >
            <div className="sizes">
              {[32, 48, 72, 120, 180].map((s) => (
                <div className="size-item" key={s}>
                  <SquintMascot size={s} mood="idle" />
                  {s}px
                </div>
              ))}
            </div>
          </Section>

          <Section
            eyebrow="Use it"
            title="One component, nine moods"
            body="Drop the mascot folder into any React app with Framer Motion installed."
          >
            <div className="usage">
              <pre className="code">
                <code>{USAGE}</code>
              </pre>
              <div className="download">
                <img src="/squint-mark.svg" alt="Squint mark, isolated" />
                <p>The icon mark isolated from the logo as a clean vector, with body and eyes on separate layers.</p>
                <motion.a
                  className="link-btn"
                  href="/squint-mark.svg"
                  download
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring.ui}
                >
                  <Download size={18} strokeWidth={2} aria-hidden="true" />
                  squint-mark.svg
                </motion.a>
              </div>
            </div>
          </Section>
        </main>

        <footer className="shell footer">Squint mascot kit. Built with React and Framer Motion.</footer>
      </motion.div>
    </AnimatePresence>
  );
}

const item = (reduce: boolean | null): Variants => ({
  initial: { opacity: 0, y: reduce ? 0 : 14 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.page, ease: ease.out } },
});

function Section({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className="shell section"
      initial={{ opacity: 0, y: reduce ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: duration.page, ease: ease.out }}
    >
      <div className="section-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      {children}
    </motion.section>
  );
}
