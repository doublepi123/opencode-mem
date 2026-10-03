import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { initTheme } from "$lib/theme";

initTheme();

const target = document.getElementById("app");
if (!target) {
  throw new Error("Root element #app not found");
}

mount(App, { target });
