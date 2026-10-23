import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HOST_ATTRIBUTE, HOST_STYLE, HOST_TAG } from "../core/host";
import { WIDGET_CSS } from "./styles";

interface ShadowMount {
  host: HTMLElement;
  container: HTMLElement;
}

interface ShadowPortalProps {
  children: (host: HTMLElement) => ReactNode;
}

function createShadowMount(): ShadowMount {
  const host = document.createElement(HOST_TAG);
  host.setAttribute(HOST_ATTRIBUTE, "");
  host.setAttribute("style", HOST_STYLE);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = WIDGET_CSS;
  const container = document.createElement("div");
  container.className = "pp-root";
  shadow.append(style, container);
  return { host, container };
}

/**
 * Renders children into a shadow root on a fixed host appended to <body>.
 * Styles cannot leak in or out, and the host never affects page layout.
 */
export function ShadowPortal({ children }: ShadowPortalProps) {
  const [mount] = useState(createShadowMount);

  useLayoutEffect(() => {
    document.body.append(mount.host);
    return () => mount.host.remove();
  }, [mount]);

  return createPortal(children(mount.host), mount.container);
}
