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

test("allowing controls frees buttons, links, summaries and role buttons but never text entry or opt-outs", () => {
  const host = mount(`
    <button id="button"><span id="inside">label</span></button>
    <a id="link" href="#x">link</a>
    <details><summary id="summary">more</summary></details>
    <div id="role" role="button"></div>
    <input id="input" />
    <textarea id="textarea"></textarea>
    <select id="select"></select>
    <div id="editable" contenteditable="true"><button id="typed-button"></button></div>
    <div id="ignored" data-joystick-ignore><button id="deep-button"></button></div>
    <button id="plain-button"><input id="nested-input" /></button>
  `);
  const options = { allowControls: true };
  for (const id of ["button", "inside", "link", "summary", "role", "plain-button"]) {
    expect(isInteractiveTarget(host.querySelector(`#${id}`), options), id).toBe(false);
  }
  for (const id of [
    "input",
    "textarea",
    "select",
    "editable",
    "typed-button",
    "ignored",
    "deep-button",
    "nested-input",
  ]) {
    expect(isInteractiveTarget(host.querySelector(`#${id}`), options), id).toBe(true);
  }
  expect(isInteractiveTarget(host.querySelector("#button"), { allowControls: false })).toBe(true);
});

test("plain content, non-editable content, missing targets and non-elements are not interactive", () => {
  const host = mount(`<div id="plain"></div><div id="off" contenteditable="false"></div>`);
  expect(isInteractiveTarget(host.querySelector("#plain"))).toBe(false);
  expect(isInteractiveTarget(host.querySelector("#off"))).toBe(false);
  expect(isInteractiveTarget(null)).toBe(false);
  expect(isInteractiveTarget(window)).toBe(false);
});
