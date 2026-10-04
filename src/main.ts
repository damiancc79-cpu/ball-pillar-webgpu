import { App } from "./app/App";
import { startSmokeHarness } from "./app/SmokeHarness";

const host = document.querySelector<HTMLElement>("#app");
if (!host) {
  throw new Error("Missing #app host element.");
}

const isSmokeHarness = import.meta.env.DEV && new URLSearchParams(window.location.search).has("smoke-ui");

if (isSmokeHarness) {
  startSmokeHarness(host);
} else {
  const app = new App(host);
  void app.initialize();
  window.addEventListener("beforeunload", () => app.dispose(), { once: true });
}
