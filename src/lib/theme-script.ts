/**
 * The dark-mode bootstrap, inlined in <head> so the stored choice is applied
 * before first paint (no flash of the wrong theme).
 *
 * It lives in its own module because astro.config.ts hashes this exact string for
 * the Content-Security-Policy: Astro only hashes the scripts it processes itself,
 * and an `is:inline` script would otherwise be blocked in production.
 */
export const themeScript =
  `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t}}catch(e){}`;
