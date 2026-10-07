import { defineConfig, markdown } from "sourcey";

export default defineConfig({
  name: "input-joystick",
  siteUrl: "https://jbcom.github.io",
  baseUrl: "/input-joystick",
  theme: {
    preset: "default",
    colors: {
      primary: "#1c3a52",
      light: "#377eb7",
      dark: "#0d1b26",
    },
    fonts: {
      sans: "system-ui, sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    layout: {
      sidebar: "17rem",
      toc: "18rem",
      content: "46rem",
    },
    css: ["./brand.css"],
  },
  logo: { light: "./assets/input-joystick.svg", href: "/input-joystick/" },
  favicon: "./assets/favicon.svg",
  repo: "https://github.com/jbcom/input-joystick",
  editBranch: "main",
  editBasePath: "docs",
  prettyUrls: "slash",
  navbar: {
    links: [
      { type: "github", href: "https://github.com/jbcom/input-joystick" },
      { type: "npm", href: "https://www.npmjs.com/package/input-joystick" },
    ],
  },
  footer: {
    links: [
      {
        type: "link",
        label: "MIT License",
        href: "https://github.com/jbcom/input-joystick/blob/main/LICENSE",
      },
      {
        type: "link",
        label: "Security",
        href: "https://github.com/jbcom/input-joystick/security/policy",
      },
    ],
  },
  navigation: {
    tabs: [
      {
        tab: "Documentation",
        slug: "",
        source: markdown({
          groups: [
            {
              group: "Getting Started",
              pages: ["introduction", "getting-started"],
            },
            {
              group: "Reference",
              pages: ["API", "ARCHITECTURE"],
            },
            {
              group: "Project",
              pages: ["decisions", "contributing", "release-history"],
            },
          ],
        }),
      },
    ],
  },
});
