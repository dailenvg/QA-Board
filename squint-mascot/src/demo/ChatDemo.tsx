import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, SendHorizontal } from "lucide-react";
import { duration, ease, spring } from "../lib/motion";
import { SquintMascot, type Mood } from "../mascot";

type Message = { id: number; from: "user" | "bot" | "system"; text: string };

const REPLIES = [
  "Good question. I squint at the details so you don't have to.",
  "Here's the short version: start small, ship it, then look closer.",
  "I found three things worth a second look. Want me to walk through them?",
  "Done. I tidied that up and left notes where it mattered.",
];

const STATUS: Record<Mood, string> = {
  idle: "Online",
  listening: "Listening",
  thinking: "Thinking",
  talking: "Typing a reply",
  happy: "Glad to help",
  surprised: "Oh, hi!",
  sleeping: "Napping. Type to wake",
  resolved: "Resolved. Nice work",
  searching: "Looking closer",
};

const SLEEP_AFTER = 15000;
/** One full celebration hop plus a beat before settling back to idle. */
const CELEBRATE_FOR = 2400;

export function ChatDemo() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "thinking" | "talking" | "happy" | "sleeping" | "waking" | "resolved"
  >("idle");
  const [resolved, setResolved] = useState(false);
  const [lastActive, setLastActive] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);
  const replyIndex = useRef(0);
  const nextId = useRef(1);

  const busy = phase === "thinking" || phase === "talking";
  const canResolve = !resolved && !busy && messages.some((m) => m.from === "bot");
  const mood: Mood =
    phase === "waking" ? "surprised" : phase === "idle" ? (focused && draft ? "listening" : "idle") : phase;

  // Doze off when nobody is around.
  useEffect(() => {
    if (phase !== "idle" || focused) return;
    const t = window.setTimeout(() => setPhase("sleeping"), SLEEP_AFTER - (Date.now() - lastActive));
    return () => window.clearTimeout(t);
  }, [phase, focused, lastActive]);

  useEffect(() => {
    const hold = { happy: 1400, waking: 700, resolved: CELEBRATE_FOR }[phase as string];
    if (!hold) return;
    const t = window.setTimeout(() => {
      setPhase("idle");
      setLastActive(Date.now());
    }, hold);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const touch = () => {
    setLastActive(Date.now());
    if (phase === "sleeping") setPhase("waking");
  };

  const reply = () => {
    const text = REPLIES[replyIndex.current++ % REPLIES.length];
    const id = nextId.current++;
    setPhase("talking");
    setMessages((m) => [...m, { id, from: "bot", text: "" }]);
    let i = 0;
    const tick = window.setInterval(() => {
      i += 2;
      setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, text: text.slice(0, i) } : msg)));
      if (i >= text.length) {
        window.clearInterval(tick);
        setPhase("happy");
        setLastActive(Date.now());
      }
    }, 28);
  };

  const resolve = () => {
    if (!canResolve) return;
    setResolved(true);
    setPhase("resolved");
    setMessages((m) => [...m, { id: nextId.current++, from: "system", text: "Thread resolved" }]);
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { id: nextId.current++, from: "user", text }]);
    setDraft("");
    setResolved(false);
    setPhase("thinking");
    window.setTimeout(reply, 1500);
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <SquintMascot mood={mood} size={56} label="Squint assistant" />
        <div>
          <strong>Squint</strong>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={STATUS[mood]}
              className="chat-status"
              aria-live="polite"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: duration.micro, ease: ease.out }}
              style={{ display: "block" }}
            >
              {STATUS[mood]}
            </motion.span>
          </AnimatePresence>
        </div>
        <motion.button
          type="button"
          className="resolve-btn"
          onClick={resolve}
          disabled={!canResolve}
          aria-pressed={resolved}
          whileHover={canResolve ? { scale: 1.03 } : undefined}
          whileTap={canResolve ? { scale: 0.97 } : undefined}
          transition={spring.ui}
        >
          <CheckCheck size={18} strokeWidth={2} aria-hidden="true" />
          {resolved ? "Resolved" : "Resolve"}
        </motion.button>
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">
            Say anything. Squint listens while you type, thinks, then answers. Resolve the thread to celebrate.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                layout="position"
                className={`bubble ${m.from}`}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={spring.ui}
              >
                {m.text || " "}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <form className="chat-form" onSubmit={send}>
        <label htmlFor="chat-input">Message Squint</label>
        <input
          id="chat-input"
          className="chat-input"
          placeholder="Message Squint"
          autoComplete="off"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            touch();
          }}
          onFocus={() => {
            setFocused(true);
            touch();
          }}
          onBlur={() => {
            setFocused(false);
            setLastActive(Date.now());
          }}
        />
        <motion.button
          type="submit"
          className="send-btn"
          disabled={!draft.trim() || busy}
          whileHover={draft.trim() && !busy ? { scale: 1.03 } : undefined}
          whileTap={draft.trim() && !busy ? { scale: 0.97 } : undefined}
          transition={spring.ui}
        >
          <SendHorizontal size={18} strokeWidth={2} aria-hidden="true" />
          Send
        </motion.button>
      </form>
    </div>
  );
}
