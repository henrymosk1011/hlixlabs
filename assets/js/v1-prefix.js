// v1 pages: where the v1 pages are served ("/v1/"), for search.js and chatbot.js to link to
// products. Root-absolute, because /v1/ is served as /v1 (vercel.json drops trailing slashes),
// where a relative link would resolve against the site root.
// Read from this tag's data-prefix, so the page needs no inline script (the site's
// Content-Security-Policy allows scripts from files on this site only).
window.HLIX_PREFIX = (document.currentScript && document.currentScript.getAttribute("data-prefix")) || "";
