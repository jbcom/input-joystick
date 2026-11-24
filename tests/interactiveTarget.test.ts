import { afterEach, expect, test } from "vitest";
import { isInteractiveTarget } from "../src/interactiveTarget";

afterEach(() => {
  document.body.replaceChildren();
});

function mount(html: string) {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

test("controls, links, summaries, editable content and opted-out subtrees are interactive", () => {
  const host = mount(`
    <button id="button"><span id="inside">label</span></button>
    <a id="link" href="#x">link</a>
    <input id="input" />
    <textarea id="textarea"></textarea>
    <select id="select"></select>
    <details><summary id="summary">more</summary></details>
    <div id="role" role="button"></div>
    <div id="editable" contenteditable="true"><b id="typed"></b></div>
    <div id="ignored" data-joystick-ignore><i id="deep"></i></div>
  `);
  for (const id of [
    "button",
    "inside",
    "link",
    "input",
    "textarea",
    "select",
    "summary",
    "role",
    "editable",
    "typed",
    "ignored",
    "deep",
  ]) {
    expect(isInteractiveTarget(host.querySelector(`#${id}`)), id).toBe(true);
  }
});

test("plain content, non-editable content, missing targets and non-elements are not interactive", () => {
  const host = mount(`<div id="plain"></div><div id="off" contenteditable="false"></div>`);
  expect(isInteractiveTarget(host.querySelector("#plain"))).toBe(false);
  expect(isInteractiveTarget(host.querySelector("#off"))).toBe(false);
  expect(isInteractiveTarget(null)).toBe(false);
  expect(isInteractiveTarget(window)).toBe(false);
});
