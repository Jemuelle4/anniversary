# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A small static anniversary web app: plain HTML/CSS/JS with no build step, bundler, package manager, or test suite. Open any `.html` file directly in a browser (or serve the directory with any static file server) to run it.

## Architecture

- `index.html` — landing page with two photos and a "Surprise!" button that navigates to `surprise.html`.
- `surprise.html` / `actions.html` — identical "stage" pages (a `<div id="stage">` plus a dock of action buttons) that differ only in their back-navigation target and are both driven by the same script.
- `app.js` — single shared script loaded by every page. `wireNav()` handles `[data-nav]` buttons (page-to-page navigation via `navTo()`); `wireActions()` handles `[data-action]` buttons on the stage pages, dispatching through `actionMap` to one of four animation functions: `runExplode`, `runBite`, `runThrow`, `runLove`. Each function spawns a `plush` image (`plush.png`) into the stage `<div>` and animates it with a mix of CSS classes (see `styles.css`) and, for `runThrow`, a hand-rolled `requestAnimationFrame` physics loop (gravity/bounce/friction). `runBite` maintains module-level state (`biteState`, `biteBites`) representing a spiral of bite marks applied as an SVG mask (`svgMaskDataUrl`/`applyBiteMask`) that persists across clicks until the plush is fully "eaten," then resets.
- `styles.css` — all visual/animation styling (keyframes for pop/shake/explode/chomp/fade-out, particle bursts, hearts, dock/button styling) referenced by the class names `app.js` toggles.
- `photos/` — static images referenced by `index.html`.

There is no routing framework: navigation between pages is literal `window.location.href` changes between static HTML files.
