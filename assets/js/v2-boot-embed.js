// hlix — the planner embed's first script (planner-embed.html, framed by the admin's Calendar):
// motion settings and the number tween. A file rather than an inline script, so the
// Content-Security-Policy can allow scripts from this site only.
(function(){var h=document.documentElement;h.classList.add("js");var reduce=/[?&]motion=off/.test(location.search)||(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);if(reduce)h.classList.add("no-motion");
// numbers that count to their new value (the planner's tween; the site's v2.js isn't loaded here)
function tween(a,b,d,u,done){if(reduce||d<=0||a===b){u(b);if(done)done();return;}var t0=null,end=false;function fin(){if(end)return;end=true;u(b);if(done)done();}function step(t){if(end)return;if(t0===null)t0=t;var p=Math.min(1,(t-t0)/d),e=p===1?1:1-Math.pow(2,-10*p);u(a+(b-a)*e);if(p<1)requestAnimationFrame(step);else fin();}requestAnimationFrame(step);setTimeout(fin,d+80);}
window.HLIX2={base:"",tween:tween};})();
