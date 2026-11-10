// v1 pages: where the site root is from this page ("" or "../"), for search.js and chatbot.js.
// Read from this tag's data-prefix, so the page needs no inline script (the site's
// Content-Security-Policy allows scripts from files on this site only).
window.HLIX_PREFIX = (document.currentScript && document.currentScript.getAttribute("data-prefix")) || "";
