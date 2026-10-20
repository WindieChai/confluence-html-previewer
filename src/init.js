/**
 * Confluence HTML Previewer — init script
 *
 * Loaded once via Custom HTML. The user macro only emits the rendered
 * attachment link. A click fetches that URL and assigns the text to a
 * sandboxed srcdoc iframe.
 *
 * Do not put <script> tags in the User Macro — they split the editor.
 * The overlay covers the page with position:fixed. Do not call
 * requestFullscreen(); that takes over the monitor, not the page.
 */
(function (global) {
  'use strict';

  var NS = global.__htmlPreviewer = global.__htmlPreviewer || { bound: false };
  var readyHandler = null;
  var readyTimer = 0;
  var ROOT = '.confluence-html-previewer';
  var OVERLAY_ID = 'hp-overlay';
  var STYLE_ID = 'hp-styles';

  var CSS_TEXT =
    'html.hp-open,html.hp-open body{overflow:hidden!important}' +
    '.hp-overlay{position:fixed;top:0;right:0;bottom:0;left:0;z-index:100000;' +
      'display:flex;flex-direction:column;background:#fff}' +
    '.hp-bar{display:flex;align-items:center;gap:12px;padding:8px 12px;' +
      'background:#F4F5F7;color:#172B4D;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}' +
    '.hp-meta{margin-right:auto;word-break:break-all}' +
    '.hp-close{border:0;background:transparent;color:#172B4D;font-size:22px;line-height:1;' +
      'cursor:pointer;padding:0 4px}' +
    '.hp-frame{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;border:0;background:#fff}' +
    '.hp-stage{position:relative;flex:1;min-height:0}' +
    '.hp-loading{position:absolute;top:0;right:0;bottom:0;left:0;z-index:1;display:flex;' +
      'align-items:center;justify-content:center;background:#fff}' +
    '.hp-loading:before{content:"";width:28px;height:28px;border:2px solid #DFE1E6;' +
      'border-top-color:#6B778C;border-radius:50%;animation:hp-spin .7s linear infinite}' +
    '.hp-error{position:absolute;top:0;right:0;bottom:0;left:0;z-index:1;display:flex;' +
      'align-items:center;justify-content:center;box-sizing:border-box;padding:24px;' +
      'background:#fff;color:#5E6C84;font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-align:center}' +
    '@keyframes hp-spin{to{transform:rotate(360deg)}}' +
    'div.conf-macro.output-inline.confluence-html-previewer,div.confluence-html-previewer{' +
      'display:flex;flex-direction:column;align-items:flex-start;gap:8px}' +
    '.confluence-html-previewer .hp-file{display:flex;flex-direction:row;align-items:center;gap:6px;' +
      'color:#172B4D;font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}' +
    '.confluence-html-previewer .hp-actions{display:inline-flex;align-items:center;gap:0}' +
    'div.confluence-html-previewer a.hp-btn,div.confluence-html-previewer button.hp-btn{' +
      'display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;' +
      'width:22px;height:22px;margin:0;padding:0;border:0;border-radius:3px;' +
      'background:transparent;color:#5E6C84;text-decoration:none;cursor:pointer}' +
    '.confluence-html-previewer .hp-btn svg{width:16px;height:16px;display:block;flex:none}' +
    'div.confluence-html-previewer a.hp-btn:hover,div.confluence-html-previewer button.hp-btn:hover{' +
      'background:#F4F5F7;color:#172B4D}';

  // srcdoc's base URL is the Wiki page. A click on <a href="#id"> or any
  // relative href therefore requests the Wiki itself, and the session
  // gateway answers with the login page. Keep fragment jumps inside the
  // frame and cancel every other navigation.
  var GUARD =
    '<base href="about:srcdoc">' +
    '<script>' +
    '(function(){' +
    'function from(node){return node&&node.nodeType===1?node:node&&node.parentElement;}' +
    'document.addEventListener("click",function(e){' +
      'var el=from(e.target);' +
      'var a=el&&el.closest?el.closest("a"):null;' +
      'if(!a)return;' +
      'var href=a.getAttribute("href")||"";' +
      'e.preventDefault();' +
      'e.stopPropagation();' +
      'if(href.charAt(0)!=="#")return;' +
      'var id=href.slice(1);' +
      'if(!id)return;' +
      'try{id=decodeURIComponent(id);}catch(err){}' +
      'var t=document.getElementById(id);' +
      'if(!t){var nodes=document.getElementsByName(id);t=nodes&&nodes[0];}' +
      'if(t&&t.scrollIntoView)t.scrollIntoView();' +
    '},true);' +
    'document.addEventListener("submit",function(e){e.preventDefault();},true);' +
    'function painted(){' +
      'requestAnimationFrame(function(){' +
        'requestAnimationFrame(function(){' +
          'try{parent.postMessage({hp:"ready"},"*");}catch(err){}' +
        '});' +
      '});' +
    '}' +
    'if(document.readyState==="complete")painted();' +
    'else window.addEventListener("load",painted);' +
    '})();' +
    '</script>';

  // Lucide eye and save (floppy disk), same stroke set.
  var EYE_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>' +
      '<circle cx="12" cy="12" r="3"/>' +
    '</svg>';
  var DISK_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>' +
      '<path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/>' +
      '<path d="M7 3v4a1 1 0 0 0 1 1h7"/>' +
    '</svg>';

  function elementFrom(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
  }

  function isAttachmentHref(href, id) {
    return (href && href.indexOf('/download/attachments/') !== -1) || !!id;
  }

  function attachmentLink(node) {
    var el = elementFrom(node);
    if (!el || !el.closest) return null;
    var link = el.closest('a');
    if (!link || link.classList.contains('hp-download') || !link.closest(ROOT)) return null;
    var href = link.getAttribute('href') || '';
    var id = link.getAttribute('data-linked-resource-id') || '';
    if (!isAttachmentHref(href, id)) return null;
    return link;
  }

  function previewButton(node) {
    var el = elementFrom(node);
    if (!el || !el.closest) return null;
    var button = el.closest('.hp-preview');
    if (!button || !button.closest(ROOT)) return null;
    return button;
  }

  function downloadLink(node) {
    var el = elementFrom(node);
    if (!el || !el.closest) return null;
    var link = el.closest('a.hp-download');
    if (!link || !link.closest(ROOT)) return null;
    return link;
  }

  function own(el, name) {
    return (el && el.getAttribute && el.getAttribute(name)) || '';
  }

  function macroOf(el) {
    return el && el.closest ? el.closest(ROOT) : null;
  }

  function attrUp(el, name) {
    var root = macroOf(el);
    var node = el;
    while (node) {
      var value = own(node, name);
      if (value) return value;
      if (node === root) break;
      node = node.parentElement;
    }
    return '';
  }

  function representsAttachment(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest && el.closest('.hp-file')) return false;
    if (own(el, 'data-linked-resource-type') === 'attachment') return true;
    if (own(el, 'data-image-src') || own(el, 'data-file-src')) return true;
    var cls = typeof el.className === 'string' ? el.className : '';
    if (cls.indexOf('confluence-embedded-image') !== -1) return true;
    if (cls.indexOf('confluence-embedded-file') !== -1 && cls.indexOf('confluence-embedded-file-wrapper') === -1) return true;
    if (own(el, 'data-linked-resource-default-alias')) return true;
    var url = own(el, 'href') + ' ' + own(el, 'src');
    return url.indexOf('/download/attachments/') !== -1
      || url.indexOf('/download/thumbnails/') !== -1
      || url.indexOf('/documentConversion/') !== -1
      || url.indexOf('preview=') !== -1;
  }

  function absoluteUrl(url) {
    if (!url) return '';
    try { return new URL(url, global.location.href).href; } catch (err) { return url; }
  }

  function attachmentUrl(url) {
    if (!url) return '';
    return absoluteUrl(String(url).replace('/download/thumbnails/', '/download/attachments/'));
  }

  function attachmentLeaves(root) {
    var nodes = root.querySelectorAll(
      'a, img, span.confluence-embedded-file-wrapper, [data-linked-resource-type="attachment"], [data-image-src], [data-file-src]'
    );
    var found = [];
    var i;
    var j;
    for (i = 0; i < nodes.length; i++) {
      if (representsAttachment(nodes[i])) found.push(nodes[i]);
    }
    var leaves = [];
    for (i = 0; i < found.length; i++) {
      var nested = false;
      for (j = 0; j < found.length; j++) {
        if (i !== j && found[i].contains(found[j])) {
          nested = true;
          break;
        }
      }
      if (!nested) leaves.push(found[i]);
    }
    return leaves;
  }

  function countLeaves(el, leaves) {
    var n = 0;
    var i;
    for (i = 0; i < leaves.length; i++) {
      if (el === leaves[i] || (el.contains && el.contains(leaves[i]))) n++;
    }
    return n;
  }

  function replacementTarget(leaf, root, leaves) {
    var node = leaf;
    var parent = leaf.parentElement;
    if (parent && parent !== root && parent.tagName === 'A' && countLeaves(parent, leaves) === 1) {
      node = parent;
      parent = parent.parentElement;
    }
    if (
      parent && parent !== root &&
      parent.classList && parent.classList.contains('confluence-embedded-file-wrapper') &&
      countLeaves(parent, leaves) === 1
    ) {
      return parent;
    }
    return node;
  }

  function fromPreviewUrl(url) {
    var match = /[?&]preview=\/?(\d+)\/\d+\/([^&#]+)/.exec(url || '');
    if (!match) return '';
    return absoluteUrl('/download/attachments/' + match[1] + '/' + match[2]);
  }

  function filenameFromHref(href) {
    var path = href || '';
    var slash = path.lastIndexOf('/');
    var name = slash === -1 ? path : path.slice(slash + 1);
    var query = name.indexOf('?');
    if (query !== -1) name = name.slice(0, query);
    try { name = decodeURIComponent(name); } catch (err) {}
    return name;
  }

  function filenameOf(el) {
    var alias = attrUp(el, 'data-linked-resource-default-alias');
    if (alias) return alias;
    var text = (el.textContent || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    if (text && el.tagName !== 'IMG') return text;
    return filenameFromHref(downloadHref(el));
  }

  function downloadHref(el) {
    var imageSrc = attrUp(el, 'data-image-src');
    var fileSrc = attrUp(el, 'data-file-src');
    var src = own(el, 'src');
    var root = macroOf(el);
    var link = el.tagName === 'A' ? el : (el.closest ? el.closest('a') : null);
    if (link && root && root.contains && !root.contains(link)) link = null;
    var href = link ? (link.getAttribute('href') || '') : '';

    if (imageSrc.indexOf('/download/attachments/') !== -1 || imageSrc.indexOf('/download/thumbnails/') !== -1) {
      return attachmentUrl(imageSrc);
    }
    if (fileSrc.indexOf('/download/attachments/') !== -1 || fileSrc.indexOf('/download/thumbnails/') !== -1) {
      return attachmentUrl(fileSrc);
    }
    if (href.indexOf('/download/attachments/') !== -1 || href.indexOf('/download/thumbnails/') !== -1) {
      return attachmentUrl(link.href || href);
    }
    if (src.indexOf('/download/attachments/') !== -1 || src.indexOf('/download/thumbnails/') !== -1) {
      return attachmentUrl(src);
    }
    var previewUrl = fromPreviewUrl(href) || fromPreviewUrl(fileSrc) || fromPreviewUrl(imageSrc);
    if (previewUrl) return previewUrl;
    var container = attrUp(el, 'data-linked-resource-container-id');
    var alias = attrUp(el, 'data-linked-resource-default-alias');
    if (container && alias) {
      var base = '';
      if (global.AJS && typeof global.AJS.contextPath === 'function') base = global.AJS.contextPath() || '';
      return absoluteUrl(base + '/download/attachments/' + container + '/' + encodeURIComponent(alias));
    }
    return '';
  }

  function replaceWithRow(target, leaf) {
    var source = leaf || target;
    var href = downloadHref(source);
    if (!href) return;
    var filename = filenameOf(source) || filenameFromHref(href);
    var row = document.createElement('span');
    row.className = 'hp-file';

    var name = document.createElement('span');
    name.className = 'hp-name';
    name.textContent = filename;

    var preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'hp-btn hp-preview';
    preview.setAttribute('data-href', href);
    preview.setAttribute('data-name', filename);
    var id = attrUp(source, 'data-linked-resource-id');
    if (id) preview.setAttribute('data-attachment-id', id);
    preview.setAttribute('aria-label', 'Preview');
    preview.setAttribute('title', 'Preview');
    preview.innerHTML = EYE_ICON;

    var download = document.createElement('a');
    download.className = 'hp-btn hp-download';
    download.href = href;
    download.setAttribute('download', filename);
    download.setAttribute('aria-label', 'Download');
    download.setAttribute('title', 'Download');
    download.innerHTML = DISK_ICON;

    var actions = document.createElement('span');
    actions.className = 'hp-actions';
    actions.appendChild(preview);
    actions.appendChild(download);

    row.appendChild(name);
    row.appendChild(actions);
    if (target.parentNode) target.parentNode.replaceChild(row, target);
  }

  function enhanceRoot(root) {
    var leaves = attachmentLeaves(root);
    var targets = [];
    var seen = [];
    var i;
    var target;
    for (i = 0; i < leaves.length; i++) {
      target = replacementTarget(leaves[i], root, leaves);
      if (seen.indexOf(target) !== -1) continue;
      seen.push(target);
      targets.push({ node: target, leaf: leaves[i] });
    }
    for (i = targets.length - 1; i >= 0; i--) replaceWithRow(targets[i].node, targets[i].leaf);
    if (targets.length) root.setAttribute('data-state', 'ready');
  }

  function enhanceAll() {
    var roots = document.querySelectorAll(ROOT);
    var i;
    for (i = 0; i < roots.length; i++) enhanceRoot(roots[i]);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS_TEXT;
    (document.head || document.documentElement).appendChild(style);
  }

  function overlay() {
    return document.getElementById(OVERLAY_ID);
  }

  function clearReadyWait() {
    if (readyHandler) {
      window.removeEventListener('message', readyHandler);
      readyHandler = null;
    }
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = 0;
    }
  }

  function closePreview() {
    clearReadyWait();
    var node = overlay();
    if (!node) return;
    node.remove();
    document.documentElement.classList.remove('hp-open');
  }

  function setMeta(node, text) {
    var meta = node.querySelector('.hp-meta');
    if (meta) meta.textContent = text;
  }

  var NOT_HTML = 'The file is not a valid HTML file and will not be previewed.';

  function declaredNonHtml(contentType) {
    var type = String(contentType || '').toLowerCase().split(';')[0].replace(/^\s+|\s+$/g, '');
    if (!type) return false;
    if (type === 'text/html' || type === 'application/xhtml+xml') return false;
    if (type === 'application/octet-stream' || type === 'binary/octet-stream') return false;
    if (type === 'text/plain' || type === 'text/xml' || type === 'application/xml') return false;
    return true;
  }

  function isHtmlDocument(text, contentType) {
    if (declaredNonHtml(contentType)) return false;
    if (!text || text.indexOf('\0') !== -1) return false;
    var head = String(text).replace(/^\uFEFF/, '').slice(0, 4096).replace(/^\s+/, '');
    var guard = 0;
    while (guard < 8) {
      var lower = head.slice(0, 16).toLowerCase();
      if (lower.indexOf('<!--') === 0) {
        var commentEnd = head.indexOf('-->');
        if (commentEnd === -1) return false;
        head = head.slice(commentEnd + 3).replace(/^\s+/, '');
      } else if (lower.indexOf('<?xml') === 0) {
        var xmlEnd = head.indexOf('?>');
        if (xmlEnd === -1) return false;
        head = head.slice(xmlEnd + 2).replace(/^\s+/, '');
      } else {
        break;
      }
      guard++;
    }
    return /^<!doctype\s+html(?:\s|>)/.test(head.toLowerCase())
      || /^<(?:html|head|body)(?:\s|>)/.test(head.toLowerCase());
  }

  function showStageMessage(node, text) {
    clearReadyWait();
    var loading = node.querySelector('.hp-loading');
    if (!loading) return;
    loading.className = 'hp-error';
    loading.textContent = text;
  }

  function guardHtml(html) {
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, function (match) {
        return match + GUARD;
      });
    }
    return GUARD + html;
  }

  function openPreview(source) {
    closePreview();
    injectStyles();

    var href = source.getAttribute('data-href') || source.href;
    var label = source.getAttribute('data-name') || source.getAttribute('data-linked-resource-default-alias') || filenameFromHref(href);

    var node = document.createElement('div');
    node.id = OVERLAY_ID;
    node.className = 'hp-overlay';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.innerHTML =
      '<div class="hp-bar">' +
        '<span class="hp-meta"></span>' +
        '<button type="button" class="hp-close" aria-label="Close" title="Close">×</button>' +
      '</div>' +
      '<div class="hp-stage">' +
        '<div class="hp-loading" role="status" aria-label="Loading"></div>' +
        '<iframe class="hp-frame" sandbox="allow-scripts allow-forms"></iframe>' +
      '</div>';

    document.body.appendChild(node);
    document.documentElement.classList.add('hp-open');
    setMeta(node, label);
    node.querySelector('.hp-close').addEventListener('click', closePreview);

    var frame = node.querySelector('.hp-frame');
    var revealed = false;
    function revealFrame() {
      if (revealed || overlay() !== node) return;
      revealed = true;
      clearReadyWait();
      var loading = node.querySelector('.hp-loading');
      if (loading) loading.remove();
    }
    readyHandler = function (event) {
      var data = event.data;
      if (!data || data.hp !== 'ready') return;
      if (frame.contentWindow && event.source !== frame.contentWindow) return;
      revealFrame();
    };
    window.addEventListener('message', readyHandler);
    fetch(href, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text().then(function (html) {
          return { html: html, type: res.headers.get('content-type') || '' };
        });
      })
      .then(function (file) {
        if (overlay() !== node) return;
        if (!isHtmlDocument(file.html, file.type)) {
          showStageMessage(node, NOT_HTML);
          return;
        }
        frame.addEventListener('load', function () {
          readyTimer = window.setTimeout(revealFrame, 1000);
        });
        frame.srcdoc = guardHtml(file.html);
      })
      .catch(function (err) {
        if (overlay() !== node) return;
        showStageMessage(node, err && err.message ? err.message : String(err));
      });
  }

  function halt(event, cancelDefault) {
    if (cancelDefault) event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }

  function onClick(event) {
    var download = downloadLink(event.target);
    if (download) {
      halt(event, event.button !== 0);
      return;
    }
    var preview = previewButton(event.target);
    if (preview) {
      halt(event, true);
      if (event.button === 0) openPreview(preview);
      return;
    }
    var link = attachmentLink(event.target);
    if (!link) return;
    halt(event, true);
    if (event.button === 0) openPreview(link);
  }

  function onAuxClick(event) {
    if (downloadLink(event.target) || previewButton(event.target) || attachmentLink(event.target)) {
      halt(event, true);
    }
  }

  function onPointerDown(event) {
    if (downloadLink(event.target) || previewButton(event.target) || attachmentLink(event.target)) {
      halt(event, false);
    }
  }

  function onKey(event) {
    if (event.key === 'Escape') closePreview();
  }

  function observe() {
    if (!global.MutationObserver || NS.observing) return;
    NS.observing = true;
    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      var raf = global.requestAnimationFrame || function (fn) { setTimeout(fn, 0); };
      raf(function () {
        scheduled = false;
        enhanceAll();
      });
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true });
  }

  function bootstrap() {
    injectStyles();
    enhanceAll();
    if (NS.bound) return;
    NS.bound = true;
    // Capture on window runs before Confluence's attachment preview handler,
    // which is what also opens the native preview under this overlay.
    // Re-scan after load: Confluence may insert the macro after this script.
    global.addEventListener('pointerdown', onPointerDown, true);
    global.addEventListener('mousedown', onPointerDown, true);
    global.addEventListener('click', onClick, true);
    global.addEventListener('auxclick', onAuxClick, true);
    document.addEventListener('keydown', onKey);
    observe();
  }

  bootstrap();
  if (global.AJS && global.AJS.toInit) global.AJS.toInit(bootstrap);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
})(window);
