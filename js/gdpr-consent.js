/**
 * GDPR & EU ePrivacy Directive Compliant Cookie Consent Manager
 * Fully integrated with Google Consent Mode v2 (Analytics & AdSense)
 * Supports English, German (DSGVO), and Bengali.
 */
(function() {
  'use strict';

  if (window.__GDPR_CONSENT_INITIALIZED__) return;
  window.__GDPR_CONSENT_INITIALIZED__ = true;

  // Configuration & Defaults
  const config = Object.assign({
    storageKey: 'gdpr_consent_preferences_v2',
    privacyUrl: 'privacy.html',
    position: 'bottom', // 'bottom'
    floatingBadge: true,
    floatingPosition: 'bottom-left', // 'bottom-left' or 'bottom-right'
    theme: 'auto', // 'auto', 'dark', 'light'
    gaMeasurementId: null,
    onConsentUpdate: null
  }, window.GDPR_CONSENT_CONFIG || {});

  // Internationalization Dictionary
  const translations = {
    en: {
      bannerTitle: '🍪 We value your privacy',
      bannerText: 'We and our trusted partners use cookies and similar technologies to enhance site navigation, analyze site usage, and deliver personalized advertisements in accordance with the European General Data Protection Regulation (GDPR). Read our <a href="{privacyUrl}" class="gdpr-link" target="_blank" rel="noopener">Privacy Policy</a> to learn more.',
      acceptAll: 'Accept All',
      rejectNonEssential: 'Essential Only',
      customize: 'Customize',
      modalTitle: 'Cookie & Privacy Preferences',
      modalSubtitle: 'Under European GDPR regulations, you can choose which cookie categories you allow. Strictly necessary cookies cannot be disabled as they are required for the website to function.',
      savePreferences: 'Save Preferences',
      alwaysActive: 'Always Active',
      necessaryTitle: 'Strictly Necessary Cookies',
      necessaryDesc: 'Essential for website navigation, security, session management, and core features. These do not store personal identification information.',
      analyticsTitle: 'Analytics & Performance Cookies',
      analyticsDesc: 'Help us understand how visitors interact with our website, monitor performance, and improve user experience via aggregated, anonymous statistics (Google Analytics).',
      marketingTitle: 'Marketing & Advertising Cookies',
      marketingDesc: 'Used by advertising partners (including Google AdSense) to deliver relevant, personalized advertisements based on your browsing interests and measure ad effectiveness.',
      badgeTooltip: 'Cookie Settings',
      toastSaved: 'Cookie preferences saved successfully.'
    },
    de: {
      bannerTitle: '🍪 Wir schätzen Ihre Privatsphäre',
      bannerText: 'Wir und unsere vertrauenswürdigen Partner verwenden Cookies und ähnliche Technologien zur Verbesserung der Website-Navigation, Nutzungsanalyse und Anzeige relevanter Werbung gemäß der europäischen Datenschutz-Grundverordnung (DSGVO) und dem TDDDG. Weitere Informationen finden Sie in unserer <a href="{privacyUrl}" class="gdpr-link" target="_blank" rel="noopener">Datenschutzerklärung</a>.',
      acceptAll: 'Alle akzeptieren',
      rejectNonEssential: 'Nur essenzielle',
      customize: 'Einstellungen',
      modalTitle: 'Cookie- & Datenschutzeinstellungen',
      modalSubtitle: 'Gemäß der europäischen DSGVO können Sie entscheiden, welche Cookies Sie zulassen möchten. Technisch notwendige Cookies können nicht deaktiviert werden.',
      savePreferences: 'Auswahl speichern',
      alwaysActive: 'Immer aktiv',
      necessaryTitle: 'Technisch notwendige Cookies',
      necessaryDesc: 'Erforderlich für die grundlegende Funktionsweise der Website, IT-Sicherheit und Sitzungsverwaltung.',
      analyticsTitle: 'Analyse- & Statistik-Cookies',
      analyticsDesc: 'Ermöglichen es uns, die Website-Nutzung anonymisiert zu analysieren, um Leistung und Inhalt zu optimieren (z. B. Google Analytics).',
      marketingTitle: 'Marketing- & Werbe-Cookies',
      marketingDesc: 'Werden von Werbepartnern (einschließlich Google AdSense) verwendet, um personalisierte Anzeigen bereitzustellen und den Werbeerfolg zu messen.',
      badgeTooltip: 'Cookie-Einstellungen',
      toastSaved: 'Cookie-Einstellungen erfolgreich gespeichert.'
    },
    bn: {
      bannerTitle: '🍪 আপনার গোপনীয়তা আমাদের কাছে গুরুত্বপূর্ণ',
      bannerText: 'আমরা এবং আমাদের অনুমোদিত পার্টনাররা সাইটের কার্যকারিতা বৃদ্ধি, ভিজিটর ট্রাফিক বিশ্লেষণ এবং প্রাসঙ্গিক বিজ্ঞাপন পরিবেশনের জন্য কুকিজ ব্যবহার করি। বিস্তারিত জানতে আমাদের <a href="{privacyUrl}" class="gdpr-link" target="_blank" rel="noopener">গোপনীয়তা নীতি (Privacy Policy)</a> দেখুন।',
      acceptAll: 'সবগুলো গ্রহণ করুন',
      rejectNonEssential: 'শুধু প্রয়োজনীয় (Essential)',
      customize: 'কুকি সেটিংস',
      modalTitle: 'কুকিজ ও গোপনীয়তা পছন্দসমূহ',
      modalSubtitle: 'ইউরোপীয় জিডিপিআর (GDPR) নিয়ম অনুযায়ী আপনি কোন ধরণের কুকিজ চালু রাখতে চান তা নির্ধারণ করতে পারেন। প্রয়োজনীয় কুকিজ সাইটের সুরক্ষার স্বার্থে বন্ধ করা যায় না।',
      savePreferences: 'পছন্দ সংরক্ষণ করুন',
      alwaysActive: 'সবসময় সক্রিয়',
      necessaryTitle: 'অপরিহার্য বা প্রয়োজনীয় কুকিজ',
      necessaryDesc: 'ওয়েবসাইটের নিরাপত্তা, সেশন হ্যান্ডলিং এবং মৌলিক কার্যাবলীর জন্য অপরিহার্য।',
      analyticsTitle: 'অ্যানালিটিক্স ও পারফরম্যান্স কুকিজ',
      analyticsDesc: 'ব্যবহারকারীরা কীভাবে সাইটটি ব্যবহার করছেন তা বেনামে বিশ্লেষণ করে সাইটের মান উন্নত করতে সাহায্য করে (Google Analytics)।',
      marketingTitle: 'বিজ্ঞাপন ও মার্কেটিং কুকিজ',
      marketingDesc: 'Google AdSense এবং বিজ্ঞাপন পার্টনারদের মাধ্যমে প্রাসঙ্গিক বিজ্ঞাপন প্রদর্শনের জন্য ব্যবহৃত হয়।',
      badgeTooltip: 'কুকি সেটিংস',
      toastSaved: 'আপনার কুকি পছন্দ সফলভাবে সংরক্ষিত হয়েছে।'
    }
  };

  // Determine current language
  function detectLanguage() {
    if (config.lang && translations[config.lang]) return config.lang;
    const docLang = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
    if (translations[docLang]) return docLang;
    return 'en';
  }

  const lang = detectLanguage();
  const t = translations[lang] || translations.en;

  // Initialize Google Consent Mode v2 Default Signals immediately
  function initGoogleConsentModeDefault() {
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function() { window.dataLayer.push(arguments); };
    }

    const saved = getStoredConsent();
    if (saved) {
      // Existing choice already made
      window.gtag('consent', 'default', {
        'analytics_storage': saved.analytics ? 'granted' : 'denied',
        'ad_storage': saved.marketing ? 'granted' : 'denied',
        'ad_user_data': saved.marketing ? 'granted' : 'denied',
        'ad_personalization': saved.marketing ? 'granted' : 'denied',
        'functionality_storage': 'granted',
        'security_storage': 'granted',
        'wait_for_update': 500
      });
    } else {
      // Strict GDPR: Denied by default before consent is affirmatively granted
      window.gtag('consent', 'default', {
        'analytics_storage': 'denied',
        'ad_storage': 'denied',
        'ad_user_data': 'denied',
        'ad_personalization': 'denied',
        'functionality_storage': 'granted',
        'security_storage': 'granted',
        'wait_for_update': 500
      });
    }
  }

  // Update Google Consent Mode v2 Signals
  function updateGoogleConsent(analyticsGranted, marketingGranted) {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        'analytics_storage': analyticsGranted ? 'granted' : 'denied',
        'ad_storage': marketingGranted ? 'granted' : 'denied',
        'ad_user_data': marketingGranted ? 'granted' : 'denied',
        'ad_personalization': marketingGranted ? 'granted' : 'denied'
      });
    }

    // Microsoft Clarity integration if present
    if (typeof window.clarity === 'function') {
      try {
        window.clarity('consentv2', {
          ad_Storage: marketingGranted ? 'granted' : 'denied',
          analytics_Storage: analyticsGranted ? 'granted' : 'denied'
        });
        window.clarity('consent', analyticsGranted);
      } catch (e) {}
    }

    // Google Analytics disable flag if configured
    if (config.gaMeasurementId && !analyticsGranted) {
      window['ga-disable-' + config.gaMeasurementId] = true;
    } else if (config.gaMeasurementId && analyticsGranted) {
      window['ga-disable-' + config.gaMeasurementId] = false;
    }
  }

  // Get Stored Consent
  function getStoredConsent() {
    try {
      const data = localStorage.getItem(config.storageKey);
      if (data) {
        return JSON.parse(data);
      }
      // Check legacy keys for backward-compatibility
      const legacyKeys = ['cookie_consent', 'ats_cookie_consent', 'tnw_cookie_consent', 'alisa_cookie_consent', 'livesportsCookieConsent'];
      for (const k of legacyKeys) {
        const val = localStorage.getItem(k);
        if (val === 'accepted' || val === 'all') {
          return { necessary: true, analytics: true, marketing: true, timestamp: Date.now() };
        } else if (val === 'essential' || val === 'essential_only' || val === 'declined') {
          return { necessary: true, analytics: false, marketing: false, timestamp: Date.now() };
        }
      }
    } catch (e) {}
    return null;
  }

  // Save Consent Preferences
  function saveConsent(analytics, marketing) {
    const consentObj = {
      necessary: true,
      analytics: Boolean(analytics),
      marketing: Boolean(marketing),
      timestamp: new Date().toISOString(),
      version: '2.0'
    };

    try {
      localStorage.setItem(config.storageKey, JSON.stringify(consentObj));
      // Also write legacy flags to ensure any custom site scripts continue working
      localStorage.setItem('cookie_consent', (analytics && marketing) ? 'accepted' : 'essential_only');
      localStorage.setItem('ats_cookie_consent', (analytics && marketing) ? 'accepted' : 'declined');
      localStorage.setItem('tnw_cookie_consent', (analytics && marketing) ? 'accepted' : 'essential');
      localStorage.setItem('alisa_cookie_consent', (analytics && marketing) ? 'accepted' : 'declined');
      localStorage.setItem('livesportsCookieConsent', (analytics && marketing) ? 'accepted' : 'essential');
    } catch (e) {}

    updateGoogleConsent(consentObj.analytics, consentObj.marketing);

    // Notify any listeners
    window.dispatchEvent(new CustomEvent('gdprConsentUpdated', { detail: consentObj }));
    if (typeof config.onConsentUpdate === 'function') {
      config.onConsentUpdate(consentObj);
    }

    hideBanner();
    hideModal();
    showToast(t.toastSaved);
  }

  // Inject Self-Contained Stylesheet
  function injectStyles() {
    if (document.getElementById('gdpr-consent-styles')) return;
    const style = document.createElement('style');
    style.id = 'gdpr-consent-styles';
    style.textContent = `
      :root {
        --gdpr-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        --gdpr-bg: #0f172a;
        --gdpr-surface: #1e293b;
        --gdpr-surface-hover: #334155;
        --gdpr-text: #f8fafc;
        --gdpr-text-muted: #94a3b8;
        --gdpr-border: rgba(255, 255, 255, 0.12);
        --gdpr-primary: #3b82f6;
        --gdpr-primary-hover: #2563eb;
        --gdpr-primary-text: #ffffff;
        --gdpr-success: #10b981;
        --gdpr-radius: 12px;
        --gdpr-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
      }

      /* Light mode support if requested or if document is light theme */
      [data-theme="light"] {
        --gdpr-bg: #ffffff;
        --gdpr-surface: #f1f5f9;
        --gdpr-surface-hover: #e2e8f0;
        --gdpr-text: #0f172a;
        --gdpr-text-muted: #64748b;
        --gdpr-border: rgba(0, 0, 0, 0.1);
        --gdpr-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.08);
      }

      /* Bottom Consent Banner */
      .gdpr-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 999998;
        padding: 16px;
        background: var(--gdpr-bg);
        border-top: 1px solid var(--gdpr-border);
        box-shadow: var(--gdpr-shadow);
        font-family: var(--gdpr-font);
        color: var(--gdpr-text);
        animation: gdprSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        display: none;
      }
      .gdpr-banner.gdpr-active {
        display: block;
      }
      .gdpr-banner-container {
        max-width: 1240px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      @media (min-width: 860px) {
        .gdpr-banner-container {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
      }
      .gdpr-banner-text {
        flex: 1;
        font-size: 0.88rem;
        line-height: 1.55;
        color: var(--gdpr-text-muted);
      }
      .gdpr-banner-text strong {
        color: var(--gdpr-text);
        font-size: 0.98rem;
        display: block;
        margin-bottom: 4px;
      }
      .gdpr-link {
        color: var(--gdpr-primary);
        text-decoration: underline;
        font-weight: 500;
        transition: opacity 0.2s;
      }
      .gdpr-link:hover {
        opacity: 0.85;
      }
      .gdpr-banner-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      @media (max-width: 600px) {
        .gdpr-banner-actions {
          width: 100%;
        }
        .gdpr-banner-actions .gdpr-btn {
          flex: 1;
          text-align: center;
          justify-content: center;
        }
      }

      /* Buttons */
      .gdpr-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 9px 18px;
        border-radius: 8px;
        font-size: 0.86rem;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.2s ease;
        text-decoration: none;
        outline: none;
        font-family: inherit;
        white-space: nowrap;
      }
      .gdpr-btn:focus-visible {
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4);
      }
      .gdpr-btn-primary {
        background: var(--gdpr-primary);
        color: var(--gdpr-primary-text);
        border-color: var(--gdpr-primary);
      }
      .gdpr-btn-primary:hover {
        background: var(--gdpr-primary-hover);
        border-color: var(--gdpr-primary-hover);
        transform: translateY(-1px);
      }
      .gdpr-btn-secondary {
        background: var(--gdpr-surface);
        color: var(--gdpr-text);
        border-color: var(--gdpr-border);
      }
      .gdpr-btn-secondary:hover {
        background: var(--gdpr-surface-hover);
        color: #ffffff;
      }
      .gdpr-btn-outline {
        background: transparent;
        color: var(--gdpr-text-muted);
        border-color: var(--gdpr-border);
      }
      .gdpr-btn-outline:hover {
        color: var(--gdpr-text);
        background: var(--gdpr-surface);
      }

      /* Preferences Modal Backdrop */
      .gdpr-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.25s ease, visibility 0.25s ease;
        font-family: var(--gdpr-font);
      }
      .gdpr-modal-backdrop.gdpr-active {
        opacity: 1;
        visibility: visible;
      }
      .gdpr-modal {
        background: var(--gdpr-bg);
        border: 1px solid var(--gdpr-border);
        box-shadow: var(--gdpr-shadow);
        border-radius: var(--gdpr-radius);
        max-width: 620px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        color: var(--gdpr-text);
        transform: scale(0.95);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }
      .gdpr-modal-backdrop.gdpr-active .gdpr-modal {
        transform: scale(1);
      }
      .gdpr-modal-header {
        padding: 20px 24px;
        border-bottom: 1px solid var(--gdpr-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .gdpr-modal-title {
        font-size: 1.15rem;
        font-weight: 700;
        margin: 0;
        color: var(--gdpr-text);
      }
      .gdpr-modal-close {
        background: transparent;
        border: none;
        color: var(--gdpr-text-muted);
        font-size: 1.4rem;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        line-height: 1;
        transition: color 0.2s;
      }
      .gdpr-modal-close:hover {
        color: var(--gdpr-text);
        background: var(--gdpr-surface);
      }
      .gdpr-modal-body {
        padding: 20px 24px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .gdpr-modal-desc {
        font-size: 0.85rem;
        color: var(--gdpr-text-muted);
        line-height: 1.5;
        margin: 0;
      }
      .gdpr-category {
        background: var(--gdpr-surface);
        border: 1px solid var(--gdpr-border);
        border-radius: 10px;
        padding: 16px;
      }
      .gdpr-category-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .gdpr-category-name {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--gdpr-text);
      }
      .gdpr-category-badge {
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        background: rgba(16, 185, 129, 0.15);
        color: var(--gdpr-success);
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid rgba(16, 185, 129, 0.3);
      }
      .gdpr-category-desc {
        font-size: 0.82rem;
        color: var(--gdpr-text-muted);
        line-height: 1.5;
        margin: 0;
      }

      /* Switch Toggle */
      .gdpr-switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
      }
      .gdpr-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .gdpr-slider {
        position: absolute;
        cursor: pointer;
        inset: 0;
        background-color: #475569;
        transition: 0.25s ease;
        border-radius: 24px;
      }
      .gdpr-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: 0.25s ease;
        border-radius: 50%;
      }
      input:checked + .gdpr-slider {
        background-color: var(--gdpr-primary);
      }
      input:focus-visible + .gdpr-slider {
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4);
      }
      input:checked + .gdpr-slider:before {
        transform: translateX(20px);
      }

      .gdpr-modal-footer {
        padding: 16px 24px;
        border-top: 1px solid var(--gdpr-border);
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }

      /* Floating Revoke Button (GDPR Art 7(3)) */
      .gdpr-badge {
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 999990;
        background: var(--gdpr-surface);
        color: var(--gdpr-text);
        border: 1px solid var(--gdpr-border);
        box-shadow: var(--gdpr-shadow);
        border-radius: 999px;
        padding: 8px 14px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--gdpr-font);
        transition: all 0.25s ease;
        opacity: 0.85;
      }
      .gdpr-badge:hover {
        opacity: 1;
        transform: scale(1.05);
        background: var(--gdpr-surface-hover);
      }
      .gdpr-badge-right {
        left: auto;
        right: 20px;
      }

      /* Notification Toast */
      .gdpr-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(50px);
        background: #10b981;
        color: #ffffff;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: 600;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        z-index: 1000000;
        opacity: 0;
        pointer-events: none;
        transition: transform 0.3s ease, opacity 0.3s ease;
        font-family: var(--gdpr-font);
      }
      .gdpr-toast.gdpr-active {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      @keyframes gdprSlideUp {
        from {
          transform: translateY(100%);
        }
        to {
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Build DOM Elements
  function createElements() {
    injectStyles();

    // 1. Consent Banner
    const banner = document.createElement('div');
    banner.id = 'gdpr-consent-banner';
    banner.className = 'gdpr-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', t.bannerTitle);

    const bannerText = t.bannerText.replace('{privacyUrl}', config.privacyUrl);

    banner.innerHTML = `
      <div class="gdpr-banner-container">
        <div class="gdpr-banner-text">
          <strong>${t.bannerTitle}</strong>
          <div>${bannerText}</div>
        </div>
        <div class="gdpr-banner-actions">
          <button type="button" class="gdpr-btn gdpr-btn-outline" id="gdpr-btn-customize">${t.customize}</button>
          <button type="button" class="gdpr-btn gdpr-btn-secondary" id="gdpr-btn-reject">${t.rejectNonEssential}</button>
          <button type="button" class="gdpr-btn gdpr-btn-primary" id="gdpr-btn-accept-all">${t.acceptAll}</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);

    // 2. Preferences Modal
    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'gdpr-preferences-modal';
    modalBackdrop.className = 'gdpr-modal-backdrop';
    modalBackdrop.setAttribute('role', 'dialog');
    modalBackdrop.setAttribute('aria-modal', 'true');
    modalBackdrop.setAttribute('aria-labelledby', 'gdpr-modal-title');

    modalBackdrop.innerHTML = `
      <div class="gdpr-modal">
        <div class="gdpr-modal-header">
          <h2 class="gdpr-modal-title" id="gdpr-modal-title">${t.modalTitle}</h2>
          <button type="button" class="gdpr-modal-close" id="gdpr-modal-close" aria-label="Close dialog">&times;</button>
        </div>
        <div class="gdpr-modal-body">
          <p class="gdpr-modal-desc">${t.modalSubtitle}</p>
          
          <!-- Category 1: Strictly Necessary -->
          <div class="gdpr-category">
            <div class="gdpr-category-header">
              <span class="gdpr-category-name">${t.necessaryTitle}</span>
              <span class="gdpr-category-badge">${t.alwaysActive}</span>
            </div>
            <p class="gdpr-category-desc">${t.necessaryDesc}</p>
          </div>

          <!-- Category 2: Analytics & Performance -->
          <div class="gdpr-category">
            <div class="gdpr-category-header">
              <span class="gdpr-category-name">${t.analyticsTitle}</span>
              <label class="gdpr-switch" aria-label="${t.analyticsTitle}">
                <input type="checkbox" id="gdpr-toggle-analytics">
                <span class="gdpr-slider"></span>
              </label>
            </div>
            <p class="gdpr-category-desc">${t.analyticsDesc}</p>
          </div>

          <!-- Category 3: Marketing & Advertising -->
          <div class="gdpr-category">
            <div class="gdpr-category-header">
              <span class="gdpr-category-name">${t.marketingTitle}</span>
              <label class="gdpr-switch" aria-label="${t.marketingTitle}">
                <input type="checkbox" id="gdpr-toggle-marketing">
                <span class="gdpr-slider"></span>
              </label>
            </div>
            <p class="gdpr-category-desc">${t.marketingDesc}</p>
          </div>
        </div>
        <div class="gdpr-modal-footer">
          <button type="button" class="gdpr-btn gdpr-btn-secondary" id="gdpr-modal-save">${t.savePreferences}</button>
          <button type="button" class="gdpr-btn gdpr-btn-primary" id="gdpr-modal-accept-all">${t.acceptAll}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalBackdrop);

    // 3. Floating Reopen Badge (GDPR Article 7(3) - easy revocation of consent)
    if (config.floatingBadge) {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.id = 'gdpr-floating-badge';
      badge.className = 'gdpr-badge' + (config.floatingPosition === 'bottom-right' ? ' gdpr-badge-right' : '');
      badge.setAttribute('aria-label', t.badgeTooltip);
      badge.title = t.badgeTooltip;
      badge.innerHTML = `<span>🍪</span> <span>${t.badgeTooltip}</span>`;
      document.body.appendChild(badge);

      badge.addEventListener('click', function() {
        showModal();
      });
    }

    // 4. Notification Toast
    const toast = document.createElement('div');
    toast.id = 'gdpr-toast';
    toast.className = 'gdpr-toast';
    document.body.appendChild(toast);

    bindEvents();
  }

  function showBanner() {
    const banner = document.getElementById('gdpr-consent-banner');
    if (banner) banner.classList.add('gdpr-active');
  }

  function hideBanner() {
    const banner = document.getElementById('gdpr-consent-banner');
    if (banner) banner.classList.remove('gdpr-active');
  }

  function showModal() {
    const modal = document.getElementById('gdpr-preferences-modal');
    if (!modal) return;
    
    // Sync current toggle values
    const current = getStoredConsent() || { analytics: false, marketing: false };
    const aToggle = document.getElementById('gdpr-toggle-analytics');
    const mToggle = document.getElementById('gdpr-toggle-marketing');
    if (aToggle) aToggle.checked = Boolean(current.analytics);
    if (mToggle) mToggle.checked = Boolean(current.marketing);

    modal.classList.add('gdpr-active');
  }

  function hideModal() {
    const modal = document.getElementById('gdpr-preferences-modal');
    if (modal) modal.classList.remove('gdpr-active');
  }

  function showToast(msg) {
    const toast = document.getElementById('gdpr-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('gdpr-active');
    setTimeout(() => {
      toast.classList.remove('gdpr-active');
    }, 3200);
  }

  function bindEvents() {
    // Banner buttons
    const btnAccept = document.getElementById('gdpr-btn-accept-all');
    const btnReject = document.getElementById('gdpr-btn-reject');
    const btnCustomize = document.getElementById('gdpr-btn-customize');

    if (btnAccept) {
      btnAccept.addEventListener('click', () => saveConsent(true, true));
    }
    if (btnReject) {
      btnReject.addEventListener('click', () => saveConsent(false, false));
    }
    if (btnCustomize) {
      btnCustomize.addEventListener('click', () => {
        hideBanner();
        showModal();
      });
    }

    // Modal buttons
    const btnModalClose = document.getElementById('gdpr-modal-close');
    const btnModalSave = document.getElementById('gdpr-modal-save');
    const btnModalAcceptAll = document.getElementById('gdpr-modal-accept-all');

    if (btnModalClose) {
      btnModalClose.addEventListener('click', hideModal);
    }
    if (btnModalSave) {
      btnModalSave.addEventListener('click', () => {
        const aVal = document.getElementById('gdpr-toggle-analytics')?.checked;
        const mVal = document.getElementById('gdpr-toggle-marketing')?.checked;
        saveConsent(aVal, mVal);
      });
    }
    if (btnModalAcceptAll) {
      btnModalAcceptAll.addEventListener('click', () => saveConsent(true, true));
    }

    // Close modal on backdrop click
    const backdrop = document.getElementById('gdpr-preferences-modal');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) hideModal();
      });
    }

    // Intercept any external trigger clicks (e.g. footer links with [data-open-cookie-settings] or #manageCookiesBtn)
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-open-cookie-settings], #manageCookiesBtn, #cookie-settings-btn, a[href="#cookie-settings"], a[href="#cookies"]');
      if (trigger) {
        e.preventDefault();
        showModal();
      }
    });

    // ESC key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideModal();
    });
  }

  // Initialize Default Consent Mode v2 right away
  initGoogleConsentModeDefault();

  // On DOM Ready: create UI and display if no consent yet
  function initUI() {
    createElements();
    const existingConsent = getStoredConsent();
    if (!existingConsent) {
      setTimeout(showBanner, 600);
    } else {
      // Apply existing consent to Google Consent Mode
      updateGoogleConsent(existingConsent.analytics, existingConsent.marketing);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  // Expose public API
  window.GDPRConsent = {
    showBanner: showBanner,
    showModal: showModal,
    hideModal: hideModal,
    getPreferences: getStoredConsent,
    acceptAll: () => saveConsent(true, true),
    rejectNonEssential: () => saveConsent(false, false),
    savePreferences: saveConsent
  };
})();
