// PatchLedger interface motion.
//
// Reveal-on-scroll for the page's own sections and the hero's scroll fade.
// Purely presentational: it only adds classes to existing elements. With
// reduced motion everything is visible immediately and nothing animates.

export function initMotion() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealables = document.querySelectorAll('.review-desk, .technical, .hero-copy, .intake, footer');
  if (reduced) {
    for (const n of revealables) n.classList.add('in');
    return;
  }
  for (const n of revealables) n.classList.add('reveal');
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }
  }, { threshold: 0.06 });
  for (const n of revealables) io.observe(n);

  // Hero content drifts up and fades as the scene dollies past it.
  const hero = document.querySelector('.hero');
  const copy = document.querySelector('.hero-copy');
  const cue = document.querySelector('.scroll-cue');
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const t = Math.min(1, Math.max(0, scrollY / Math.max(1, hero.offsetHeight * 0.8)));
      copy.style.opacity = String(1 - t * 1.15);
      copy.style.transform = `translateY(${t * -46}px)`;
      if (cue) cue.style.opacity = String(Math.max(0, 1 - t * 3));
    });
  }, { passive: true });
}
