import { render } from "preact";
import "./app.css";
import { connect } from "./net.ts";
import { App } from "./ui/App.tsx";

const root = document.getElementById("app")!;
connect();
root.textContent = "";
render(<App user={root.dataset.user ?? ""} />, root);
