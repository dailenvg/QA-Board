"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { useRevealVariants } from "@/lib/motion";
import { resetData } from "@/lib/store/store";
import { SquintMascot } from "../brand/mascot/SquintMascot";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/ToastProvider";

interface DataRecoveryProps {
  reason: string;
  raw: string;
}

function downloadBackup(raw: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `squint-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Shown when stored data can't be read: keep a copy, then start fresh. */
export function DataRecovery({ reason, raw }: DataRecoveryProps) {
  const [confirming, setConfirming] = useState(false);
  const variants = useRevealVariants();
  const toast = useToast();

  const reset = () => {
    setConfirming(false);
    const result = resetData();
    if (!result.ok) toast({ tone: "error", message: result.error });
  };

  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <motion.section
        variants={variants}
        initial="hidden"
        animate="visible"
        role="alert"
        className="flex w-full max-w-md flex-col items-center gap-5 rounded-panel bg-panel px-6 py-10 text-center"
      >
        <SquintMascot mood="surprised" size={120} followCursor={false} />
        <div>
          <h1 className="text-title font-bold">We couldn&apos;t read your saved projects</h1>
          <p className="mt-2 text-body text-muted">
            {reason} Download a backup to keep a copy, then start fresh.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="secondary" onClick={() => downloadBackup(raw)}>
            <Icon name="upload" className="size-4 rotate-180" />
            Download backup
          </Button>
          <Button onClick={() => setConfirming(true)}>Start fresh</Button>
        </div>
      </motion.section>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Start fresh?"
        description="Your saved data will be replaced with an empty workspace. Download a backup first if you need it."
        confirmLabel="Start fresh"
        onConfirm={reset}
      />
    </main>
  );
}
