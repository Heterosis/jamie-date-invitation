import "@fontsource-variable/fraunces/index.css";
import "@fontsource/schoolbell/index.css";
import "./styles/base.css";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app mount point");

const name = new URLSearchParams(location.search).get("to")?.trim() || "Jamie";
const heading = document.createElement("h1");
heading.textContent = `${name}, will you go on a date with me?`;
app.append(heading);
