"use client";

import type { ServiceStatus } from "@/lib/admin/services";
import { SettingsCard } from "../account/SettingsCard";
import { Icon } from "../ui/Icon";
import { BADGE_SHELL, NEUTRAL_BADGE } from "../ui/StatusChip";
import { ADMIN_COPY } from "./admin-copy";
import { RevealItem } from "./RevealItem";

const COPY = ADMIN_COPY.system.services;

/**
 * Configured, or not: a missing service Squint needs reads as a warning, an
 * optional one quietly. Each tint and ink meet AA together in both themes.
 */
function ServiceBadge({ configured, optional }: Pick<ServiceStatus, "configured" | "optional">) {
  const look = configured
    ? { tone: "bg-ready-soft text-ready-text", icon: "check" as const, label: COPY.configured }
    : optional
      ? { tone: NEUTRAL_BADGE, icon: "minus" as const, label: COPY.notConfigured }
      : {
          tone: "bg-warning-soft text-warning-text",
          icon: "alert" as const,
          label: COPY.notConfigured,
        };
  return (
    <span
      data-testid="service-status"
      data-configured={configured}
      className={`${BADGE_SHELL} shrink-0 font-semibold ${look.tone}`}
    >
      <Icon name={look.icon} className="size-4 shrink-0" />
      {look.label}
    </span>
  );
}

/** Each service Squint reads from its environment: what it's for, and whether it's set up. */
export function ServiceList({ services }: { services: readonly ServiceStatus[] }) {
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description}
      icon="shield"
      testId="system-services"
    >
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {services.map((service, index) => {
          const item = COPY.items[service.id];
          return (
            <RevealItem
              key={service.id}
              order={index}
              testId={`service-${service.id}`}
              // The badge under the words, as the workspace rows' status sits: beside them, a
              // half-width column (from sm up) left the words barely 120px.
              className="flex min-w-0 flex-col items-start gap-2 border-b border-line py-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-body font-semibold text-ink">{item.name}</h3>
                <p className="text-meta text-pretty text-muted">
                  {item.what}
                  {service.optional ? ` · ${COPY.optional}` : ""}
                </p>
              </div>
              <ServiceBadge configured={service.configured} optional={service.optional} />
            </RevealItem>
          );
        })}
      </ul>
    </SettingsCard>
  );
}
