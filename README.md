# confluence-html-previewer

Preview a self-contained HTML attachment in **Atlassian Confluence Server / Data Center** from a lightweight **User Macro**.

No Java plugin required. Authors insert the macro and put one or more HTML attachments in its body. Admins host two static files and load `html-previewer.init.js` once via **Custom HTML**. On the view page each attachment becomes a filename with Preview and Download icons. Preview opens a page-covering overlay; Download starts a normal browser download.

## Features

- **User Macro only** — no Atlassian Plugin SDK or JAR deployment
- **No `<script>` in the macro** — Confluence would split the editor if the macro output contains script tags
- **Idempotent** — `data-state` moves from `pending` to `ready` after the attachment list is rewritten
- **Links and thumbnails** — both displays become the same row: filename, then Preview and Download
- **One attachment per row** — every file in the macro body is kept
- **Page overlay** — `position: fixed` covers the wiki page. It does not call the browser Fullscreen API
- **Sandboxed preview** — the file is fetched as text and assigned to an iframe `srcdoc` with `sandbox="allow-scripts allow-forms"` and without `allow-same-origin`

## Quick start (admin)

### 1. Build static assets

```bash
npm install
npm run build
```

Output:

```
dist/html-previewer.init.js
dist/html-previewer.icon.png
```

`html-previewer.init.js` is minified. Upload both files to your internal static server, for example:

```
https://static.example.com/confluence-html-previewer/html-previewer.init.js
https://static.example.com/confluence-html-previewer/html-previewer.icon.png
```

Serve the script with `Content-Type: application/javascript`.

### 2. Create the User Macro

**Confluence Administration → User Macros → Create User Macro**

| Setting | Value |
|---------|-------|
| Macro name | `confluence-html-previewer` |
| Visibility | Visible to all users |
| Macro title | `confluence-html-previewer` |
| Icon URL | hosted `dist/html-previewer.icon.png`, e.g. `https://static.example.com/confluence-html-previewer/html-previewer.icon.png` |
| Documentation URL | `https://github.com/WindieChai/confluence-html-previewer` |
| Categories | pick at least one, for example Development |
| Macro body | Has body |
| Body processing | **Rendered** |
| Output | **HTML** |
| Template | Copy from [`macro/html-previewer.vm`](macro/html-previewer.vm) |

The macro browser lists and searches **Macro title**, not the macro name alone. The template includes `## @noparams`. Without `@param` or `@noparams`, Confluence omits a parameter-less macro from the browser.

Body processing must be **Rendered**. The editor stores an attachment reference; Rendered turns it into a real link or thumbnail, including `/download/attachments/{pageId}/{filename}` and `data-linked-resource-id`. Unrendered would leave storage markup with no download URL.

**Do not add `<script>` tags to the user macro.** Even an empty `<script>` or one with a dummy `src` makes Confluence open a split editor (edit on the left, preview on the right) when you click Edit.

### 3. Configure Custom HTML

**Confluence Administration → Custom HTML → At end of the BODY:**

```html
<script src="https://static.example.com/confluence-html-previewer/html-previewer.init.js"></script>
```

Do **not** paste the user-macro template into Custom HTML. Custom HTML is not Velocity: `$body` would appear literally.

Append `?v=` to the script URL when you replace the file, so browsers drop the cached copy. If the macro still shows the original attachment link and `data-state="pending"`, the page is running an older script.

### 4. Authors use the macro

1. Edit a Confluence page
2. **Insert → Other Macros** → search **confluence-html-previewer**
3. Insert one or more HTML attachments into the macro body, either as a link or as a thumbnail
4. Save

On the view page each file is one row: the filename, a Preview icon, and a Download icon. Hover the icons for **Preview** and **Download**. Preview covers the page and shows a spinner until the file is ready. The top bar shows only the filename. Download uses the browser's normal download.

## HTML attachment requirements

The HTML file must be self-contained. In-page jumps use anchors only.

Put CSS and JavaScript inside the file (`<style>` and `<script>`). Use data URIs or absolute `https` URLs for images. Relative images, stylesheets, and scripts do not load, because the preview document's base URL is the current wiki page, not the attachment directory.

Write in-page links as `href="#section-id"` and set the same `id` on the target element. The click scrolls inside the preview.

Do not use site-relative URLs (`/path`, `file.html`, `?query`), `target="_top"`, or `target="_parent"`. Do not assign `location`, `parent.location`, or `top.location`, and do not submit a form that navigates. Those requests hit the wiki, and the session gateway sends the reader to the login page. Links to other sites are also blocked inside the preview and will not open.

## Architecture

```
User Macro (no <script> tags)
  └── <div class="confluence-html-previewer" data-state="pending">
        └── rendered attachment links and thumbnails ($body)

Custom HTML (end of BODY)
  └── <script src="html-previewer.init.js">

html-previewer.init.js (idempotent)
  ├── rewrite each attachment into filename + Preview + Download
  ├── data-state="ready"
  ├── capture pointerdown / mousedown / click / auxclick on window
  ├── Preview: position:fixed overlay, fetch the attachment text, assign srcdoc
  └── Download: leave the primary click to the browser
```

The iframe sandbox is `allow-scripts allow-forms` and does not include `allow-same-origin`. Scripts and styles inside the file cannot read the wiki page. The attachment URL is not used as the iframe `src`, because `Content-Disposition: attachment` would start a download. A small guard inside `srcdoc` keeps anchor clicks inside the preview.

## Development

```bash
npm install
npm run build
npm run serve
```

Edit `src/init.js`, then rebuild. `npm run build` minifies it to `dist/html-previewer.init.js` and writes `dist/html-previewer.icon.png`. Commit the updated `dist/` files if you want the published assets to stay current.

`npm run serve` opens a local page at <http://127.0.0.1:8766/>. Requests under `/download/attachments/` return `examples/sample.html` with `Content-Disposition: attachment`, which matches a Confluence 6.9 attachment response.

## Limitations

- **Self-contained HTML** — relative assets and wiki-relative links do not work inside the preview. See [HTML attachment requirements](#html-attachment-requirements)
- **View page only** — the script runs on the published page, not inside the editor iframe
- **PDF / Word export** — the client-side preview does not appear in exported documents
- **Confluence Cloud** — this project targets **Server / Data Center 6.9+**. Cloud does not support this user-macro setup
- **Security** — only Confluence administrators should create or edit User Macros. The sandbox does not grant the attachment the wiki page's origin

## License

MIT — see [LICENSE](LICENSE).
