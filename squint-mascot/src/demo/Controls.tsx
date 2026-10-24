import { motion } from "framer-motion";
import { spring } from "../lib/motion";
import { MOODS, MOOD_SPECS, type Mood } from "../mascot";

export function MoodPicker({ value, onChange }: { value: Mood; onChange: (m: Mood) => void }) {
  const move = (dir: 1 | -1) => {
    const i = MOODS.indexOf(value);
    onChange(MOODS[(i + dir + MOODS.length) % MOODS.length]);
  };

  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label="Mood"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), move(1));
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), move(-1));
      }}
    >
      {MOODS.map((m) => {
        const active = m === value;
        return (
          <motion.button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className="segment"
            onClick={() => onChange(m)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={spring.ui}
          >
            {active && <motion.span layoutId="mood-pill" className="segment-pill" transition={spring.ui} />}
            <span className="segment-text">{MOOD_SPECS[m].label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle"
      onClick={() => onChange(!checked)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={spring.ui}
    >
      <span className="toggle-track" aria-hidden="true">
        <motion.span layout className="toggle-thumb" transition={spring.ui} />
      </span>
      {label}
    </motion.button>
  );
}
