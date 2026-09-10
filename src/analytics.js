// The public Google tag ID is supplied at build time. Missing configuration
// leaves analytics completely inactive, including its external script.
let initialized = false;

export function initAnalytics() {
  const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
  if (initialized || !import.meta.env.PROD || !/^G-[A-Z0-9]+$/.test(measurementId)
    || typeof window === 'undefined') return false;

  const { location, navigator, document } = window;
  if (location.origin !== 'https://smithmw7.github.io'
    || !['/rock-lab', '/rock-lab/', '/rock-lab/index.html'].includes(location.pathname)
    || navigator.webdriver
    || new URLSearchParams(location.search).get('analytics') === '0'
    || window[`ga-disable-${measurementId}`] === true) return false;

  initialized = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // Config sends the initial page view. No separate page-view or action events.
  window.gtag('config', measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
  return true;
}

initAnalytics();
