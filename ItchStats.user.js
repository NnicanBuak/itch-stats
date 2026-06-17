// ==UserScript==
// @name         itch.io stats
// @namespace    https://itch.io/
// @version      6.2.3
// @description  Ищет свои игры в списках itch.io, сохраняет позиции, показывает статистику и пассивно подсвечивает найденные игры
// @match        https://itch.io/*
// @match        https://*.itch.io/*
// @author       Nnican
// @license      MIT
// @tag          utilities
// @homepageURL  https://github.com/NnicanBuak/itch-stats
// @grant        none
// @updateURL    https://github.com/NnicanBuak/itch-stats/raw/refs/heads/main/ItchStats.user.js
// @downloadURL  https://github.com/NnicanBuak/itch-stats/raw/refs/heads/main/ItchStats.user.js
// @icon         https://itch.io/favicon.ico
// ==/UserScript==

(function () {
  'use strict';

  const SCROLL_INTERVAL = 170;
  const SCROLL_STEP = 1180;
  const SCROLL_BURST_STEP_FACTOR = 1.18;
  const SCROLL_BURST_COUNT = 4;
  const SCROLL_BURST_PAUSE = 85;
  const DEFAULT_PAGE_SIZE = 36;
  const MAX_SEARCH_PAGE = 30;
  const SEARCH_SERIES = [
    { key: 'popular', label: 'Popular', pathPart: '' },
    { key: 'new-and-popular', label: 'New & Popular', pathPart: 'new-and-popular' },
    { key: 'newest', label: 'Newest', pathPart: 'newest' },
    { key: 'top-sellers', label: 'Top Sellers', pathPart: 'top-sellers' },
    { key: 'top-rated', label: 'Top Rated', pathPart: 'top-rated' }
  ];
  const ANALYTICS_SERIES = SEARCH_SERIES.filter(item => item.key !== 'newest');
  const FILTER_SECTION_DEFINITIONS = [
    { key: 'platforms', type: 'platform', title: 'Платформы', selection: 'single' },
    { key: 'genres', type: 'genre', title: 'Жанры', selection: 'single' },
    { key: 'tags', type: 'tag', title: 'Теги', selection: 'multi' },
    { key: 'price', type: 'price', title: 'Price', selection: 'price' },
    { key: 'type', type: 'type', title: 'Type', selection: 'single' },
    { key: 'misc', type: 'misc', title: 'Misc', selection: 'multi' },
    { key: 'session_length', type: 'session_length', title: 'Average session length', selection: 'single' },
    { key: 'multiplayer', type: 'multiplayer', title: 'Multiplayer', selection: 'single' },
    { key: 'languages', type: 'language', title: 'Languages', selection: 'multi' }
  ];
  const FILTER_SECTION_LABEL_ALIASES = {
    genres: ['genre', 'genres'],
    platforms: ['platform', 'platforms'],
    tags: ['tag', 'tags'],
    price: ['price'],
    type: ['type'],
    misc: ['misc'],
    session_length: ['average session length', 'session length', 'duration'],
    multiplayer: ['multiplayer features', 'multiplayer'],
    languages: ['languages', 'language']
  };
  const FILTER_LABEL_TO_TOKEN = {
    price: {
      free: 'free',
      'on sale': 'on-sale',
      paid: 'paid',
      '$5 or less': '5-dollars-or-less',
      '$15 or less': '15-dollars-or-less'
    },
    type: {
      html5: 'html5',
      downloadable: 'downloadable'
    },
    misc: {
      'with steam keys': 'steam-key',
      'in game jams': 'in-jam',
      'not in game jams': 'exclude-jam',
      'with demos': 'has-demo',
      featured: 'featured'
    },
    session_length: {
      'a few seconds': 'duration-seconds',
      'a few minutes': 'duration-minutes',
      'about a half-hour': 'duration-half-hour',
      'about an hour': 'duration-hour',
      'a few hours': 'duration-hours',
      'days or more': 'duration-days'
    },
    multiplayer: {
      'local multiplayer': 'local-multiplayer',
      'server-based networked multiplayer': 'multiplayer-server',
      'ad-hoc networked multiplayer': 'multiplayer-adhoc'
    },
    language: {
      english: 'lang-en',
      russian: 'lang-ru'
    }
  };
  const FILTER_DISPLAY_LABELS = {
    price: {
      free: 'Free',
      'on sale': 'On Sale',
      paid: 'Paid',
      '$5 or less': '$5 or less',
      '$15 or less': '$15 or less'
    },
    type: {
      html5: 'HTML5',
      downloadable: 'Downloadable'
    },
    misc: {
      'with steam keys': 'With Steam keys',
      'in game jams': 'In game jams',
      'not in game jams': 'Not in game jams',
      'with demos': 'With demos',
      featured: 'Featured'
    },
    session_length: {
      'a few seconds': 'A few seconds',
      'a few minutes': 'A few minutes',
      'about a half-hour': 'About a half-hour',
      'about an hour': 'About an hour',
      'a few hours': 'A few hours',
      'days or more': 'Days or more'
    },
    multiplayer: {
      'local multiplayer': 'Local multiplayer',
      'server-based networked multiplayer': 'Server-based networked multiplayer',
      'ad-hoc networked multiplayer': 'Ad-hoc networked multiplayer'
    },
    language: {
      english: 'English',
      russian: 'Russian'
    }
  };
  const FILTER_TOKEN_TO_LABEL = Object.entries(FILTER_LABEL_TO_TOKEN).reduce((acc, [type, entries]) => {
    acc[type] = Object.entries(entries).reduce((bucket, [label, token]) => {
      bucket[normalize(token)] = label;
      return bucket;
    }, {});
    return acc;
  }, {});

  const STORAGE_KEY_GAMES = 'tm_itch_dashboard_published_games_v4';
  const STORAGE_KEY_COLLAPSED = 'tm_itch_finder_collapsed_v4';
  const STORAGE_KEY_POSITIONS = 'tm_itch_game_positions_v4';
  const STORAGE_KEY_GAME_META = 'tm_itch_game_meta_v4';
  const STORAGE_KEY_SUMMARY_SECTIONS = 'tm_itch_summary_sections_v1';
  const STORAGE_KEY_SUMMARY_COLLAPSED = 'tm_itch_summary_collapsed_v1';
  const STORAGE_KEY_SUMMARY_SERIES = 'tm_itch_summary_series_v1';
  const STORAGE_KEY_SUMMARY_CHART_PREFS = 'tm_itch_summary_chart_prefs_v1';
  const STORAGE_KEY_INTERSECTIONS = 'tm_itch_summary_intersections_v1';
  const STORAGE_KEY_REFRESH_STATE = 'tm_itch_refresh_state_v1';
  const STORAGE_KEY_REFRESH_REDIRECT_GUARD = 'tm_itch_refresh_redirect_guard_v1';
  const EXPORT_SCHEMA_VERSION = 1;
  const REFRESH_STATE_MAX_AGE = 15 * 60 * 1000;
  const WINDOW_NAME_TRANSFER_PREFIX = 'tm_itch_transfer_v1:';

  let searching = false;
  let pausedByHiddenTab = false;
  let targetGame = null;
  let targetText = '';
  let refreshAutostarted = false;
  let transferredPayload = null;
  let summaryReminderShown = false;
  let lastLoadedPage = null;
  let lastNumItems = DEFAULT_PAGE_SIZE;
  let dashboardGames = [];

  const passiveHighlighted = new WeakSet();
  const confettiPlayed = new WeakSet();
  const tiltInstalled = new WeakSet();
  const foundInfoByCard = new WeakMap();

  const path = location.pathname;
  const isGamesPage = path === '/games' || path.startsWith('/games/');
  const isDashboardPage = path === '/dashboard';
  const isSummaryPage = path.startsWith('/game/summary/');
  const isPublicGamePage = path !== '/dashboard' && !isGamesPage && !!document.querySelector('[id^="view_html_game_"]');

  function getSeriesConfig(seriesKey) {
    return SEARCH_SERIES.find(item => item.key === seriesKey) || SEARCH_SERIES[0];
  }

  function getSeriesLabel(seriesKey) {
    return getSeriesConfig(seriesKey).label;
  }

  function getSeriesPathPart(seriesKey) {
    return getSeriesConfig(seriesKey).pathPart;
  }

  function isKnownSeriesKey(seriesKey) {
    return SEARCH_SERIES.some(item => item.key === seriesKey);
  }

  function isKnownSeriesPathPart(part) {
    const wanted = normalize(part);
    return SEARCH_SERIES.some(item => normalize(item.pathPart) === wanted);
  }

  function getSeriesOrder(seriesKey) {
    const index = ANALYTICS_SERIES.findIndex(item => item.key === seriesKey);
    return index >= 0 ? index : 999;
  }

  function getDefaultSummarySeriesState() {
    return ANALYTICS_SERIES.reduce((acc, item) => {
      acc[item.key] = true;
      return acc;
    }, {});
  }

  function getFilterSectionConfigs() {
    return FILTER_SECTION_DEFINITIONS;
  }

  function getFilterSectionConfigByKey(key) {
    return FILTER_SECTION_DEFINITIONS.find(item => item.key === key) || null;
  }

  function getFilterSectionConfigByType(type) {
    return FILTER_SECTION_DEFINITIONS.find(item => item.type === type) || null;
  }

  function getFilterSectionKeyByType(type) {
    return getFilterSectionConfigByType(type)?.key || '';
  }

  function getSummarySectionStorageKeys() {
    return ['default', ...getFilterSectionConfigs().map(section => section.key), 'intersections'];
  }

  function getDefaultSummarySectionState(key) {
    const normalizedKey = String(key || '').trim();
    const enabled = normalizedKey !== 'misc';
    return {
      enabled,
      collapsed: !enabled,
      chartCollapsed: !enabled
    };
  }

  function normalizeSummarySectionStateEntry(key, value) {
    const defaults = getDefaultSummarySectionState(key);

    if (typeof value === 'boolean') {
      return {
        enabled: defaults.enabled,
        collapsed: false,
        chartCollapsed: value,
        touched: true
      };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        ...defaults,
        touched: false
      };
    }

    return {
      enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.enabled,
      collapsed: false,
      chartCollapsed: typeof value.chartCollapsed === 'boolean'
        ? value.chartCollapsed
        : (typeof value.collapsed === 'boolean' ? value.collapsed : defaults.chartCollapsed),
      touched: value.touched === true
    };
  }

  function getSummarySectionStateEntry(state, key) {
    return normalizeSummarySectionStateEntry(key, state?.[key]);
  }

  function getEmptyMetaSections() {
    return FILTER_SECTION_DEFINITIONS.reduce((acc, item) => {
      acc[item.key] = {
        labels: [],
        links: []
      };
      return acc;
    }, {});
  }

  function getPriceBaseSelectionLabels() {
    return ['Free', 'Paid', '$5 or less', '$15 or less'];
  }

  function getKnownFilterLabels(type) {
    const normalizedType = normalize(type);
    if (!normalizedType) return [];

    if (normalizedType === 'platform') {
      return ['Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Web', 'Mobile Web'];
    }

    if (normalizedType === 'genre' || normalizedType === 'tag') {
      return [];
    }

    return Object.keys(FILTER_LABEL_TO_TOKEN[normalizedType] || {})
      .map(label => FILTER_DISPLAY_LABELS[normalizedType]?.[label] || label)
      .map(label => {
        const sectionKey = getFilterSectionKeyByType(normalizedType);
        return sectionKey ? normalizeSectionLabel(sectionKey, label) : String(label || '').trim();
      })
      .filter(Boolean);
  }

  const style = document.createElement('style');
  style.textContent = `
    :root {
      --tm-accent: #D36D6D;
      --tm-accent-strong: #bc5b5b;
      --tm-accent-soft: rgba(211,109,109,.28);
    }

    #tm-cloudflare-disable-warning {
      position: fixed;
      z-index: 2147483647;
      left: 50%;
      top: 32px;
      width: min(520px, calc(100vw - 32px));
      transform: translateX(-50%);
      box-sizing: border-box;
      padding: 16px 18px;
      border-radius: 8px;
      border: 1px solid rgba(211,109,109,.45);
      background: rgba(28, 24, 24, .96);
      color: #fff;
      box-shadow: 0 16px 46px rgba(0,0,0,.36);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
    }

    #tm-cloudflare-disable-warning strong {
      display: block;
      margin-bottom: 4px;
      font-size: 15px;
    }

    .tm-rainbow-found {
      animation: none !important;
      box-shadow: 0 0 0 2px #fff, 0 0 12px rgba(255,255,255,.65) !important;
      position: relative !important;
      z-index: 9998 !important;
      padding: 10px !important;
      border-radius: 12px !important;
      transform-style: preserve-3d !important;
      will-change: transform !important;
      overflow: visible !important;
    }

    .tm-rainbow-found.tm-clickable {
      cursor: pointer;
    }

    .tm-rainbow-found img,
    .tm-rainbow-found .game_thumb,
    .tm-rainbow-found .thumb_link,
    .tm-rainbow-found .game_cover,
    .tm-rainbow-found .cover,
    .tm-rainbow-found .screenshot {
      border-radius: 12px !important;
      overflow: hidden !important;
    }

    .tm-tilt-card {
      transform-style: preserve-3d !important;
      perspective: 900px !important;
      transition: transform .12s ease-out, filter .16s ease-out !important;
      will-change: transform !important;
      border-radius: 12px !important;
      position: relative !important;
    }

    .tm-tilt-card:hover {
      z-index: 9997 !important;
      filter: brightness(1.08) saturate(1.08);
    }

    .tm-tilt-sensor {
      position: absolute;
      inset: 0;
      z-index: 99999;
      pointer-events: auto;
      background: transparent;
      border-radius: inherit;
    }

    .tm-tilt-sensor-floating {
      position: fixed;
      z-index: 999999;
      pointer-events: auto;
      background: transparent;
      cursor: pointer;
    }

    .tm-stat-section-title {
      margin: 12px -12px 10px;
      padding: 12px 14px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02)),
        linear-gradient(135deg, rgba(211,109,109,.94), rgba(161,59,59,.94));
      color: #fff;
      font-size: 13px;
      font-weight: 900;
      text-align: left;
      border: 1px solid rgba(255,255,255,.16);
      border-bottom-color: rgba(255,255,255,.32);
      border-radius: 14px;
      box-shadow: 0 10px 24px rgba(0,0,0,.18);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
      user-select: none;
    }

    .tm-stat-section-title-main {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      min-width: 0;
      flex: 1 1 auto;
    }

    .tm-stat-section-title-copy {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      min-width: 0;
      flex: 1 1 auto;
    }

    .tm-stat-section-title-text {
      min-width: 0;
      font-size: 20px;
      line-height: 1;
      letter-spacing: .01em;
      text-shadow: 0 1px 0 rgba(0,0,0,.12);
    }

    .tm-stat-section-enable {
      width: 16px;
      height: 16px;
      margin: 3px 0 0;
      accent-color: #fff;
      cursor: pointer;
      flex: 0 0 auto;
    }

    .tm-stat-section {
      margin-bottom: 8px;
    }

    .tm-stat-section-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .tm-stat-section-body.tm-disabled {
      opacity: .42;
      filter: grayscale(.9);
    }

    .tm-stat-section-body.tm-disabled .tm-stat-table-wrap,
    .tm-stat-section-body.tm-disabled [data-chart-root] {
      pointer-events: none;
    }

    .tm-stat-section-body.tm-disabled .tm-stat-muted {
      opacity: .95;
    }

    .tm-stat-chart-shell {
      overflow: hidden;
      opacity: 1;
      max-height: 2000px;
      transition: max-height .28s ease, opacity .22s ease, margin-top .28s ease;
      will-change: max-height, opacity;
    }

    .tm-stat-chart-shell.tm-hidden {
      opacity: 0;
      max-height: 0;
      margin-top: -2px;
    }

    .tm-stat-section-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 999px;
      background: rgba(18,18,18,.18);
      border: 1px solid rgba(255,255,255,.24);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
      opacity: 1;
      font-size: 19px;
      font-weight: 900;
      line-height: 1;
      min-width: 32px;
      text-align: center;
      flex: 0 0 auto;
    }

    .tm-summary-root-body.tm-hidden {
      display: none;
    }

    #tm-itch-finder,
    #tm-itch-summary-stats {
      position: fixed;
      top: 64px;
      right: 16px;
      z-index: 999999;
      background: #111;
      color: white;
      border-radius: 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,.35);
      font-family: system-ui, sans-serif;
      width: 320px;
      max-height: calc(100vh - 84px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    #tm-itch-summary-stats {
      width: 980px;
      max-width: calc(100vw - 32px);
    }

    #tm-itch-summary-stats.tm-embedded {
      position: relative;
      top: auto;
      right: auto;
      z-index: auto;
      width: 100%;
      max-width: none;
      max-height: none;
      margin-top: 18px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,.18);
    }

    #tm-itch-finder.tm-collapsed {
      display: none;
    }

    #tm-itch-open-button {
      position: fixed;
      top: 64px;
      right: 16px;
      z-index: 999999;
      width: 46px;
      height: 46px;
      border: 0;
      border-radius: 12px;
      background: var(--tm-accent);
      color: #fff;
      font: 22px/1 system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 0 6px 24px rgba(0,0,0,.35);
      display: none;
    }

    #tm-itch-open-button.tm-visible {
      display: block;
    }

    .tm-widget-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex: 0 0 auto;
      padding: 12px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      background:
        linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02)),
        #111;
      cursor: grab;
      user-select: none;
    }

    #tm-itch-summary-stats.tm-embedded .tm-widget-head {
      cursor: default;
      border-bottom: 1px solid rgba(255,255,255,.12);
    }

    .tm-widget-head:active {
      cursor: grabbing;
    }

    .tm-widget-title {
      font-size: 13px;
      font-weight: 800;
      opacity: .95;
    }

    .tm-widget-scroll-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
    }

    #tm-itch-collapse,
    .tm-widget-collapse {
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 8px;
      background: var(--tm-accent-strong);
      color: #fff;
      cursor: pointer;
      font-weight: 900;
      font-size: 22px;
      line-height: 1;
    }

    #tm-itch-finder input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid #555;
      margin-bottom: 8px;
      background: #2b2b2b;
      color: #fff;
    }

    #tm-itch-search,
    .tm-small-button {
      width: 100%;
      padding: 8px;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 700;
      margin-bottom: 8px;
    }

    #tm-itch-status {
      font-size: 12px;
      opacity: .85;
      margin-bottom: 10px;
      line-height: 1.35;
      white-space: pre-line;
    }

    .tm-games-title {
      font-size: 12px;
      font-weight: 700;
      margin: 10px 0 6px;
      opacity: .9;
    }

    .tm-game-item {
      font-size: 12px;
      padding: 6px 8px;
      border-radius: 8px;
      background: #222;
      margin-bottom: 5px;
      cursor: pointer;
      line-height: 1.25;
    }

    .tm-game-item:hover {
      background: #333;
    }

    .tm-found-info {
      --tm-found-bg: linear-gradient(135deg, #242424, #171717);
      display: block;
      width: 360px;
      max-width: min(420px, calc(100vw - 40px));
      margin: 0 !important;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.12);
      color: #f3f3f3;
      font: 14px/1.35 system-ui, sans-serif;
      font-weight: 800;
      box-shadow: 0 14px 32px rgba(0,0,0,.55);
      position: absolute;
      left: 50%;
      top: calc(100% + 2rem);
      transform: translateX(-50%);
      z-index: 10010;
      box-sizing: border-box;
      clear: both;
      pointer-events: auto;
      backface-visibility: hidden;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }

    .tm-found-info.tm-clickable {
      cursor: pointer;
    }

    .tm-found-info.tm-clickable:hover {
      filter: brightness(1.04);
    }

    .tm-found-info::before,
    .tm-found-info::after {
      content: '';
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      clip-path: polygon(50% 0, 0 100%, 100% 100%);
    }

    .tm-found-info::before {
      top: -14px;
      width: 28px;
      height: 14px;
      background: rgba(255,255,255,.12);
    }

    .tm-found-info::after {
      top: -12px;
      width: 24px;
      height: 12px;
      background: var(--tm-found-bg);
    }

    .tm-found-info .tm-big-place {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 30px;
      line-height: 1.05;
      margin-bottom: 4px;
      letter-spacing: -.03em;
    }

    .tm-rank-icon {
      font-size: 28px;
      line-height: 1;
      image-rendering: pixelated;
      filter:
        drop-shadow(0 2px 0 rgba(0,0,0,.35))
        drop-shadow(0 0 6px rgba(255,255,255,.25));
    }

    .tm-found-rank-diamond {
      --tm-found-bg: linear-gradient(135deg, #1d2b30, #123945, #0f222a);
      background: linear-gradient(135deg, #1d2b30, #123945, #0f222a) !important;
      box-shadow: 0 0 0 2px rgba(125,249,255,.24), 0 0 24px rgba(125,249,255,.35) !important;
    }

    .tm-found-rank-gold {
      --tm-found-bg: linear-gradient(135deg, #312713, #5b4310, #261e0d);
      background: linear-gradient(135deg, #312713, #5b4310, #261e0d) !important;
      box-shadow: 0 0 0 2px rgba(255,215,0,.2), 0 0 22px rgba(255,215,0,.28) !important;
    }

    .tm-found-rank-silver {
      --tm-found-bg: linear-gradient(135deg, #30333a, #4a5059, #22262d);
      background: linear-gradient(135deg, #30333a, #4a5059, #22262d) !important;
      box-shadow: 0 0 0 2px rgba(255,255,255,.14), 0 0 20px rgba(220,220,220,.2) !important;
    }

    .tm-found-rank-bronze {
      --tm-found-bg: linear-gradient(135deg, #3a2618, #6a3d1f, #2a1910);
      background: linear-gradient(135deg, #3a2618, #6a3d1f, #2a1910) !important;
      box-shadow: 0 0 0 2px rgba(205,127,50,.18), 0 0 18px rgba(205,127,50,.22) !important;
    }

    .tm-found-rank-default {
      --tm-found-bg: linear-gradient(135deg, #242424, #171717);
      background: linear-gradient(135deg, #242424, #171717) !important;
    }

    .tm-found-info .tm-small-line {
      display: block;
      font-size: 12px;
      opacity: .92;
      font-weight: 800;
      word-break: break-word;
    }

    .tm-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .tm-main-chip-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 10px;
      width: 100%;
    }

    .tm-main-chip {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(0,0,0,.28);
      color: rgba(255,255,255,.74);
      font-size: 12px;
      line-height: 1.2;
      font-weight: 900;
      box-sizing: border-box;
    }

    .tm-main-chip.tm-active {
      background: var(--tm-accent);
      color: #fff;
      box-shadow: 0 0 0 2px rgba(255,255,255,.28) inset;
    }

    .tm-sub-chip-row {
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      margin-top: 6px;
      width: 100%;
    }

    .tm-sub-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      flex: 1 1 0;
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(0,0,0,.52);
      color: rgba(255,255,255,.74);
      font-size: 12px;
      line-height: 1.2;
      font-weight: 900;
      text-align: center;
      white-space: nowrap;
      box-sizing: border-box;
    }

    .tm-sub-chip.tm-active {
      background: rgba(211,109,109,.9);
      color: #fff;
      box-shadow: 0 0 0 1px rgba(255,255,255,.24) inset;
    }

    .tm-chip {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(0,0,0,.75);
      color: #fff;
      font-size: 11px;
      line-height: 1.2;
      font-weight: 800;
      text-transform: capitalize;
    }

    .tm-confetti-layer {
      pointer-events: none;
      position: fixed;
      left: 0;
      top: 0;
      width: 0;
      height: 0;
      z-index: 999998;
      perspective: 800px;
      overflow: visible;
    }

    .tm-confetti-piece {
      position: absolute;
      width: 12px;
      height: 18px;
      border-radius: 3px;
      transform-style: preserve-3d;
      animation: tmConfettiFly 9200ms cubic-bezier(.12,.74,.22,1) forwards;
      box-shadow:
        0 2px 10px rgba(0,0,0,.28),
        0 0 18px rgba(255,255,255,.55);
      filter: saturate(1.3) brightness(1.2);
    }

    @keyframes tmConfettiFly {
      0% {
        transform:
          translate3d(0, 0, 0)
          rotateX(0deg)
          rotateY(0deg)
          rotateZ(0deg)
          scale(1.35);
        opacity: 1;
      }
      100% {
        transform:
          translate3d(var(--dx), var(--dy), var(--dz))
          rotateX(var(--rx))
          rotateY(var(--ry))
          rotateZ(var(--rz))
          scale(.85);
        opacity: 0;
      }
    }

    .tm-stat-muted {
      opacity: .75;
      font-size: 12px;
      line-height: 1.35;
      margin-top: 10px;
      margin-bottom: 10px;
    }

    .tm-stat-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 12px;
      min-width: 640px;
      font-weight: 400;
    }

    .tm-stat-table-wrap {
      overflow-x: auto;
      overflow-y: hidden;
    }

    .tm-stat-table th,
    .tm-stat-table td {
      text-align: left;
      padding: 7px 5px;
      border-bottom: 1px solid #3a4248;
      vertical-align: top;
    }

    .tm-stat-table th:nth-child(3),
    .tm-stat-table th:nth-child(4),
    .tm-stat-table th:nth-child(5),
    .tm-stat-table th:nth-child(6),
    .tm-stat-table td:nth-child(3),
    .tm-stat-table td:nth-child(4),
    .tm-stat-table td:nth-child(5),
    .tm-stat-table td:nth-child(6) {
      text-align: center;
      white-space: nowrap;
    }

    .tm-stat-series-cell {
      text-align: center !important;
      white-space: nowrap;
      min-width: 88px;
    }

    .tm-stat-select-col,
    .tm-stat-action-col {
      width: 26px;
      text-align: center !important;
    }

    .tm-stat-placeholder-col,
    .tm-stat-placeholder-cell {
      opacity: 0;
      pointer-events: none;
    }

    .tm-stat-name-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tm-stat-link {
      border: 0;
      padding: 0;
      background: transparent;
      color: #fff;
      cursor: pointer;
      text-align: left;
      font: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .tm-stat-current {
      font-weight: 400;
    }

    .tm-stat-checkbox {
      accent-color: var(--tm-accent);
      width: 14px;
      height: 14px;
      margin: 0;
      cursor: pointer;
      flex: 0 0 auto;
    }

    .tm-remove-intersection {
      width: 22px;
      height: 22px;
      border: 0;
      border-radius: 999px;
      background: rgba(211,109,109,.18);
      color: #fff;
      cursor: pointer;
      font: 700 14px/1 system-ui, sans-serif;
    }

    .tm-stat-table th {
      opacity: .75;
      font-weight: 400;
    }

    .tm-stat-table td,
    .tm-stat-table td span,
    .tm-stat-table .tm-stat-link {
      font-weight: 400;
    }

    .tm-stat-focus-row td {
      background: rgba(211,109,109,.16);
      transition: background-color .24s ease, box-shadow .24s ease;
    }

    .tm-stat-focus-row.tm-stat-focus-live td {
      background: rgba(211,109,109,.28);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.1);
    }

    .tm-stat-focus-cell {
      position: relative;
      z-index: 1;
      background: rgba(211,109,109,.22) !important;
      box-shadow: inset 0 0 0 2px rgba(255,255,255,.28);
    }

    .tm-series-toolbar {
      margin-bottom: 12px;
      padding: 10px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 10px;
      background: rgba(255,255,255,.03);
    }

    .tm-series-toolbar-title {
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 8px;
    }

    .tm-series-toggle-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tm-series-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,.05);
      border: 1px solid rgba(255,255,255,.08);
      cursor: pointer;
      user-select: none;
    }

    .tm-series-toggle-input {
      margin: 0;
      accent-color: var(--tm-accent);
    }

    .tm-series-toggle-label {
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tm-section-series-toggle {
      display: inline-flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .tm-section-series-button {
      border: 1px solid rgba(255,255,255,.34);
      border-radius: 999px;
      background: rgba(18,18,18,.24);
      color: #fff8f8;
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      line-height: 1.2;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
      transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease, box-shadow .18s ease;
    }

    .tm-section-series-button:hover {
      background: rgba(18,18,18,.36);
      border-color: rgba(255,255,255,.52);
      transform: translateY(-1px);
    }

    .tm-section-series-button:disabled {
      opacity: .5;
      cursor: not-allowed;
      transform: none;
    }

    .tm-section-series-button.tm-active {
      background: #fff5f5;
      border-color: #fff;
      color: #7c2020;
      box-shadow: 0 10px 18px rgba(68, 14, 14, .18);
    }

    .tm-summary-reminder {
      position: fixed;
      top: 14px;
      left: 50%;
      z-index: 1000000;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      width: min(520px, calc(100vw - 24px));
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(255, 164, 91, .22);
      background:
        radial-gradient(circle at top left, rgba(255, 164, 91, .18), transparent 42%),
        linear-gradient(180deg, rgba(26, 26, 29, .98), rgba(15, 15, 17, .98));
      color: #fff7ef;
      box-shadow: 0 18px 40px rgba(0,0,0,.42), 0 6px 18px rgba(255, 164, 91, .14);
      backdrop-filter: blur(14px);
      transform: translate(-50%, -12px);
      opacity: 0;
      transition: opacity .22s ease, transform .22s ease;
    }

    .tm-summary-reminder.tm-clickable {
      cursor: pointer;
    }

    .tm-summary-reminder.tm-clickable:hover {
      filter: brightness(1.04);
    }

    .tm-summary-reminder.tm-visible {
      opacity: 1;
      transform: translate(-50%, 0);
    }

    .tm-summary-reminder-badge {
      flex: 0 0 auto;
      min-width: 72px;
      padding: 10px 12px;
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(255, 164, 91, .24), rgba(255, 103, 82, .14));
      border: 1px solid rgba(255,255,255,.08);
      text-align: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
    }

    .tm-summary-reminder-badge-value {
      display: block;
      font-size: 24px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: -.03em;
      color: #ffd3a6;
    }

    .tm-summary-reminder-badge-label {
      display: block;
      margin-top: 4px;
      font-size: 10px;
      line-height: 1.2;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: rgba(255, 236, 219, .76);
    }

    .tm-summary-reminder-content {
      flex: 1 1 auto;
      min-width: 0;
    }

    .tm-summary-reminder-title {
      font-size: 13px;
      line-height: 1.35;
      font-weight: 800;
      color: #fffaf5;
    }

    .tm-summary-reminder-meta {
      margin-top: 4px;
      font-size: 11px;
      line-height: 1.4;
      color: rgba(255, 236, 219, .72);
    }

    .tm-summary-reminder-close {
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      color: rgba(255,255,255,.9);
      cursor: pointer;
      font: 700 15px/1 system-ui, sans-serif;
      transition: background .18s ease, transform .18s ease;
    }

    .tm-summary-reminder-close:hover {
      background: rgba(255,255,255,.14);
      transform: scale(1.04);
    }

    .tm-summary-shell {
      position: relative;
      width: 100%;
      padding-right: 0;
    }

    .tm-summary-main {
      width: 100%;
      min-width: 0;
    }

    .tm-summary-sidepanel {
      position: fixed;
      top: 84px;
      right: 12px;
      width: min(280px, calc(100vw - 24px));
      max-height: calc(100vh - 96px);
      overflow: auto;
      z-index: 100001;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(18,20,25,.94);
      box-shadow: 0 18px 40px rgba(0,0,0,.35);
      backdrop-filter: blur(14px);
    }

    .tm-summary-sidepanel-title {
      font-size: 12px;
      font-weight: 800;
      opacity: .86;
    }

    .tm-summary-sidepanel .tm-series-toolbar {
      margin-bottom: 0;
    }

    .tm-summary-control-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tm-summary-control-stack .tm-small-button {
      margin: 0;
      width: 100%;
    }

    .tm-summary-sidepanel-file {
      display: none;
    }

    @media (max-width: 1280px) {
      .tm-summary-shell {
        width: 100%;
        padding-right: 0;
      }

      .tm-summary-sidepanel {
        position: static;
        width: 100%;
        max-height: none;
        margin-bottom: 14px;
      }
    }

    .tm-stat-chart {
      margin-top: 12px;
      padding: 10px 10px 8px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 10px;
      background: rgba(255,255,255,.03);
      position: relative;
    }

    .tm-stat-chart.tm-collapsed {
      padding-bottom: 10px;
    }

    .tm-stat-chart-head {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      margin-bottom: 8px;
    }

    .tm-stat-chart-head-left,
    .tm-stat-chart-head-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .tm-stat-chart-head-left {
      min-width: 0;
    }

    .tm-stat-chart-head-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .tm-stat-chart-header-label {
      color: rgba(255,255,255,.82);
      font-size: 14px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: .02em;
    }

    .tm-stat-chart-title {
      margin: 4px 0 0;
      color: rgba(255,255,255,.76);
      font-size: 20px;
      font-weight: 800;
      line-height: 1.15;
    }

    .tm-stat-chart-toggle {
      display: inline-flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .tm-stat-chart-collapse {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      background: rgba(255,255,255,.04);
      color: rgba(255,255,255,.82);
      cursor: pointer;
      padding: 0;
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
      transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
    }

    .tm-stat-chart-collapse:hover {
      background: rgba(255,255,255,.1);
      color: #fff;
      transform: translateY(-1px);
    }

    .tm-stat-chart-content {
      overflow: hidden;
      opacity: 1;
      max-height: 2000px;
      transition: max-height .28s ease, opacity .22s ease, margin-top .28s ease;
      will-change: max-height, opacity;
    }

    .tm-stat-chart.tm-collapsed .tm-stat-chart-content {
      opacity: 0;
      max-height: 0;
      margin-top: -4px;
      pointer-events: none;
    }

    .tm-stat-chart.tm-collapsed .tm-stat-chart-head {
      margin-bottom: 0;
    }

    .tm-stat-chart.tm-collapsed .tm-stat-chart-head-right {
      display: none;
    }

    .tm-stat-chart-copy-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      background: rgba(255,255,255,.04);
      color: rgba(255,255,255,.82);
      cursor: pointer;
      padding: 0;
      transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
    }

    .tm-stat-chart-copy-button:hover {
      background: rgba(255,255,255,.1);
      color: #fff;
      transform: translateY(-1px);
    }

    .tm-stat-chart-copy-button:disabled {
      opacity: .45;
      cursor: not-allowed;
      transform: none;
    }

    .tm-stat-chart-copy-button.tm-success {
      background: rgba(85, 179, 114, .18);
      border-color: rgba(85, 179, 114, .38);
      color: #d9ffe3;
    }

    .tm-stat-chart-copy-button.tm-error {
      background: rgba(211,109,109,.18);
      border-color: rgba(211,109,109,.42);
      color: #fff2f2;
    }

    .tm-stat-chart-copy-button svg {
      width: 14px;
      height: 14px;
      display: block;
    }

    .tm-stat-chart-toggle-button {
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      background: rgba(255,255,255,.04);
      color: rgba(255,255,255,.82);
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }

    .tm-stat-chart-toggle-button.tm-active {
      background: rgba(211,109,109,.18);
      border-color: rgba(211,109,109,.42);
      color: #fff;
    }

    .tm-stat-chart-svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .tm-stat-chart-grid {
      stroke: rgba(255,255,255,.08);
      stroke-width: 1;
    }

    .tm-stat-chart-axis {
      stroke: rgba(255,255,255,.18);
      stroke-width: 1;
    }

    .tm-stat-chart-tick {
      fill: rgba(255,255,255,.52);
      font-size: 10px;
      font-weight: 700;
    }

    .tm-stat-chart-day {
      fill: rgba(255,255,255,.62);
      font-size: 10px;
      font-weight: 700;
      pointer-events: none;
    }

    .tm-stat-chart-line {
      fill: none;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
      filter: drop-shadow(0 0 6px rgba(255,255,255,.1));
      transition: opacity .12s ease;
    }

    .tm-stat-chart-line-bg {
      fill: none;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: .25;
      transition: opacity .12s ease;
    }

    .tm-stat-chart-trend {
      fill: none;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: .85;
      stroke-dasharray: 5 4;
      transition: opacity .12s ease;
    }

    .tm-stat-chart-trend-ma {
      stroke-dasharray: 1 5;
    }

    .tm-stat-chart-point {
      stroke: #111;
      stroke-width: 1.5;
      opacity: 1;
      transition: opacity .12s ease;
    }

    .tm-stat-chart-point.tm-dimmed,
    .tm-stat-chart-point.tm-day-dimmed,
    .tm-stat-chart-point.tm-series-dimmed {
      opacity: .12;
    }

    .tm-stat-chart-hover-line {
      stroke: rgba(255,255,255,.18);
      stroke-width: 1;
      stroke-dasharray: 4 4;
    }

    .tm-stat-chart-hover-zone {
      fill: transparent;
      cursor: crosshair;
      pointer-events: none;
    }

    .tm-stat-chart-tooltip {
      position: absolute;
      min-width: 148px;
      max-width: 220px;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(14,16,20,.96);
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      pointer-events: none;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity .12s ease, transform .12s ease;
      z-index: 2;
    }

    .tm-stat-chart-tooltip.tm-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .tm-stat-chart-tooltip-day {
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 8px;
      color: #fff;
    }

    .tm-stat-chart-tooltip-row {
      display: grid;
      grid-template-columns: 10px 1fr auto;
      gap: 8px;
      align-items: center;
      font-size: 11px;
      color: rgba(255,255,255,.9);
      margin-top: 4px;
      transition: opacity .12s ease;
    }

    .tm-stat-chart-tooltip-row.tm-series-dimmed {
      opacity: .22;
    }

    .tm-stat-chart-tooltip-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
    }

    .tm-stat-chart-tooltip-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tm-stat-chart-tooltip-value {
      font-weight: 800;
      color: #fff;
    }

    .tm-stat-chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
      align-items: center;
    }

    .tm-stat-chart-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 120px;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(255,255,255,.05);
      font-size: 11px;
      color: rgba(255,255,255,.86);
      transition: opacity .12s ease, background .12s ease;
      cursor: pointer;
      outline: none;
    }

    .tm-stat-chart-legend-item.tm-series-active {
      background: rgba(255,255,255,.14);
    }

    .tm-stat-chart-legend-item.tm-series-dimmed {
      opacity: .26;
    }

    .tm-stat-chart-legend-swatch {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      flex: 0 0 auto;
    }

    .tm-stat-chart-legend-eyeoff {
      width: 12px;
      height: 12px;
      display: none;
      flex: 0 0 auto;
      color: rgba(255,255,255,.58);
    }

    .tm-stat-chart-legend-item.tm-series-hidden {
      background: rgba(255,255,255,.03);
      color: rgba(255,255,255,.52);
    }

    .tm-stat-chart-legend-item.tm-series-hidden .tm-stat-chart-legend-swatch {
      display: none;
    }

    .tm-stat-chart-legend-item.tm-series-hidden .tm-stat-chart-legend-eyeoff {
      display: block;
    }

    .tm-stat-chart-legend-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tm-stat-chart-trend-control {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.08);
      font-size: 11px;
      color: rgba(255,255,255,.82);
      cursor: pointer;
      user-select: none;
    }

    .tm-stat-chart-trend-control input {
      margin: 0;
      accent-color: #d36d6d;
    }

    .tm-stat-chart-line.tm-series-dimmed,
    .tm-stat-chart-line-bg.tm-series-dimmed,
    .tm-stat-chart-trend.tm-series-dimmed {
      opacity: .12;
    }

    .tm-stat-chart-line.tm-series-active,
    .tm-stat-chart-line-bg.tm-series-active,
    .tm-stat-chart-trend.tm-series-active,
    .tm-stat-chart-point.tm-series-active {
      opacity: 1;
    }

    .tm-stat-chart-point.tm-series-hidden,
    .tm-stat-chart-line.tm-series-hidden,
    .tm-stat-chart-line-bg.tm-series-hidden,
    .tm-stat-chart-trend.tm-series-hidden,
    .tm-stat-chart-tooltip-row.tm-series-hidden {
      display: none;
    }

    .tm-action-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 0;
    }

    .tm-action-row .tm-small-button {
      margin-bottom: 0;
      padding: 7px 8px;
      font-size: 12px;
    }

    .tm-action-stack {
      display: grid;
      gap: 8px;
      margin-top: 14px;
    }

    .tm-intersections-action {
      margin-top: 10px;
    }

    .tm-referrer-intersection-button {
      display: inline-flex;
      width: auto;
      margin: 0 0 0 8px;
      padding: 4px 8px;
      font-size: 11px;
      line-height: 1.2;
      vertical-align: middle;
    }

    .tm-primary-button {
      background: linear-gradient(135deg, var(--tm-accent), var(--tm-accent-strong));
      color: #fff;
      box-shadow: 0 10px 24px var(--tm-accent-soft);
      margin-top: 8px;
    }

    .tm-secondary-button {
      background: rgba(211,109,109,.14);
      color: rgba(255,255,255,.88);
      border: 1px solid rgba(211,109,109,.38);
    }

    .tm-clear-button {
      background: rgba(211,109,109,.22);
      color: white;
      border: 1px solid rgba(211,109,109,.34);
    }
  `;
  document.head.appendChild(style);

  function normalize(text) {
    return String(text || '').trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function loadDashboardGamesFromCache() {
    const data = safeJsonParse(localStorage.getItem(STORAGE_KEY_GAMES), null);
    dashboardGames = Array.isArray(data?.games) ? data.games : [];
  }

  function saveDashboardGames(games) {
    localStorage.setItem(STORAGE_KEY_GAMES, JSON.stringify({
      savedAt: Date.now(),
      games
    }));
  }

  function loadPositions() {
    const raw = localStorage.getItem(STORAGE_KEY_POSITIONS);
    const parsed = safeJsonParse(raw, {});

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    let mutated = false;
    Object.values(parsed).forEach(entry => {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.records)) return;

      entry.records.forEach(record => {
        if (!record || typeof record !== 'object') return;

        const foundAt = Number(record.foundAt || 0);
        if (!Number.isFinite(foundAt) || foundAt <= 0) return;

        if (!record.localDayKey) {
          record.localDayKey = getLocalDayKey(foundAt);
          mutated = true;
        }

        if (!record.localHourKey) {
          record.localHourKey = getLocalHourKey(foundAt);
          mutated = true;
        }
      });
    });

    if (mutated) savePositions(parsed);

    return parsed;
  }

  function savePositions(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      data = {};
    }

    localStorage.setItem(STORAGE_KEY_POSITIONS, JSON.stringify(data));
  }

  function loadGameMeta() {
    const raw = localStorage.getItem(STORAGE_KEY_GAME_META);
    const parsed = safeJsonParse(raw, {});

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed;
  }

  function saveGameMeta(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      data = {};
    }

    localStorage.setItem(STORAGE_KEY_GAME_META, JSON.stringify(data));
  }

  function deepClone(value, fallback = null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return fallback;
    }
  }

  function storeMetaOnCurrentOrigin(meta) {
    if (!meta || typeof meta !== 'object') return;

    const all = loadGameMeta();

    if (meta.id) {
      all['id:' + meta.id] = meta;
    }

    if (meta.name) {
      all['name:' + normalize(meta.name)] = meta;
    }

    saveGameMeta(all);
  }

  function readTransferredPayload() {
    const raw = String(window.name || '');
    if (!raw.startsWith(WINDOW_NAME_TRANSFER_PREFIX)) return null;

    try {
      const payload = JSON.parse(raw.slice(WINDOW_NAME_TRANSFER_PREFIX.length));
      return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
    } catch (_) {
      return null;
    }
  }

  function writeTransferredPayload(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;

    try {
      const current = readTransferredPayload() || {};
      window.name = WINDOW_NAME_TRANSFER_PREFIX + JSON.stringify({
        ...current,
        ...patch
      });
    } catch (_) {}
  }

  function setTransferredMeta(meta) {
    if (!meta || typeof meta !== 'object') return;
    writeTransferredPayload({ meta });
  }

  function setTransferredRefreshState(refreshState) {
    if (!refreshState || typeof refreshState !== 'object') return;
    writeTransferredPayload({ refreshState });
  }

  function setTransferredPendingSearch(game) {
    if (!game || typeof game !== 'object') return;
    writeTransferredPayload({
      pendingSearch: {
        id: game.id || null,
        name: game.name || ''
      }
    });
  }

  function setTransferredPendingSummaryFocus(target) {
    if (!target || typeof target !== 'object') return;
    writeTransferredPayload({
      pendingSummaryFocus: {
        section: String(target.section || ''),
        label: String(target.label || ''),
        series: String(target.series || '')
      }
    });
  }

  function setTransferredPendingSummaryWidget() {
    writeTransferredPayload({
      pendingSummaryWidget: true
    });
  }

  function consumeTransferredMeta() {
    const payload = readTransferredPayload();
    if (!payload) return null;

    window.name = '';

    if (payload.meta) {
      storeMetaOnCurrentOrigin(payload.meta);
    }

    if (payload.refreshState) {
      saveRefreshState(payload.refreshState);
    }

    return payload;
  }

  function loadSummarySectionState() {
    const raw = localStorage.getItem(STORAGE_KEY_SUMMARY_SECTIONS);
    const parsed = safeJsonParse(raw, {});
    const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};

    return getSummarySectionStorageKeys().reduce((acc, key) => {
      acc[key] = normalizeSummarySectionStateEntry(key, source[key]);
      return acc;
    }, {});
  }

  function saveSummarySectionState(data) {
    const next = getSummarySectionStorageKeys().reduce((acc, key) => {
      acc[key] = normalizeSummarySectionStateEntry(key, data?.[key]);
      return acc;
    }, {});
    localStorage.setItem(STORAGE_KEY_SUMMARY_SECTIONS, JSON.stringify(next));
  }

  function loadSummarySeriesState() {
    const defaults = getDefaultSummarySeriesState();
    const raw = localStorage.getItem(STORAGE_KEY_SUMMARY_SERIES);
    const parsed = safeJsonParse(raw, {});
    const result = { ...defaults };

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return result;
    }

    ANALYTICS_SERIES.forEach(item => {
      if (typeof parsed[item.key] === 'boolean') {
        result[item.key] = parsed[item.key];
      }
    });

    return result;
  }

  function saveSummarySeriesState(data) {
    const defaults = getDefaultSummarySeriesState();
    const next = { ...defaults };

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      ANALYTICS_SERIES.forEach(item => {
        if (typeof data[item.key] === 'boolean') {
          next[item.key] = data[item.key];
        }
      });
    }

    localStorage.setItem(STORAGE_KEY_SUMMARY_SERIES, JSON.stringify(next));
  }

  function loadSummaryChartPrefs() {
    const raw = localStorage.getItem(STORAGE_KEY_SUMMARY_CHART_PREFS);
    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  function saveSummaryChartPrefs(data) {
    localStorage.setItem(STORAGE_KEY_SUMMARY_CHART_PREFS, JSON.stringify(data || {}));
  }

  function normalizeSummaryChartDuration(value) {
    const duration = Number(value);
    return duration === 90 ? 90 : duration === 30 ? 30 : duration === 7 ? 7 : 1;
  }

  function normalizeSummaryChartTrends(trends) {
    return {
      linear: !!trends?.linear,
      ma: !!trends?.ma
    };
  }

  function normalizeSummaryChartHiddenSeries(hiddenSeries) {
    if (!Array.isArray(hiddenSeries)) return [];

    return hiddenSeries
      .map(key => String(key || '').trim())
      .filter(Boolean)
      .filter((key, index, array) => array.indexOf(key) === index);
  }

  function getSummaryChartPref(chartKey, visibleModes = []) {
    const allPrefs = loadSummaryChartPrefs();
    const pref = allPrefs?.[chartKey];
    const mode = visibleModes.includes(pref?.mode) ? pref.mode : (visibleModes[0] || '');
    const duration = normalizeSummaryChartDuration(pref?.duration);
    const trends = normalizeSummaryChartTrends(pref?.trends);
    const hiddenSeries = normalizeSummaryChartHiddenSeries(pref?.hiddenSeries);
    return { mode, duration, trends, hiddenSeries };
  }

  function setSummaryChartPref(chartKey, pref) {
    if (!chartKey) return;

    const allPrefs = loadSummaryChartPrefs();
    allPrefs[chartKey] = {
      mode: String(pref?.mode || ''),
      duration: normalizeSummaryChartDuration(pref?.duration),
      trends: normalizeSummaryChartTrends(pref?.trends),
      hiddenSeries: normalizeSummaryChartHiddenSeries(pref?.hiddenSeries)
    };
    saveSummaryChartPrefs(allPrefs);
  }

  function getEnabledSummarySeries() {
    const state = loadSummarySeriesState();
    return ANALYTICS_SERIES
      .map(item => item.key)
      .filter(key => state[key] !== false);
  }

  function loadIntersectionsState() {
    const raw = localStorage.getItem(STORAGE_KEY_INTERSECTIONS);
    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  function saveIntersectionsState(data) {
    localStorage.setItem(STORAGE_KEY_INTERSECTIONS, JSON.stringify(data || {}));
  }

  function getIntersectionStorageKey(game) {
    return game?.id ? `id:${game.id}` : `name:${normalize(game?.name)}`;
  }

  function normalizeStoredIntersectionItem(item) {
    if (!item || typeof item !== 'object') return null;

    const parts = normalizeIntersectionParts(item.parts);
    if (parts.length >= 2) {
      const urls = buildIntersectionUrls(parts);
      if (!urls.popularUrl || !urls.newPopularUrl) return null;

      return {
        id: buildIntersectionId(parts),
        label: parts.map(part => part.label).join(' + '),
        parts,
        popularUrl: urls.popularUrl,
        newPopularUrl: urls.newPopularUrl
      };
    }

    const label = String(item.label || '').trim();
    const id = String(item.id || '').trim() || normalize(label);
    const popularUrl = String(item.popularUrl || '').trim();
    const newPopularUrl = String(item.newPopularUrl || '').trim();
    if (!label || !id || !popularUrl || !newPopularUrl) return null;

    return {
      ...item,
      id,
      label,
      popularUrl,
      newPopularUrl
    };
  }

  function normalizeIntersectionItems(items) {
    const byId = new Map();

    (Array.isArray(items) ? items : []).forEach(item => {
      const normalizedItem = normalizeStoredIntersectionItem(item);
      if (!normalizedItem) return;

      const dedupeKey = normalize(normalizedItem.id) || normalize(normalizedItem.label);
      if (!dedupeKey) return;
      byId.set(dedupeKey, normalizedItem);
    });

    return [...byId.values()].sort((a, b) => {
      const labelDelta = normalize(a.label).localeCompare(normalize(b.label));
      if (labelDelta) return labelDelta;
      return normalize(a.id).localeCompare(normalize(b.id));
    });
  }

  function hasIntersectionItem(items, parts) {
    const intersectionId = normalize(buildIntersectionId(parts));
    if (!intersectionId) return false;
    return normalizeIntersectionItems(items).some(item => normalize(item.id) === intersectionId);
  }

  function getGameIntersections(game) {
    const all = loadIntersectionsState();
    const key = getIntersectionStorageKey(game);
    const items = Array.isArray(all[key]) ? all[key] : [];
    const normalizedItems = normalizeIntersectionItems(items);

    if (key && JSON.stringify(normalizedItems) !== JSON.stringify(items)) {
      all[key] = normalizedItems;
      saveIntersectionsState(all);
    }

    return normalizedItems;
  }

  function saveGameIntersections(game, items) {
    const all = loadIntersectionsState();
    const key = getIntersectionStorageKey(game);
    if (!key) return;
    all[key] = normalizeIntersectionItems(items);
    saveIntersectionsState(all);
  }

  function getGameMetaForGame(game) {
    const metaCache = loadGameMeta();
    const possibleKeys = [
      game?.id ? `id:${game.id}` : null,
      game?.name ? `name:${normalize(game.name)}` : null
    ].filter(Boolean);

    for (const key of possibleKeys) {
      if (metaCache[key]) return metaCache[key];
    }

    return null;
  }

  function collectImportedHiddenSections(records = [], meta = null) {
    const result = getEmptyMetaSections();
    const liveSections = meta?.sections && typeof meta.sections === 'object'
      ? meta.sections
      : {};

    getFilterSectionConfigs().forEach(section => {
      const liveLabels = Array.isArray(liveSections?.[section.key]?.labels)
        ? liveSections[section.key].labels.map(label => normalizeSectionLabel(section.key, label))
        : [];
      const liveSet = new Set(liveLabels.map(normalize));
      const storedLabels = normalizeLabelList(records.flatMap(record => getRecordSectionLabels(record, section.key)));

      result[section.key] = storedLabels.filter(label => !liveSet.has(normalize(label)));
    });

    return result;
  }

  function getMetaSectionLabelsForSummary(meta, sectionKey) {
    return Array.isArray(meta?.sections?.[sectionKey]?.labels)
      ? meta.sections[sectionKey].labels.map(label => normalizeSectionLabel(sectionKey, label))
      : getRecordSectionLabels({ meta }, sectionKey);
  }

  function getDerivedSectionLabelsForSummary(records = [], sectionKey = '') {
    const sectionConfig = getFilterSectionConfigByKey(sectionKey);
    if (!sectionConfig) return [];

    const knownLabels = getKnownFilterLabels(sectionConfig.type);
    if (!knownLabels.length) return [];

    const knownSet = new Set(knownLabels.map(normalize));
    return normalizeLabelList(records.flatMap(record => {
      return getSearchLabelsFromRecord(record)
        .map(label => normalizeSectionLabel(sectionKey, label))
        .filter(label => knownSet.has(normalize(label)));
    }));
  }

  function getCurrentGameDataset(game, summaryData = null) {
    const data = summaryData || getSummaryData(game);
    return {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: Date.now(),
      game: {
        id: game?.id || data?.entry?.game?.id || data?.meta?.id || null,
        name: game?.name || data?.entry?.game?.name || data?.meta?.name || ''
      },
      positionsEntry: deepClone(data?.entry || null, null),
      meta: deepClone(data?.meta || getGameMetaForGame(game) || null, null),
      intersections: deepClone(getGameIntersections(game), []),
      possibleKeys: deepClone(data?.possibleKeys || [], [])
    };
  }

  function loadRefreshState() {
    const raw = localStorage.getItem(STORAGE_KEY_REFRESH_STATE);
    const parsed = safeJsonParse(raw, null);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const startedAt = Number(parsed.startedAt || 0);
    if (!startedAt || Date.now() - startedAt > REFRESH_STATE_MAX_AGE) {
      clearRefreshState();
      return null;
    }

    return parsed;
  }

  function saveRefreshState(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    localStorage.setItem(STORAGE_KEY_REFRESH_STATE, JSON.stringify(data));
  }

  function clearRefreshState() {
    localStorage.removeItem(STORAGE_KEY_REFRESH_STATE);
    sessionStorage.removeItem(STORAGE_KEY_REFRESH_REDIRECT_GUARD);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function installWidgetDrag(element, handle) {
    if (!element || !handle) return;

    handle.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      if (event.target.closest('button, input, textarea, select, a, label')) return;

      const rect = element.getBoundingClientRect();
      const startOffsetX = event.clientX - rect.left;
      const startOffsetY = event.clientY - rect.top;

      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
      element.style.right = 'auto';
      element.style.bottom = 'auto';

      function moveAt(clientX, clientY) {
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        const nextLeft = clamp(clientX - startOffsetX, 0, maxLeft);
        const nextTop = clamp(clientY - startOffsetY, 0, maxTop);

        element.style.left = `${nextLeft}px`;
        element.style.top = `${nextTop}px`;
      }

      function onMouseMove(moveEvent) {
        moveAt(moveEvent.clientX, moveEvent.clientY);
      }

      function stopDragging() {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', stopDragging);
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', stopDragging);
      event.preventDefault();
    });
  }

  function abortRefreshFlow(reason = '') {
    if (reason) {
      console.warn('[itch.io stats] refresh aborted:', reason);
    }

    clearRefreshState();
  }

  function isSameGame(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && String(a.id) === String(b.id)) return true;

    const aName = normalize(a.name);
    const bName = normalize(b.name);
    return !!aName && aName === bName;
  }

  function slugifyLabel(label) {
    return normalize(label)
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalizePlatformLabel(label) {
    const text = String(label || '').trim();
    return getKnownPlatformLabel(text) || text;
  }

  function normalizeTagLabel(label) {
    const text = String(label || '').trim();
    if (!text) return '';

    return text
      .split(/\s+/)
      .filter(Boolean)
      .map(word => {
        if (word.length <= 1) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  function getKnownPlatformLabel(value) {
    const key = normalize(value).replace(/^platform-/, '');
    if (!key) return '';

    if (key === 'html5' || key === 'web') return 'Web';
    if (key === 'mobile-web' || key === 'mobileweb') return 'Mobile Web';
    if (key === 'osx' || key === 'macos' || key === 'mac-os' || key === 'mac') return 'macOS';
    if (key === 'windows' || key === 'win') return 'Windows';
    if (key === 'linux') return 'Linux';
    if (key === 'android') return 'Android';
    if (key === 'ios' || key === 'i-os') return 'iOS';

    return '';
  }

  function getKnownFilterLabel(type, value) {
    const normalizedType = normalize(type);
    const normalizedValue = normalize(value);
    if (!normalizedType || !normalizedValue) return '';

    if (normalizedType === 'platform') {
      return getKnownPlatformLabel(normalizedValue);
    }

    const bucket = FILTER_TOKEN_TO_LABEL[normalizedType];
    if (bucket?.[normalizedValue]) {
      return FILTER_DISPLAY_LABELS[normalizedType]?.[bucket[normalizedValue]] || bucket[normalizedValue];
    }

    if (normalizedType === 'language' && normalizedValue.startsWith('lang-')) {
      const code = normalizedValue.replace(/^lang-/, '').trim();
      if (!code) return '';
      return code.toUpperCase();
    }

    return '';
  }

  function normalizeSectionLabel(sectionKey, label) {
    const config = getFilterSectionConfigByKey(sectionKey);
    const text = String(label || '').trim();
    if (!config || !text) return '';

    if (config.type === 'platform') return normalizePlatformLabel(text);
    if (config.type === 'tag') return normalizeTagLabel(text);
    if (config.type === 'language') {
      const known = getKnownFilterLabel(config.type, text);
      if (known) return known;
      return text.length <= 3 ? text.toUpperCase() : text;
    }

    return text;
  }

  function getSearchTokenForLabel(type, label) {
    const normalizedType = normalize(type);
    const text = String(label || '').trim();
    const normalizedLabel = normalize(text);
    if (!normalizedType || !normalizedLabel) return '';

    if (normalizedType === 'platform') {
      if (normalizedLabel === 'html5' || normalizedLabel === 'web') return 'platform-web';
      if (normalizedLabel === 'mobile web') return 'platform-mobile-web';
      return `platform-${slugifyLabel(text)}`;
    }

    if (normalizedType === 'genre') return `genre-${slugifyLabel(text)}`;
    if (normalizedType === 'tag') return `tag-${slugifyLabel(text)}`;
    if (normalizedType === 'language' && normalizedLabel.length <= 3 && !normalizedLabel.includes(' ')) {
      return `lang-${normalizedLabel}`;
    }

    const mapped = FILTER_LABEL_TO_TOKEN[normalizedType]?.[normalizedLabel];
    if (mapped) return mapped;

    if (normalizedType === 'language') {
      return `lang-${slugifyLabel(text)}`;
    }

    return slugifyLabel(text);
  }

  function getLabelFromSearchToken(type, token) {
    const normalizedType = normalize(type);
    const normalizedToken = normalize(token);
    if (!normalizedType || !normalizedToken) return '';

    if (normalizedType === 'platform') {
      return getKnownPlatformLabel(normalizedToken);
    }

    const mapped = FILTER_TOKEN_TO_LABEL[normalizedType]?.[normalizedToken];
    if (mapped) return FILTER_DISPLAY_LABELS[normalizedType]?.[mapped] || mapped;

    if (normalizedType === 'genre' && normalizedToken.startsWith('genre-')) {
      return normalizedToken.replace(/^genre-/, '').replaceAll('-', ' ');
    }

    if (normalizedType === 'tag' && normalizedToken.startsWith('tag-')) {
      return normalizedToken.replace(/^tag-/, '').replaceAll('-', ' ');
    }

    if (normalizedType === 'language' && normalizedToken.startsWith('lang-')) {
      return normalizedToken.replace(/^lang-/, '').toUpperCase();
    }

    return '';
  }

  function detectFilterSectionKeyFromHref(href, label = '') {
    const absolute = toAbsoluteItchUrl(href);
    if (!absolute) return '';

    try {
      const url = new URL(absolute);
      const parts = url.pathname.split('/').filter(Boolean);
      const gamesIndex = parts.indexOf('games');
      const filterParts = gamesIndex >= 0
        ? parts.slice(gamesIndex + 1).filter(part => part && !isKnownSeriesPathPart(part))
        : [];

      for (const part of filterParts) {
        const normalizedPart = normalize(part);
        if (normalizedPart.startsWith('genre-')) return 'genres';
        if (normalizedPart.startsWith('platform-')) return 'platforms';
        if (normalizedPart.startsWith('tag-')) return 'tags';
        if (getKnownPlatformLabel(normalizedPart)) return 'platforms';
        if (normalizedPart.startsWith('lang-')) return 'languages';
        if (FILTER_TOKEN_TO_LABEL.price?.[normalizedPart]) return 'price';
        if (FILTER_TOKEN_TO_LABEL.type?.[normalizedPart]) return 'type';
        if (FILTER_TOKEN_TO_LABEL.misc?.[normalizedPart]) return 'misc';
        if (FILTER_TOKEN_TO_LABEL.session_length?.[normalizedPart]) return 'session_length';
        if (FILTER_TOKEN_TO_LABEL.multiplayer?.[normalizedPart]) return 'multiplayer';
      }
    } catch (_) {}

    const labelText = normalize(label);
    for (const [sectionKey, aliases] of Object.entries(FILTER_SECTION_LABEL_ALIASES)) {
      if (aliases.some(alias => labelText.includes(normalize(alias)))) {
        return sectionKey;
      }
    }

    return '';
  }

  function getRecordSectionLabels(record, sectionKey) {
    if (!record || !sectionKey) return [];

    const meta = record.meta && typeof record.meta === 'object' ? record.meta : {};
    const sectionLabels = Array.isArray(meta.sections?.[sectionKey]?.labels)
      ? meta.sections[sectionKey].labels
      : [];

    if (sectionLabels.length) {
      return normalizeLabelList(sectionLabels.map(label => normalizeSectionLabel(sectionKey, label)));
    }

    if (sectionKey === 'genres' && Array.isArray(meta.genres)) return normalizeLabelList(meta.genres);
    if (sectionKey === 'platforms' && Array.isArray(meta.platforms)) return normalizeLabelList(meta.platforms.map(normalizePlatformLabel));
    if (sectionKey === 'tags' && Array.isArray(meta.tags)) {
      return normalizeLabelList(meta.tags.map(label => normalizeSectionLabel('tags', label)));
    }

    return [];
  }

  function getRecordSectionLinks(meta, sectionKey) {
    if (!meta || !sectionKey) return [];

    const sectionLinks = Array.isArray(meta.sections?.[sectionKey]?.links)
      ? meta.sections[sectionKey].links
      : [];

    if (sectionLinks.length) return normalizeLinkEntries(sectionLinks);
    if (sectionKey === 'genres' && Array.isArray(meta.genreLinks)) return normalizeLinkEntries(meta.genreLinks);
    if (sectionKey === 'platforms' && Array.isArray(meta.platformLinks)) return normalizeLinkEntries(meta.platformLinks);
    if (sectionKey === 'tags' && Array.isArray(meta.tagLinks)) return normalizeLinkEntries(meta.tagLinks);
    return [];
  }

  function getSearchPathParts(pathname = location.pathname) {
    return String(pathname || '').split('/').filter(Boolean);
  }

  function getSearchSeriesFromPath(pathname = location.pathname) {
    const parts = getSearchPathParts(pathname);
    if (parts[0] !== 'games') return '';

    const seriesPart = parts[1] || '';
    if (!isKnownSeriesPathPart(seriesPart)) return 'popular';

    const match = SEARCH_SERIES.find(item => normalize(item.pathPart) === normalize(seriesPart));
    return match?.key || 'popular';
  }

  function getSearchCategoryFromPath(pathname = location.pathname) {
    const series = getSearchSeriesFromPath(pathname);
    return series ? getSeriesLabel(series) : '';
  }

  function isIgnoredSearchSegment(value) {
    const text = normalize(value);
    return !!text && [
      'games',
      'tools',
      'assets',
      'jams',
      'browse',
      'new and popular',
      'top sellers',
      'top rated',
      'newest',
      'most recent'
    ].includes(text);
  }

  function getRecordCategory(record) {
    const pathCategory = getSearchCategoryFromPath(record?.path || '');
    if (pathCategory) return pathCategory;

    const metaCategory = normalize(record?.meta?.category);
    if (metaCategory === normalize('Most Recent')) return getSeriesLabel('newest');

    const seriesMatch = SEARCH_SERIES.find(item => normalize(item.label) === metaCategory);
    if (seriesMatch) return seriesMatch.label;
    return '';
  }

  function isIgnoredMetaLabel(value) {
    const text = normalize(value);
    return !text || SEARCH_SERIES.some(item => normalize(item.label) === text) || text === 'most recent' || text === 'default' || text.includes('generative ai');
  }

  function normalizeLinkEntries(values) {
    const seen = new Set();
    const result = [];

    for (const item of values.flat()) {
      const label = String(item?.label || '').trim();
      const href = String(item?.href || '').trim();
      if (!label || !href || isIgnoredMetaLabel(label)) continue;

      const key = `${normalize(label)}|${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ label, href });
    }

    return result;
  }

  function backfillMissingLinkEntries(type, labels, links) {
    const existing = new Map(
      normalizeLinkEntries(links).map(item => [normalize(item.label), item.href])
    );

    return normalizeLabelList(labels)
      .map(label => ({
        label,
        href: existing.get(normalize(label)) || buildSearchUrlForLabel(type, label)
      }))
      .filter(item => item.href);
  }

  function findLinkEntryByToken(type, token, links) {
    const wanted = normalize(token);
    if (!wanted) return null;

    return normalizeLinkEntries(links).find(item => {
      try {
        const pathname = new URL(item.href, 'https://itch.io').pathname;
        const parts = pathname.split('/').filter(Boolean).map(part => normalize(part));

        if (type === 'platform' && wanted === 'html5') {
          return parts.includes('html5') || parts.includes('platform-web');
        }

        if (type === 'platform' && wanted === 'platform-web') {
          return parts.includes('platform-web') || parts.includes('html5');
        }

        return parts.includes(wanted);
      } catch (_) {
        return false;
      }
    }) || null;
  }

  function canonicalizeLabelWithLinks(type, label, links) {
    const text = String(label || '').trim();
    if (!text) return '';

    if (type === 'platform') {
      const normalizedPlatform = normalizePlatformLabel(text);
      const normalizedLinks = normalizeLinkEntries(links);
      const exactPlatformMatch = normalizedLinks.find(item => normalize(item.label) === normalize(normalizedPlatform));
      if (exactPlatformMatch) return normalizePlatformLabel(exactPlatformMatch.label);
      if (normalize(text) === 'html5' || normalize(text) === 'web') return 'Web';
    }

    const normalizedText = normalize(text);
    const normalizedLinks = normalizeLinkEntries(links);
    const exactMatch = normalizedLinks.find(item => normalize(item.label) === normalizedText);
    if (exactMatch) return type === 'platform' ? normalizePlatformLabel(exactMatch.label) : normalizeSectionLabel(getFilterSectionKeyByType(type), exactMatch.label) || exactMatch.label;

    const slugToken = getSearchTokenForLabel(type, text);
    const tokenMatch = findLinkEntryByToken(type, slugToken, normalizedLinks);
    return tokenMatch?.label
      ? (type === 'platform'
          ? normalizePlatformLabel(tokenMatch.label)
          : normalizeSectionLabel(getFilterSectionKeyByType(type), tokenMatch.label) || tokenMatch.label)
      : (type === 'platform'
          ? normalizePlatformLabel(text)
          : normalizeSectionLabel(getFilterSectionKeyByType(type), text) || text);
  }

  function toAbsoluteItchUrl(href) {
    try {
      return new URL(href, 'https://itch.io').href;
    } catch (_) {
      return '';
    }
  }

  function buildSeriesUrl(seriesKey, href) {
    const absolute = toAbsoluteItchUrl(href || 'https://itch.io/games');
    if (!absolute) return '';

    try {
      const url = new URL(absolute);
      if (!url.pathname.startsWith('/games')) return absolute;

      const parts = url.pathname.split('/').filter(Boolean);
      const gamesIndex = parts.indexOf('games');
      const filters = gamesIndex >= 0
        ? parts.slice(gamesIndex + 1).filter(part => part && !isKnownSeriesPathPart(part))
        : [];
      const seriesPathPart = getSeriesPathPart(seriesKey);
      const nextParts = ['games'];

      if (seriesPathPart) nextParts.push(seriesPathPart);
      nextParts.push(...filters);

      url.pathname = '/' + nextParts.join('/');
      return url.href;
    } catch (_) {
      return absolute;
    }
  }

  function toNewAndPopularUrl(href) {
    return buildSeriesUrl('new-and-popular', href);
  }

  function parseSearchInfoFromHref(href) {
    const absolute = toAbsoluteItchUrl(href);
    if (!absolute) return { segments: [], searchPairs: [] };

    try {
      const url = new URL(absolute);
      const parts = url.pathname.split('/').filter(Boolean);
      const gameIndex = parts.indexOf('games');
      if (gameIndex < 0) return { segments: [], searchPairs: [] };

      return {
        segments: parts
          .slice(gameIndex + 1)
          .filter(part => part && !isKnownSeriesPathPart(part)),
        searchPairs: [...url.searchParams.entries()]
      };
    } catch (_) {
      return { segments: [], searchPairs: [] };
    }
  }

  function sortIntersectionParts(parts) {
    const order = {
      genre: 0,
      platform: 1,
      type: 2,
      multiplayer: 3,
      session_length: 4,
      price: 5,
      misc: 6,
      language: 7,
      tag: 8
    };
    return [...parts].sort((a, b) => {
      const typeDelta = (order[a.type] ?? 99) - (order[b.type] ?? 99);
      if (typeDelta) return typeDelta;
      const labelDelta = normalize(a.label).localeCompare(normalize(b.label));
      if (labelDelta) return labelDelta;
      return String(a.href || '').localeCompare(String(b.href || ''));
    });
  }

  function normalizeIntersectionParts(parts) {
    const seen = new Set();
    const result = [];

    for (const part of sortIntersectionParts(Array.isArray(parts) ? parts : [])) {
      const labelKey = normalize(part?.label);
      const href = String(part?.href || '').trim();
      const typeKey = normalize(part?.type);
      const dedupeKey = `${typeKey}|${labelKey}`;
      if (!typeKey || !labelKey || !href || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push(part);
    }

    return result;
  }

  function buildIntersectionId(parts) {
    return normalizeIntersectionParts(parts)
      .map(part => `${part.type}|${normalize(part.label)}|${String(part.href || '').trim()}`)
      .join('||');
  }

  function buildIntersectionUrls(parts) {
    const sorted = normalizeIntersectionParts(parts);
    const segmentsByType = {
      genre: [],
      platform: [],
      tag: [],
      price: [],
      type: [],
      misc: [],
      session_length: [],
      multiplayer: [],
      language: []
    };
    const seenByType = {
      genre: new Set(),
      platform: new Set(),
      tag: new Set(),
      price: new Set(),
      type: new Set(),
      misc: new Set(),
      session_length: new Set(),
      multiplayer: new Set(),
      language: new Set()
    };
    const searchPairs = [];
    const seenSearchPairs = new Set();

    for (const part of sorted) {
      const bucket = segmentsByType[part.type];
      const seen = seenByType[part.type];
      if (!bucket || !seen) continue;

      const searchInfo = parseSearchInfoFromHref(part.href);

      for (const segment of searchInfo.segments) {
        const rawSegment = String(segment || '').trim();
        const cleanedSegment = part.type === 'platform' && normalize(rawSegment) === 'html5'
          ? 'platform-web'
          : rawSegment;
        const key = normalize(cleanedSegment);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        bucket.push(cleanedSegment);
      }

      searchInfo.searchPairs.forEach(([key, value]) => {
        const pairKey = `${String(key)}=${String(value)}`;
        if (seenSearchPairs.has(pairKey)) return;
        seenSearchPairs.add(pairKey);
        searchPairs.push([key, value]);
      });
    }

    const segments = [
      ...segmentsByType.genre,
      ...segmentsByType.platform,
      ...segmentsByType.type,
      ...segmentsByType.multiplayer,
      ...segmentsByType.session_length,
      ...segmentsByType.price,
      ...segmentsByType.misc,
      ...segmentsByType.language,
      ...segmentsByType.tag
    ];
    const path = segments.join('/');
    if (!path) return { popularUrl: '', newPopularUrl: '' };

    const search = new URLSearchParams();
    searchPairs.forEach(([key, value]) => search.append(key, value));
    const suffix = search.toString() ? `?${search.toString()}` : '';

    return {
      popularUrl: `https://itch.io/games/${path}${suffix}`,
      newPopularUrl: `https://itch.io/games/new-and-popular/${path}${suffix}`
    };
  }

  function buildIntersectionPartFromSearchSegment(segment) {
    const normalizedSegment = normalize(segment);
    if (!normalizedSegment) return null;

    if (normalizedSegment.startsWith('genre-')) {
      const label = normalizeSectionLabel('genres', getLabelFromSearchToken('genre', normalizedSegment) || normalizedSegment.replace(/^genre-/, '').replaceAll('-', ' '));
      return label ? { type: 'genre', label, href: `https://itch.io/games/${normalizedSegment}` } : null;
    }

    if (normalizedSegment.startsWith('platform-') || getKnownPlatformLabel(normalizedSegment)) {
      const label = normalizePlatformLabel(getLabelFromSearchToken('platform', normalizedSegment) || normalizedSegment);
      const href = buildSearchUrlForLabel('platform', label);
      return label && href ? { type: 'platform', label, href } : null;
    }

    if (normalizedSegment.startsWith('tag-')) {
      const label = normalizeSectionLabel('tags', getLabelFromSearchToken('tag', normalizedSegment) || normalizedSegment.replace(/^tag-/, '').replaceAll('-', ' '));
      return label ? { type: 'tag', label, href: `https://itch.io/games/${normalizedSegment}` } : null;
    }

    if (normalizedSegment.startsWith('lang-')) {
      const label = normalizeSectionLabel('languages', getLabelFromSearchToken('language', normalizedSegment) || normalizedSegment.replace(/^lang-/, ''));
      return label ? { type: 'language', label, href: `https://itch.io/games/${normalizedSegment}` } : null;
    }

    for (const type of ['price', 'type', 'misc', 'session_length', 'multiplayer']) {
      if (!FILTER_TOKEN_TO_LABEL[type]?.[normalizedSegment]) continue;
      const label = normalizeSectionLabel(getFilterSectionKeyByType(type), getLabelFromSearchToken(type, normalizedSegment) || normalizedSegment);
      return label ? { type, label, href: `https://itch.io/games/${normalizedSegment}` } : null;
    }

    return null;
  }

  function getIntersectionPartsFromReferrerHref(href) {
    const absolute = toAbsoluteItchUrl(href);
    if (!absolute) return [];

    try {
      const url = new URL(absolute);
      if (normalize(url.hostname) !== 'itch.io') return [];
      if (!url.pathname.startsWith('/games')) return [];
    } catch (_) {
      return [];
    }

    const searchInfo = parseSearchInfoFromHref(absolute);
    if (searchInfo.segments.length < 2) return [];

    return normalizeIntersectionParts(
      searchInfo.segments
        .map(buildIntersectionPartFromSearchSegment)
        .filter(Boolean)
    );
  }

  function buildSearchUrlForLabel(type, label) {
    if (type === 'main') {
      const seriesMatch = SEARCH_SERIES.find(item => normalize(item.label) === normalize(label));
      return buildSeriesUrl(seriesMatch?.key || 'popular', 'https://itch.io/games');
    }

    const token = getSearchTokenForLabel(type, label);
    if (!token) return '';
    return `https://itch.io/games/${token}`;
  }

  function removeRecordForContext(game, contextKey) {
    if (!game || !contextKey) return;

    const gameKey = getGameKey(game);
    if (!gameKey) return;

    const all = loadPositions();
    const entry = all[gameKey];
    if (!entry || !Array.isArray(entry.records)) return;

    const currentHourKey = getLocalHourKey(Date.now());
    entry.records = entry.records.filter(record => {
      if (!record || record.contextKey !== contextKey) return true;

      const recordHourKey = String(record.localHourKey || getLocalHourKey(record.foundAt) || '');
      return recordHourKey !== currentHourKey;
    });
    all[gameKey] = entry;
    savePositions(all);
  }

  function upsertGameRecord(game, record) {
    if (!record) return record;

    const safeGame = game || record.game || {
      id: null,
      name: targetText || 'Unknown game'
    };
    const gameKey = getGameKey(safeGame);
    let all = loadPositions();

    if (!all || typeof all !== 'object' || Array.isArray(all)) {
      all = {};
    }

    if (!gameKey) return record;

    if (!all[gameKey] || typeof all[gameKey] !== 'object') {
      all[gameKey] = {
        game: {
          id: safeGame?.id || null,
          name: safeGame?.name || targetText || 'Unknown game'
        },
        records: []
      };
    }

    if (!Array.isArray(all[gameKey].records)) {
      all[gameKey].records = [];
    }

    const records = all[gameKey].records;
    const recordHourKey = String(record.localHourKey || getLocalHourKey(record.foundAt) || '');
    const existingIndex = records.findIndex(x => {
      if (!x) return false;
      if (x.contextKey !== record.contextKey) return false;

      const existingHourKey = String(x.localHourKey || getLocalHourKey(x.foundAt) || '');
      return existingHourKey && existingHourKey === recordHourKey;
    });

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }

    records.sort((a, b) => {
      const aRank = Number(a?.globalPosition || Number.MAX_SAFE_INTEGER);
      const bRank = Number(b?.globalPosition || Number.MAX_SAFE_INTEGER);

      if (aRank !== bRank) return aRank - bRank;
      return Number(b?.foundAt || 0) - Number(a?.foundAt || 0);
    });

    all[gameKey].records = records;
    savePositions(all);
    return record;
  }

  function formatOverflowRank(loadedGamesCount) {
    const loaded = Number(loadedGamesCount || 0);
    if (loaded >= 1000) return '>1000';
    if (loaded > 0) return '>' + loaded;
    return '—';
  }

  function saveLimitReachedPosition(game) {
    const safeGame = game || {
      id: null,
      name: targetText || 'Unknown game'
    };
    const foundAt = Date.now();

    const record = {
      url: location.href,
      path: location.pathname,
      contextKey: getSearchContextKey(),
      tags: getSearchTags(),
      page: getEstimatedCurrentPage(),
      pageSize: lastNumItems || DEFAULT_PAGE_SIZE,
      positionOnPage: 0,
      globalPosition: Number.MAX_SAFE_INTEGER,
      loadedGamesCount: getLoadedGamesCount(),
      meta: getSearchMeta(),
      foundAt,
      localDayKey: getLocalDayKey(foundAt),
      localHourKey: getLocalHourKey(foundAt),
      limitReached: true,
      displayRank: formatOverflowRank(getLoadedGamesCount()),
      game: {
        id: safeGame?.id || null,
        name: safeGame?.name || targetText || 'Unknown game'
      }
    };

    return upsertGameRecord(safeGame, record);
  }

  function getCurrentSearchUrlKey() {
    return location.origin + location.pathname + location.search;
  }

  function getComparableSearchUrlKey(url = location.href) {
    try {
      const parsed = new URL(url, location.origin);
      [...parsed.searchParams.keys()].forEach(key => {
        if (key.startsWith('__cf_') || key.startsWith('cf_')) {
          parsed.searchParams.delete(key);
        }
      });
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const gamesIndex = pathParts.indexOf('games');
      const seriesKey = getSearchSeriesFromPath(parsed.pathname) || 'popular';
      const filterParts = gamesIndex >= 0
        ? pathParts
          .slice(gamesIndex + 1)
          .filter(part => !isKnownSeriesPathPart(part))
          .map(part => normalize(part))
          .sort()
        : pathParts.map(part => normalize(part));
      const normalizedSearch = [...parsed.searchParams.entries()]
        .map(([key, value]) => [String(key), String(value)])
        .sort((a, b) => `${a[0]}=${a[1]}`.localeCompare(`${b[0]}=${b[1]}`));
      const search = new URLSearchParams(normalizedSearch).toString();
      const seriesPathPart = getSeriesPathPart(seriesKey);
      const pathKey = gamesIndex >= 0
        ? `/games/${seriesPathPart ? `${seriesPathPart}/` : ''}${filterParts.join('/')}`
        : `/${filterParts.join('/')}`;
      return parsed.origin + pathKey.replace(/\/$/, '') + (search ? `?${search}` : '');
    } catch (_) {
      return String(url || '').replace(/([?&])__cf_[^&]+=[^&]*/g, '$1').replace(/[?&]$/, '');
    }
  }

  function isSameSearchUrl(left, right = location.href) {
    return getComparableSearchUrlKey(left) === getComparableSearchUrlKey(right);
  }

  function isCloudflareChallengePage() {
    const text = normalize(document.body?.innerText || document.title || '');
    return !!(
      document.querySelector('[name="cf-turnstile-response"], .cf-turnstile, #challenge-running, #challenge-stage') ||
      location.search.includes('__cf_chl') ||
      text.includes('checking your browser') ||
      text.includes('verify you are human') ||
      text.includes('just a moment') ||
      text.includes('please wait while we verify') ||
      text.includes('security check') ||
      text.includes('проверки безопасности') ||
      text.includes('один момент')
    );
  }

  function showCloudflareDisableWarning() {
    document.querySelector('#tm-cloudflare-disable-warning')?.remove();

    const warning = document.createElement('div');
    warning.id = 'tm-cloudflare-disable-warning';
    warning.innerHTML = `
      <strong>Itch Stats отключается для проверки Cloudflare.</strong>
      Пройдите проверку, затем включите скрипт снова.
    `;
    (document.body || document.documentElement).appendChild(warning);

    setTimeout(() => {
      warning.remove();
    }, 2400);
  }

  function stopForCloudflareChallenge(status = null) {
    if (!isCloudflareChallengePage()) return false;

    searching = false;
    pausedByHiddenTab = false;
    abortRefreshFlow('cloudflare challenge detected');
    showCloudflareDisableWarning();

    const button = document.querySelector('#tm-itch-search');
    if (button) button.textContent = 'Найти и листать';
    if (status) {
      status.textContent =
        'Скрипт отключается для проверки Cloudflare.\n' +
        'Пройдите проверку, затем включите скрипт снова.';
    }

    return true;
  }

  function isSearchPageReady() {
    if (!isGamesPage) return true;
    if (document.readyState !== 'complete') return false;
    const hasGamesContent = !!(
      document.querySelector('.game_cell, .browse_game_grid .game_cell, .game_grid_widget .game_cell') ||
      document.querySelector('.browse_game_grid, .game_grid_widget, .game_grid')
    );
    if (hasGamesContent) return true;
    if (isCloudflareChallengePage()) return false;
    return false;
  }

  function registerRefreshRedirectAttempt(targetKey) {
    const now = Date.now();
    const guard = safeJsonParse(sessionStorage.getItem(STORAGE_KEY_REFRESH_REDIRECT_GUARD), {});
    const sameTarget = guard?.targetKey === targetKey && now - Number(guard?.at || 0) < 12000;
    const count = sameTarget ? Number(guard.count || 0) + 1 : 1;

    sessionStorage.setItem(STORAGE_KEY_REFRESH_REDIRECT_GUARD, JSON.stringify({
      targetKey,
      count,
      at: now
    }));

    return count;
  }

  function clearRefreshRedirectGuard() {
    sessionStorage.removeItem(STORAGE_KEY_REFRESH_REDIRECT_GUARD);
  }

  function finishRefreshFlow() {
    const state = loadRefreshState();
    if (!state) return;

    clearRefreshState();

    if (state.summaryUrl && location.href !== state.summaryUrl) {
      setTransferredPendingSummaryWidget();
      location.href = state.summaryUrl;
    }
  }

  function advanceRefreshFlow(result) {
    const state = loadRefreshState();
    if (!state || state.phase !== 'search') return;

    const queue = Array.isArray(state.queue) ? state.queue : [];
    const nextIndex = Number(state.index || 0) + 1;

    state.index = nextIndex;
    state.lastResult = result || null;

    if (nextIndex >= queue.length) {
      finishRefreshFlow();
      return;
    }

    saveRefreshState(state);
    location.href = queue[nextIndex].url;
  }

  function getRefreshQueueItemLabel(item) {
    if (!item) return '';

    const sectionLabels = getFilterSectionConfigs().reduce((acc, section) => {
      acc[section.key] = section.title;
      return acc;
    }, {
      default: 'Общее',
      intersections: 'Пересечение'
    });
    const section = sectionLabels[item.section] || item.section || '';
    const series = getSeriesLabel(item.series);
    const label = item.label && item.label !== 'Default' ? `: ${item.label}` : '';

    return [section + label, series].filter(Boolean).join(' / ');
  }

  function getRefreshProgressText(extraLines = []) {
    const state = loadRefreshState();
    if (!state || state.phase !== 'search') return '';

    const queue = Array.isArray(state.queue) ? state.queue : [];
    const total = queue.length;
    const index = Math.min(Math.max(Number(state.index || 0), 0), Math.max(total - 1, 0));
    const item = queue[index] || null;
    const completed = Math.min(index, total);
    const percent = total ? Math.round((completed / total) * 100) : 0;
    const gameName = state.game?.name || targetText || 'Unknown game';
    const itemLabel = getRefreshQueueItemLabel(item);

    return [
      `Обновление аналитики: ${gameName}`,
      `Готово: ${completed}/${total} (${percent}%)`,
      itemLabel ? `Сейчас: ${itemLabel}` : '',
      ...extraLines
    ].filter(Boolean).join('\n');
  }

  function setSearchStatus(status, lines = [], fallbackText = '') {
    if (!status) return;

    const extraLines = Array.isArray(lines)
      ? lines.filter(Boolean)
      : [lines].filter(Boolean);
    const refreshText = getRefreshProgressText(extraLines);

    status.textContent = refreshText || extraLines.join('\n') || fallbackText;
  }

  function getGameKey(game) {
    if (game?.id) return `id:${game.id}`;

    const name = normalize(game?.name || targetText);
    if (name) return `name:${name}`;

    return null;
  }

  function getCurrentGameIdFromSummaryUrl() {
    const match = location.pathname.match(/^\/game\/summary\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function getSearchTags() {
    const pathParts = location.pathname
      .split('/')
      .filter(Boolean)
      .filter(x => !isIgnoredSearchSegment(x));

    const params = new URLSearchParams(location.search);
    const tags = [];

    pathParts.forEach(x => tags.push(x));

    for (const [key, value] of params.entries()) {
      if (value) tags.push(`${key}:${value}`);
      else tags.push(key);
    }

    return tags.length ? tags.join('/') : 'без фильтров';
  }

  function getSearchMeta() {
    const parts = location.pathname.split('/').filter(Boolean);
    const params = new URLSearchParams(location.search);
    const refreshState = loadRefreshState();
    const queueItem = refreshState && refreshState.phase === 'search'
      ? (Array.isArray(refreshState.queue) ? refreshState.queue[Number(refreshState.index || 0)] : null)
      : null;
    const queueItemMatchesPage = !!(queueItem?.url && isSameSearchUrl(queueItem.url, location.href));
    const gameMetaCache = loadGameMeta();
    const gameMeta = (() => {
      const game = refreshState?.game || targetGame;
      if (!game) return null;
      if (game.id && gameMetaCache['id:' + game.id]) return gameMetaCache['id:' + game.id];
      const nameKey = normalize(game.name);
      if (nameKey && gameMetaCache['name:' + nameKey]) return gameMetaCache['name:' + nameKey];
      return null;
    })();
    const metaSections = getEmptyMetaSections();
    getFilterSectionConfigs().forEach(section => {
      metaSections[section.key] = {
        labels: Array.isArray(gameMeta?.sections?.[section.key]?.labels)
          ? gameMeta.sections[section.key].labels
          : getRecordSectionLabels({ meta: gameMeta }, section.key),
        links: getRecordSectionLinks(gameMeta, section.key)
      };
    });

    const category = getSearchCategoryFromPath(location.pathname);
    const sections = getEmptyMetaSections();

    function pushSectionLabel(sectionKey, label) {
      const normalizedLabel = normalizeSectionLabel(sectionKey, label);
      if (!normalizedLabel || isIgnoredMetaLabel(normalizedLabel)) return;
      sections[sectionKey].labels.push(normalizedLabel);
    }

    function addBySlug(value) {
      if (!value) return;
      if (isIgnoredSearchSegment(value)) return;
      const normalizedValue = normalize(value);

      if (normalizedValue.startsWith('tag-')) {
        pushSectionLabel('tags', canonicalizeLabelWithLinks('tag', getLabelFromSearchToken('tag', normalizedValue), metaSections.tags.links));
        return;
      }

      if (normalizedValue.startsWith('genre-')) {
        pushSectionLabel('genres', canonicalizeLabelWithLinks('genre', getLabelFromSearchToken('genre', normalizedValue), metaSections.genres.links));
        return;
      }

      if (normalizedValue.startsWith('platform-')) {
        const tokenMatch = findLinkEntryByToken('platform', normalizedValue, metaSections.platforms.links);
        pushSectionLabel('platforms', normalizePlatformLabel(tokenMatch?.label || getLabelFromSearchToken('platform', normalizedValue)));
        return;
      }

      if (normalizedValue.startsWith('lang-')) {
        pushSectionLabel('languages', canonicalizeLabelWithLinks('language', getLabelFromSearchToken('language', normalizedValue), metaSections.languages.links));
        return;
      }

      const mappedPrice = getKnownFilterLabel('price', normalizedValue);
      if (mappedPrice) {
        pushSectionLabel('price', canonicalizeLabelWithLinks('price', mappedPrice, metaSections.price.links));
        return;
      }

      const mappedType = getKnownFilterLabel('type', normalizedValue);
      if (mappedType) {
        pushSectionLabel('type', canonicalizeLabelWithLinks('type', mappedType, metaSections.type.links));
        if (normalizedValue === 'html5') {
          pushSectionLabel('platforms', 'Web');
        }
        return;
      }

      const mappedMisc = getKnownFilterLabel('misc', normalizedValue);
      if (mappedMisc) {
        pushSectionLabel('misc', canonicalizeLabelWithLinks('misc', mappedMisc, metaSections.misc.links));
        return;
      }

      const mappedSession = getKnownFilterLabel('session_length', normalizedValue);
      if (mappedSession) {
        pushSectionLabel('session_length', canonicalizeLabelWithLinks('session_length', mappedSession, metaSections.session_length.links));
        return;
      }

      const mappedMultiplayer = getKnownFilterLabel('multiplayer', normalizedValue);
      if (mappedMultiplayer) {
        pushSectionLabel('multiplayer', canonicalizeLabelWithLinks('multiplayer', mappedMultiplayer, metaSections.multiplayer.links));
        return;
      }

      const mappedLanguage = getKnownFilterLabel('language', normalizedValue);
      if (mappedLanguage) {
        pushSectionLabel('languages', canonicalizeLabelWithLinks('language', mappedLanguage, metaSections.languages.links));
        return;
      }

      const platformLabel = getKnownPlatformLabel(normalizedValue);
      if (platformLabel) {
        pushSectionLabel('platforms', platformLabel);
      }
    }

    parts.forEach(addBySlug);

    for (const [key, value] of params.entries()) {
      addBySlug(key);
      addBySlug(value);
    }

    if (queueItemMatchesPage) {
      if (sections[queueItem.section]) {
        pushSectionLabel(queueItem.section, queueItem.label);
      }
      if (queueItem.section === 'intersections' && Array.isArray(queueItem.parts)) {
        queueItem.parts.forEach(part => {
          if (!part?.label) return;
          const sectionKey = getFilterSectionKeyByType(part.type);
          if (sectionKey) pushSectionLabel(sectionKey, part.label);
        });
      }
    }

    getFilterSectionConfigs().forEach(section => {
      sections[section.key].labels = normalizeLabelList(sections[section.key].labels);
      sections[section.key].links = buildFilterLinkEntries(section.type, sections[section.key].labels, metaSections[section.key].links);
    });

    return {
      category,
      sections,
      tags: sections.tags.labels,
      genres: sections.genres.labels,
      platforms: sections.platforms.labels,
      intersectionId: queueItemMatchesPage && queueItem?.section === 'intersections'
        ? String(queueItem.id || '')
        : '',
      summaryLabel: queueItemMatchesPage ? queueItem.label : ''
    };
  }

  function getSearchLabelsFromRecord(record) {
    if (!record) return [];

    const labels = [];
    const recordCategory = getRecordCategory(record);

    if (recordCategory) labels.push(recordCategory);
    if (record.meta?.summaryLabel) labels.push(record.meta.summaryLabel);

    getFilterSectionConfigs().forEach(section => {
      getRecordSectionLabels(record, section.key)
        .filter(label => !isIgnoredMetaLabel(label))
        .forEach(label => labels.push(label));
    });

    const rawTags = String(record.tags || '');
    const parts = String(record.path || '')
      .split('/')
      .filter(Boolean);

    if (!labels.length && recordCategory) {
      labels.push(recordCategory);
    }

    parts
      .filter(part => {
        const normalizedPart = normalize(part);
        return normalizedPart.startsWith('tag-')
          || normalizedPart.startsWith('genre-')
          || normalizedPart.startsWith('platform-')
          || normalizedPart.startsWith('lang-')
          || !!getKnownPlatformLabel(normalizedPart)
          || !!getKnownFilterLabel('price', normalizedPart)
          || !!getKnownFilterLabel('type', normalizedPart)
          || !!getKnownFilterLabel('misc', normalizedPart)
          || !!getKnownFilterLabel('session_length', normalizedPart)
          || !!getKnownFilterLabel('multiplayer', normalizedPart)
          || !!getKnownFilterLabel('language', normalizedPart);
      })
      .map(part => {
        const normalizedPart = normalize(part);
        return getKnownPlatformLabel(normalizedPart)
          || getKnownFilterLabel('price', normalizedPart)
          || getKnownFilterLabel('type', normalizedPart)
          || getKnownFilterLabel('misc', normalizedPart)
          || getKnownFilterLabel('session_length', normalizedPart)
          || getKnownFilterLabel('multiplayer', normalizedPart)
          || getKnownFilterLabel('language', normalizedPart)
          || part.replace(/^(tag|genre|platform|lang)-/, '').replaceAll('-', ' ');
      })
      .filter(label => !isIgnoredMetaLabel(label))
      .forEach(label => labels.push(label));

    rawTags
      .split(/[\/|]/)
      .map(x => x.trim())
      .filter(Boolean)
      .filter(x => x !== 'без фильтров')
      .filter(x => !x.startsWith('sort:'))
      .map(x => {
        const normalizedValue = normalize(x);
        return getKnownPlatformLabel(normalizedValue)
          || getKnownFilterLabel('price', normalizedValue)
          || getKnownFilterLabel('type', normalizedValue)
          || getKnownFilterLabel('misc', normalizedValue)
          || getKnownFilterLabel('session_length', normalizedValue)
          || getKnownFilterLabel('multiplayer', normalizedValue)
          || getKnownFilterLabel('language', normalizedValue)
          || x.replace(/^(tag|genre|platform|lang)-/, '').replaceAll('-', ' ');
      })
      .filter(tag => !isIgnoredMetaLabel(tag))
      .forEach(tag => labels.push(tag));

    return [...new Set(labels.map(x => String(x).trim()).filter(Boolean))];
  }

  function getPlatformLabelsFromRecordContext(record) {
    if (!record) return [];

    const labels = [];

    if (Array.isArray(record.meta?.platforms)) {
      record.meta.platforms.forEach(platform => labels.push(normalizePlatformLabel(platform)));
    }

    String(record.path || '')
      .split('/')
      .filter(Boolean)
      .map(part => getKnownPlatformLabel(part))
      .filter(Boolean)
      .forEach(label => labels.push(label));

    String(record.tags || '')
      .split(/[\/|]/)
      .map(x => getKnownPlatformLabel(String(x || '').trim()))
      .filter(Boolean)
      .forEach(label => labels.push(label));

    const recordTypeLabels = getRecordSectionLabels(record, 'type');
    if (recordTypeLabels.some(label => normalize(label) === 'html5')) {
      labels.push('Web');
    }

    return [...new Set(labels.map(x => String(x).trim()).filter(Boolean))];
  }

  function getSearchContextKey() {
    const tags = getSearchTags();
    const params = new URLSearchParams(location.search);
    const sort = params.get('sort') || '';

    return [
      location.pathname,
      tags,
      sort ? `sort:${sort}` : ''
    ].filter(Boolean).join(' | ');
  }

  function getGameCards() {
    return [
      ...document.querySelectorAll(`
        .game_cell,
        .browse_game_grid .game_cell,
        .game_grid_widget .game_cell
      `)
    ].filter(Boolean);
  }

  function getCardTitle(card) {
    const titleNode =
      card.querySelector?.('.title') ||
      card.querySelector?.('.game_title') ||
      card.querySelector?.('a.title') ||
      card.querySelector?.('a.game_link') ||
      card.querySelector?.('a[href]');

    return normalize(
      titleNode?.innerText ||
      titleNode?.textContent ||
      card.getAttribute?.('title') ||
      card.getAttribute?.('aria-label') ||
      card.innerText ||
      card.textContent
    );
  }

  function getCoverElement(card) {
    return (
      card.querySelector('.game_thumb') ||
      card.querySelector('.thumb_link') ||
      card.querySelector('.cover_link') ||
      card.querySelector('.game_cover') ||
      card.querySelector('a[href] img')?.closest('a') ||
      card.querySelector('img')
    );
  }

  function findGameByName(name) {
    const query = normalize(name);
    if (!query) return null;

    for (const card of getGameCards()) {
      const title = getCardTitle(card);
      if (title.includes(query)) return card;
    }

    return null;
  }

  function getVisibleIndex(card) {
    const cards = getGameCards();
    return cards.indexOf(card) + 1;
  }

  function getLoadedGamesCount() {
    return getGameCards().length;
  }

  function getEstimatedCurrentPage() {
    if (lastLoadedPage) return Number(lastLoadedPage);
    return Math.ceil(Math.max(1, getLoadedGamesCount()) / (lastNumItems || DEFAULT_PAGE_SIZE));
  }

  function buildRecord(card, game) {
    const safeGame = game || {
      id: null,
      name: targetText || getCardTitle(card) || 'Unknown game'
    };
    const foundAt = Date.now();

    const index = getVisibleIndex(card);
    const pageSize = lastNumItems || DEFAULT_PAGE_SIZE;
    const page = Math.ceil(Math.max(1, index) / pageSize);
    const positionOnPage = ((index - 1) % pageSize) + 1;
    const globalPosition = index;
    const tags = getSearchTags();
    const contextKey = getSearchContextKey();

    return {
      url: location.href,
      path: location.pathname,
      contextKey,
      tags,
      page,
      pageSize,
      positionOnPage,
      globalPosition,
      loadedGamesCount: getLoadedGamesCount(),
      meta: getSearchMeta(),
      foundAt,
      localDayKey: getLocalDayKey(foundAt),
      localHourKey: getLocalHourKey(foundAt),
      game: {
        id: safeGame?.id || null,
        name: safeGame?.name || targetText || 'Unknown game'
      }
    };
  }

  function saveFoundPosition(card, game) {
    if (!card) return null;

    const safeGame = game || {
      id: null,
      name: targetText || getCardTitle(card) || 'Unknown game'
    };

    const record = buildRecord(card, safeGame);
    return upsertGameRecord(safeGame, record);
  }

  function getFoundInfoElement(card) {
    return foundInfoByCard.get(card) || card?.querySelector?.('.tm-found-info') || null;
  }

  function positionFoundInfoElement(card, info) {
    if (!card || !info) return;

    const rect = card.getBoundingClientRect();
    const left = window.scrollX + rect.left + (rect.width / 2);
    const top = window.scrollY + rect.bottom + 32;

    info.style.left = `${left}px`;
    info.style.top = `${top}px`;
  }

  function removeFoundInfoElement(card) {
    const info = getFoundInfoElement(card);
    if (!info) return;

    if (typeof info._tmCleanupPosition === 'function') {
      info._tmCleanupPosition();
    }

    info.remove();
    foundInfoByCard.delete(card);
  }

  function findDashboardGameMatch(game) {
    if (!game) return null;

    loadDashboardGamesFromCache();

    if (game.id) {
      const byId = dashboardGames.find(item => String(item?.id) === String(game.id));
      if (byId) return byId;
    }

    const wantedName = normalize(game.name);
    if (!wantedName) return null;

    return dashboardGames.find(item => normalize(item?.name) === wantedName) || null;
  }

  function getSummaryUrlForGame(game) {
    const cachedGame = findDashboardGameMatch(game);
    const gameId = game?.id || cachedGame?.id || null;
    if (!gameId) return '';
    return `https://itch.io/game/summary/${encodeURIComponent(gameId)}`;
  }

  function buildSummaryFocusTarget(record) {
    if (!record || typeof record !== 'object') return null;

    const meta = record.meta && typeof record.meta === 'object' ? record.meta : {};
    const series = getRecordSeries(record) || getSearchSeriesFromPath(record.path || '') || 'popular';
    const summaryLabel = String(meta.summaryLabel || '').trim();
    const sectionLabels = getFilterSectionConfigs().reduce((acc, section) => {
      acc[section.key] = getRecordSectionLabels(record, section.key);
      return acc;
    }, {});

    if (isDefaultSummaryRecord(record)) {
      return {
        section: 'default',
        label: 'Default',
        series
      };
    }

    if (summaryLabel) {
      if (summaryLabel.includes(' + ')) {
        return {
          section: 'intersections',
          label: summaryLabel,
          series
        };
      }

      const summarySection = getFilterSectionConfigs().find(section => {
        return sectionLabels[section.key].some(item => normalize(item) === normalize(summaryLabel));
      });
      if (summarySection) {
        return { section: summarySection.key, label: summaryLabel, series };
      }
    }

    const pathParts = getSearchPathParts(record.path || '');
    const gameIndex = pathParts.indexOf('games');
    const filterParts = gameIndex >= 0
      ? pathParts.slice(gameIndex + 1).filter(part => part && !isKnownSeriesPathPart(part))
      : [];

    for (const part of filterParts) {
      const sectionKey = detectFilterSectionKeyFromHref(`https://itch.io/games/${part}`);
      if (sectionKey) {
        const sectionConfig = getFilterSectionConfigByKey(sectionKey);
        const firstLabel = sectionLabels[sectionKey]?.[0] || '';
        const fallbackLabel = getLabelFromSearchToken(sectionConfig?.type || '', part)
          || normalizeSectionLabel(sectionKey, part.replace(/^(tag|genre|platform|lang)-/, '').replaceAll('-', ' '));
        return {
          section: sectionKey,
          label: firstLabel || fallbackLabel,
          series
        };
      }
    }

    for (const section of getFilterSectionConfigs()) {
      if (sectionLabels[section.key]?.[0]) {
        return { section: section.key, label: sectionLabels[section.key][0], series };
      }
    }

    return {
      section: 'default',
      label: 'Default',
      series
    };
  }

  function placeFoundInfoUnderCover(card, record, game) {
    if (!record || !card) return null;

    removeFoundInfoElement(card);

    const safeGame = game || record.game || {
      id: null,
      name: targetText || 'Unknown game'
    };

    const meta = getSearchMeta();

    const mainChips = `
      <div class="tm-main-chip-row">
        <span class="tm-main-chip ${meta.category === 'Popular' ? 'tm-active' : ''}">Popular🔥</span>
        <span class="tm-main-chip ${meta.category === 'New & Popular' ? 'tm-active' : ''}">New & Popular🌟</span>
      </div>
    `;

    const secondaryChips = `
      <div class="tm-sub-chip-row">
        <span class="tm-sub-chip ${meta.category === 'Top Rated' ? 'tm-active' : ''}">Top Rated</span>
        <span class="tm-sub-chip ${meta.category === 'Top Sellers' ? 'tm-active' : ''}">Top Sellers</span>
      </div>
    `;

    const chips = [
      ...meta.tags.map(tag => `<span class="tm-chip">${escapeHtml(tag)}</span>`),
      ...meta.genres.map(genre => `<span class="tm-chip">${escapeHtml(genre)}</span>`),
      ...meta.platforms.map(platform => `<span class="tm-chip">${escapeHtml(platform)}</span>`)
    ].filter(Boolean).join('');

    const info = document.createElement('div');
    info.className = 'tm-found-info';

    const pos = Number(record.globalPosition || 999999);

    let rankClass = 'tm-found-rank-default';
    let rankIcon = '';

    if (pos === 1) {
      rankClass = 'tm-found-rank-diamond';
      rankIcon = '💎';
    } else if (pos >= 2 && pos <= 10) {
      rankClass = 'tm-found-rank-gold';
      rankIcon = '🥇';
    } else if (pos >= 11 && pos <= 20) {
      rankClass = 'tm-found-rank-silver';
      rankIcon = '🥈';
    } else if (pos >= 21 && pos <= 30) {
      rankClass = 'tm-found-rank-bronze';
      rankIcon = '🥉';
    }

    info.classList.add(rankClass);

    info.innerHTML = `
      <span class="tm-big-place">
        ${rankIcon ? `<span class="tm-rank-icon">${rankIcon}</span>` : ''}
        <span>#${record.globalPosition}</span>
      </span>
      <span class="tm-small-line">${escapeHtml(safeGame?.name || targetText)}</span>
      <span class="tm-small-line">Page: ${record.page}</span>
      ${mainChips}
      ${secondaryChips}
      ${chips ? `<div class="tm-chip-row">${chips}</div>` : ''}
    `;

    const summaryUrl = getSummaryUrlForGame(safeGame);
    const focusTarget = buildSummaryFocusTarget(record);

    document.body.appendChild(info);
    positionFoundInfoElement(card, info);

    const updatePosition = () => positionFoundInfoElement(card, info);
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition);
    info._tmCleanupPosition = () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
    foundInfoByCard.set(card, info);

    function bindSummaryNavigationTarget(element) {
      if (!element || !summaryUrl || !focusTarget) return;

      element.classList.add('tm-clickable');
      element.title = 'Открыть аналитику и перейти к записи';
      element._tmSummaryNavigate = () => {
        setTransferredPendingSummaryWidget();
        setTransferredPendingSummaryFocus(focusTarget);
        location.href = summaryUrl;
      };

      if (!element._tmSummaryNavigateBound) {
        element.addEventListener('click', event => {
          if (event.target?.closest?.('a, button, input, textarea, select, label')) return;
          event.preventDefault();
          event.stopPropagation();
          element._tmSummaryNavigate?.();
        });
        element._tmSummaryNavigateBound = true;
      }
    }

    bindSummaryNavigationTarget(info);
    bindSummaryNavigationTarget(card);

    return info;
  }

  function playConfettiFromElement(element) {
    if (!element || confettiPlayed.has(element)) return;
    confettiPlayed.add(element);

    const rect = element.getBoundingClientRect();

    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height * 0.5;

    const layer = document.createElement('div');
    layer.className = 'tm-confetti-layer';
    layer.style.left = `${originX}px`;
    layer.style.top = `${originY}px`;

    const colors = [
      '#ff004c',
      '#ff9900',
      '#ffe600',
      '#00d26a',
      '#00b7ff',
      '#9b5cff',
      '#ffffff',
      '#ff7de9',
      '#7df9ff'
    ];

    for (let i = 0; i < 68; i++) {
      const piece = document.createElement('div');
      piece.className = 'tm-confetti-piece';

      const angle = Math.random() * Math.PI * 2;
      const distance = 340 + Math.random() * 780;
      const dx = Math.cos(angle) * distance;
      const dy = -220 - Math.random() * 620 + Math.sin(angle) * 210;
      const dz = `${-700 + Math.random() * 1400}px`;

      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.left = '0px';
      piece.style.top = '0px';
      piece.style.setProperty('--dx', `${dx}px`);
      piece.style.setProperty('--dy', `${dy}px`);
      piece.style.setProperty('--dz', dz);
      piece.style.setProperty('--rx', `${360 + Math.random() * 900}deg`);
      piece.style.setProperty('--ry', `${360 + Math.random() * 900}deg`);
      piece.style.setProperty('--rz', `${360 + Math.random() * 900}deg`);
      piece.style.animationDelay = `${Math.random() * 90}ms`;
      piece.style.opacity = `${0.8 + Math.random() * 0.2}`;

      layer.appendChild(piece);
    }

    document.body.appendChild(layer);

    setTimeout(() => {
      layer.remove();
    }, 9800);
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForScrollToSettle(stableMs = 220, timeoutMs = 2200) {
    const startedAt = Date.now();
    let lastY = window.scrollY;
    let stableSince = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      await wait(60);

      const currentY = window.scrollY;
      if (Math.abs(currentY - lastY) <= 1) {
        if (Date.now() - stableSince >= stableMs) return;
      } else {
        lastY = currentY;
        stableSince = Date.now();
      }
    }
  }

  async function scrollToCardAndPlayConfetti(card, options = {}) {
    if (!card) return;
    const fast = options.fast === true;

    card.scrollIntoView({
      behavior: fast ? 'auto' : 'smooth',
      block: fast ? 'nearest' : 'center'
    });

    if (fast) {
      await wait(40);
    } else {
      await waitForScrollToSettle();
    }

    const info = getFoundInfoElement(card);
    playConfettiFromElement(info || card);
  }

  function getSearchModeOptions(refreshActive = false) {
    return refreshActive
      ? {
        fastScroll: true,
        tailStep: Math.max(window.innerHeight, SCROLL_STEP),
        extraTailStep: Math.max(SCROLL_STEP, Math.round(window.innerHeight * 0.9)),
        jumpPauseMs: 80,
        pageAdvanceTimeoutMs: 7000
      }
      : {
        fastScroll: false,
        tailStep: Math.max(Math.round(window.innerHeight * 0.72), Math.round(SCROLL_STEP * 0.55)),
        extraTailStep: Math.max(Math.round(window.innerHeight * 0.45), Math.round(SCROLL_STEP * 0.38)),
        jumpPauseMs: 220,
        pageAdvanceTimeoutMs: 12000
      };
  }

  function getStoredRecordsForGame(game) {
    if (!game) return [];

    const positions = loadPositions();
    const gameKey = getGameKey(game);
    const directRecords = Array.isArray(positions?.[gameKey]?.records)
      ? positions[gameKey].records
      : [];

    if (directRecords.length) return directRecords;

    const wantedName = normalize(game?.name);
    if (!wantedName) return [];

    return Object.values(positions || {})
      .flatMap(entry => Array.isArray(entry?.records) ? entry.records : [])
      .filter(record => {
        const recordName = normalize(record?.game?.name);
        return recordName && (recordName === wantedName || recordName.includes(wantedName) || wantedName.includes(recordName));
      });
  }

  function getBestStoredRecordForCurrentSearch(game) {
    const records = getStoredRecordsForGame(game);
    if (!records.length) return null;

    const currentContextKey = getSearchContextKey();
    const currentUrlKey = getComparableSearchUrlKey();

    const scored = records.map(record => {
      let score = 0;

      if (record?.contextKey === currentContextKey) score += 6;
      if (getComparableSearchUrlKey(record?.url || '') === currentUrlKey) score += 8;
      if (record?.path === location.pathname) score += 2;
      if (Number(record?.loadedGamesCount || 0) > 0) score += 1;

      return { record, score };
    });

    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;

      const aLoaded = Number(a.record?.loadedGamesCount || 0);
      const bLoaded = Number(b.record?.loadedGamesCount || 0);
      if (aLoaded !== bLoaded) return bLoaded - aLoaded;

      const aRank = Number(a.record?.globalPosition || 0);
      const bRank = Number(b.record?.globalPosition || 0);
      if (aRank !== bRank) return bRank - aRank;

      return Number(b.record?.foundAt || 0) - Number(a.record?.foundAt || 0);
    });

    return scored[0]?.record || null;
  }

  async function jumpToLastLoadedGame(game, status = null, options = {}) {
    const record = getBestStoredRecordForCurrentSearch(game);
    if (!record) return false;

    const cards = getGameCards();
    if (!cards.length) return false;

    const rememberedIndex = Math.max(
      Number(record?.loadedGamesCount || 0),
      Number(record?.globalPosition || 0),
      1
    );
    const anchorIndex = Math.min(rememberedIndex, cards.length) - 1;
    const anchorCard = cards[anchorIndex] || cards[cards.length - 1];
    if (!anchorCard) return false;

    if (status) {
      setSearchStatus(status, [
        options.fastScroll ? 'Перехожу к последней загруженной игре...' : 'Плавно перехожу к последней загруженной игре...',
        `Пролистано игр: ${Math.min(rememberedIndex, cards.length)}`
      ]);
    }

    anchorCard.scrollIntoView({
      behavior: options.fastScroll ? 'auto' : 'smooth',
      block: options.fastScroll ? 'end' : 'center'
    });

    if (options.fastScroll) {
      await wait(50);
    } else {
      await waitForScrollToSettle(260, 3200);
    }

    window.scrollBy({
      top: options.extraTailStep || Math.max(SCROLL_STEP, Math.round(window.innerHeight * 0.9)),
      behavior: options.fastScroll ? 'auto' : 'smooth'
    });

    if (options.fastScroll) {
      await wait(options.jumpPauseMs || 120);
    } else {
      await waitForScrollToSettle(260, 3200);
      await wait(options.jumpPauseMs || 220);
    }
    return true;
  }

  async function jumpToCurrentListTail(status = null, options = {}) {
    const cards = getGameCards();
    const lastCard = cards[cards.length - 1];
    if (!lastCard) return false;

    if (status) {
      setSearchStatus(status, [
        options.fastScroll ? 'Быстро перехожу к концу загруженного списка...' : 'Плавно листаю к концу загруженного списка...',
        `Пролистано игр: ${cards.length}`
      ]);
    }

    lastCard.scrollIntoView({
      behavior: options.fastScroll ? 'auto' : 'smooth',
      block: options.fastScroll ? 'end' : 'center'
    });

    if (options.fastScroll) {
      await wait(20);
    } else {
      await waitForScrollToSettle(260, 3200);
    }

    window.scrollBy({
      top: options.tailStep || Math.max(window.innerHeight, SCROLL_STEP),
      behavior: options.fastScroll ? 'auto' : 'smooth'
    });

    if (options.fastScroll) {
      await wait(options.jumpPauseMs || 80);
    } else {
      await waitForScrollToSettle(260, 3200);
      await wait(options.jumpPauseMs || 220);
    }
    return true;
  }

  async function waitForSearchResultsAdvance(snapshot, status = null, options = {}) {
    const startedAt = Date.now();
    const timeoutMs = Number(options.timeoutMs || 0) > 0 ? Number(options.timeoutMs) : 8000;
    const initialPage = Number(snapshot?.page || 0);
    const initialLoaded = Number(snapshot?.loaded || 0);
    const initialHeight = Number(snapshot?.height || 0);

    while (Date.now() - startedAt < timeoutMs) {
      if (!searching) return false;
      if (stopForCloudflareChallenge(status)) return false;

      const currentPage = Number(lastLoadedPage || 0);
      const currentLoaded = getLoadedGamesCount();
      const currentHeight = document.body.scrollHeight;

      if (
        currentPage > initialPage ||
        currentLoaded > initialLoaded ||
        currentHeight > initialHeight
      ) {
        await waitForSearchPageReady(status, 12000);
        return true;
      }

      if (status) {
        const nextPageHint = initialPage > 0 ? `${Math.min(initialPage + 1, MAX_SEARCH_PAGE)}` : 'следующей';
        setSearchStatus(status, [
          `Жду загрузку page ${nextPageHint}...`,
          `Пролистано игр: ${currentLoaded}`
        ]);
      }

      await sleep(options.pollMs || 120);
    }

    return false;
  }

  async function waitForSearchPageReady(status = null, timeoutMs = 90000) {
    if (!isGamesPage || isSearchPageReady()) return true;

    if (stopForCloudflareChallenge(status)) return false;

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (stopForCloudflareChallenge(status)) return false;

      if (status) {
        setSearchStatus(status, 'Жду полной загрузки списка игр...');
      }

      await sleep(500);
      if (isSearchPageReady()) return true;
    }

    return false;
  }

  function installTilt(card) {
    if (!card || tiltInstalled.has(card)) return;
    tiltInstalled.add(card);

    card.classList.add('tm-tilt-card');

    function resetTilt() {
      if (card.classList.contains('tm-rainbow-found')) {
        card.style.transform = `
          perspective(900px)
          translateY(-6px)
          scale(1.045)
        `;
      } else {
        card.style.transform = '';
      }
    }

    card.addEventListener('mousemove', event => {
      const baseRect = card.getBoundingClientRect();
      if (!baseRect.width || !baseRect.height) return;

      const x = Math.max(0, Math.min(1, (event.clientX - baseRect.left) / baseRect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - baseRect.top) / baseRect.height));

      const rotateY = (x - 0.5) * 14;
      const rotateX = -(y - 0.5) * 14;
      const scale = card.classList.contains('tm-rainbow-found') ? 1.045 : 1.02;

      card.style.transform = `
        perspective(900px)
        rotateX(${rotateX}deg)
        rotateY(${rotateY}deg)
        translateY(-6px)
        scale(${scale})
      `;
    });

    card.addEventListener('mouseleave', resetTilt);
  }

  function highlightCard(card, game, passive = false) {
    if (!card) return null;

    const safeGame = game || {
      id: null,
      name: targetText || getCardTitle(card) || 'Unknown game'
    };

    installTilt(card);
    card.classList.add('tm-rainbow-found');

    if (!card.style.transform) {
      card.style.transform = `
        perspective(900px)
        translateY(-6px)
        scale(1.045)
      `;
    }

    const record = saveFoundPosition(card, safeGame);

    if (record) {
      placeFoundInfoUnderCover(card, record, safeGame, passive);
    }

    const status = document.querySelector('#tm-itch-status');

    if (status && !passive && record) {
      status.textContent =
        `Найдено. Позиция сохранена\n` +
        `Page: ${record.page}, место: ${record.globalPosition}`;
    }

    return record;
  }

  function updateStatusScrolling() {
    const status = document.querySelector('#tm-itch-status');
    if (!status) return;

    const page = getEstimatedCurrentPage();
    const loaded = getLoadedGamesCount();

    setSearchStatus(status, [
      `Page: ${page}/${MAX_SEARCH_PAGE}`,
      `Пролистано игр: ${loaded}`
    ], (
      `Листаю страницу...\n` +
      `Page: ${page}/${MAX_SEARCH_PAGE}\n` +
      `Пролистано игр: ${loaded}`
    ));
  }

  function passiveScanOwnGames() {
    if (!isGamesPage) return;

    loadDashboardGamesFromCache();

    if (!dashboardGames.length) return;

    for (const game of dashboardGames) {
      if (!game?.name) continue;

      const card = findGameByName(game.name);

      if (!card) continue;
      if (passiveHighlighted.has(card)) continue;

      passiveHighlighted.add(card);
      highlightCard(card, game, true);
      scrollToCardAndPlayConfetti(card);
    }
  }

  async function searchLoop() {
    const button = document.querySelector('#tm-itch-search');
    const status = document.querySelector('#tm-itch-status');
    const refreshState = loadRefreshState();
    const refreshActive = !!(refreshState && refreshState.phase === 'search' && isSameGame(refreshState.game, targetGame));
    const searchMode = getSearchModeOptions(refreshActive);

    searching = true;
    pausedByHiddenTab = false;

    button.textContent = 'Остановить';
    updateStatusScrolling();

    const pageReady = await waitForSearchPageReady(status);
    if (!pageReady) {
      searching = false;
      button.textContent = 'Найти и листать';
      if (!isCloudflareChallengePage()) {
        status.textContent = 'Поиск остановлен: список игр не загрузился полностью.';
      }
      return;
    }

    const initiallyFound = findGameByName(targetText);
    if (!initiallyFound) {
      await jumpToLastLoadedGame(targetGame, status, searchMode);
    }

    let lastScrollY = -1;
    let lastScrollHeight = -1;
    let lastLoadedCount = -1;
    let lastKnownPage = Number(lastLoadedPage || 0);
    let stuckCount = 0;

    while (searching) {
      if (isCloudflareChallengePage()) {
        stopForCloudflareChallenge(status);
        return;
      }

      if (document.hidden) {
        pausedByHiddenTab = true;
        setSearchStatus(status, [
          'Пауза: вкладка скрыта.',
          'Поиск продолжится, когда ты вернёшься.'
        ]);
        await waitUntilVisible();
        if (!searching) break;
        pausedByHiddenTab = false;
        updateStatusScrolling();
      }

      passiveScanOwnGames();

      const found = findGameByName(targetText);

      if (found) {
        const safeTargetGame = targetGame || {
          id: null,
          name: targetText || getCardTitle(found) || 'Unknown game'
        };

        const record = highlightCard(found, safeTargetGame, false);
        scrollToCardAndPlayConfetti(found);

        searching = false;
        button.textContent = 'Найти и листать';
        if (refreshActive) {
          setTimeout(() => {
            advanceRefreshFlow({
              status: 'found',
              contextKey: record?.contextKey || getSearchContextKey(),
              url: getCurrentSearchUrlKey()
            });
          }, 250);
        }
        return;
      }

      const currentPage = getEstimatedCurrentPage();

      if (currentPage >= MAX_SEARCH_PAGE) {
        const safeTargetGame = targetGame || {
          id: null,
          name: targetText || 'Unknown game'
        };

        saveLimitReachedPosition(safeTargetGame);
        searching = false;
        button.textContent = 'Найти и листать';
        status.textContent =
          `Остановлено: достигнут лимит ${MAX_SEARCH_PAGE} page.\n` +
          `Пролистано игр: ${getLoadedGamesCount()}`;
        if (refreshActive && targetGame) {
          setTimeout(() => {
            advanceRefreshFlow({
              status: 'not-found',
              contextKey: getSearchContextKey(),
              url: getCurrentSearchUrlKey()
            });
          }, 250);
        }
        return;
      }

      const beforeY = window.scrollY;
      const beforeHeight = document.body.scrollHeight;
      const beforeLoaded = getLoadedGamesCount();
      const beforePage = Number(lastLoadedPage || 0);

      await jumpToCurrentListTail(status, searchMode);

      const advanced = await waitForSearchResultsAdvance({
        page: beforePage,
        loaded: beforeLoaded,
        height: beforeHeight
      }, status, {
        timeoutMs: searchMode.pageAdvanceTimeoutMs,
        pollMs: refreshActive ? 120 : 160
      });

      const afterY = window.scrollY;
      const afterHeight = document.body.scrollHeight;
      const afterLoaded = getLoadedGamesCount();
      const afterPage = Number(lastLoadedPage || 0);
      const changedDuringBurst =
        afterY !== beforeY ||
        afterHeight !== beforeHeight ||
        afterLoaded !== beforeLoaded ||
        afterPage !== beforePage;

      if (!advanced) {
        await sleep(refreshActive ? SCROLL_INTERVAL : 260);
      }

      if (!searching) break;
      if (stopForCloudflareChallenge(status)) return;

      passiveScanOwnGames();
      updateStatusScrolling();

      const currentY = window.scrollY;
      const currentHeight = document.body.scrollHeight;
      const currentLoaded = getLoadedGamesCount();
      const currentKnownPage = Number(lastLoadedPage || 0);

      if (
        !changedDuringBurst &&
        currentY === lastScrollY &&
        currentHeight === lastScrollHeight &&
        currentLoaded === lastLoadedCount &&
        currentKnownPage === lastKnownPage
      ) stuckCount++;
      else stuckCount = 0;

      lastScrollY = currentY;
      lastScrollHeight = currentHeight;
      lastLoadedCount = currentLoaded;
      lastKnownPage = currentKnownPage;

      if (stuckCount >= 6) {
        searching = false;
        button.textContent = 'Найти и листать';
        status.textContent =
          `Не найдено до конца страницы.\n` +
          `Пролистано игр: ${getLoadedGamesCount()}`;
        if (refreshActive) {
          setTimeout(() => {
            advanceRefreshFlow({
              status: 'not-found',
              contextKey: getSearchContextKey(),
              url: getCurrentSearchUrlKey()
            });
          }, 250);
        }
        return;
      }
    }

    if (button) button.textContent = 'Найти и листать';
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function waitUntilVisible() {
    return new Promise(resolve => {
      if (!document.hidden) {
        resolve();
        return;
      }

      const handler = () => {
        if (!document.hidden) {
          document.removeEventListener('visibilitychange', handler);
          resolve();
        }
      };

      document.addEventListener('visibilitychange', handler);
    });
  }

  function stopSearch(reason = 'Остановлено') {
    searching = false;
    pausedByHiddenTab = false;
    clearRefreshState();

    const button = document.querySelector('#tm-itch-search');
    const status = document.querySelector('#tm-itch-status');

    if (button) button.textContent = 'Найти и листать';
    if (status) status.textContent = reason;
  }

  function startSearch(gameOrName) {
    if (typeof gameOrName === 'string') {
      targetText = gameOrName;
      targetGame = {
        id: null,
        name: gameOrName
      };
    } else {
      targetGame = gameOrName || null;
      targetText = gameOrName?.name || '';
    }

    const input = document.querySelector('#tm-itch-query');
    const button = document.querySelector('#tm-itch-search');
    const status = document.querySelector('#tm-itch-status');
    const refreshState = loadRefreshState();
    const refreshActive = !!(refreshState && refreshState.phase === 'search' && isSameGame(refreshState.game, targetGame));

    input.value = targetText;

    if (!targetText.trim()) {
      status.textContent = 'Введите название игры';
      return;
    }

    if (searching) {
      stopSearch('Остановлено');
      return;
    }

    searchLoop().catch(error => {
      console.error('[itch.io stats] searchLoop failed:', error);
      if (refreshActive) abortRefreshFlow('search loop failed');
      searching = false;
      pausedByHiddenTab = false;
      button.textContent = 'Найти и листать';
      status.textContent =
        `Поиск остановлен из-за ошибки.\n` +
        `Подробности смотри в Console.`;
    });
  }

  async function maybeResumeRefreshFlow() {
    const state = loadRefreshState();
    if (!state || !state.game) return;

    if (isSummaryPage) {
      abortRefreshFlow('summary page should not auto-resume refresh');
      return;
    }

    if (isPublicGamePage && state.phase === 'fetch-meta') {
      cachePublicGameMetaIfAvailable();
      return;
    }

    if (!isGamesPage || state.phase !== 'search' || refreshAutostarted) return;

    const queue = Array.isArray(state.queue) ? state.queue : [];
    const item = queue[Number(state.index || 0)];
    if (!item) {
      abortRefreshFlow('missing queue item');
      return;
    }

    const currentKey = getComparableSearchUrlKey();
    const targetKey = getComparableSearchUrlKey(item.url);

    if (currentKey !== targetKey) {
      const redirectCount = registerRefreshRedirectAttempt(targetKey);
      if (redirectCount >= 3) {
        abortRefreshFlow('refresh redirect loop detected');
        const status = document.querySelector('#tm-itch-status');
        if (status) {
          status.textContent = 'Обновление остановлено: страница несколько раз открывалась заново до старта поиска.';
        }
        return;
      }

      location.href = item.url;
      return;
    }

    clearRefreshRedirectGuard();

    await waitForSearchPageReady(document.querySelector('#tm-itch-status'));
    if (!isSearchPageReady()) return;

    refreshAutostarted = true;
    setTimeout(() => {
      startSearch(state.game);
    }, 250);
  }

  function parseAjaxResponse(data) {
    if (!data || typeof data !== 'object') return;

    if ('page' in data && 'num_items' in data && 'content' in data) {
      lastLoadedPage = Number(data.page);
      lastNumItems = Number(data.num_items) || DEFAULT_PAGE_SIZE;

      const status = document.querySelector('#tm-itch-status');

      if (status && searching && !pausedByHiddenTab) {
        setSearchStatus(status, [
          `Загружена page ${lastLoadedPage}/${MAX_SEARCH_PAGE}`,
          `Пролистано игр: ${getLoadedGamesCount()}`
        ]);
      }

      setTimeout(() => {
        installTiltForVisibleCards();
        passiveScanOwnGames();
      }, 80);
    }
  }

  function installAjaxObserver() {
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      try {
        const clone = response.clone();
        const contentType = clone.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          clone.json().then(parseAjaxResponse).catch(() => {});
        }
      } catch (_) {}

      return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__tmUrl = url;
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        try {
          const contentType = this.getResponseHeader('content-type') || '';
          if (contentType.includes('application/json')) {
            parseAjaxResponse(JSON.parse(this.responseText));
          }
        } catch (_) {}
      });

      return originalSend.apply(this, arguments);
    };
  }

  function extractGameIdFromDashboardRow(row) {
    const links = [...row.querySelectorAll('a[href]')];

    for (const link of links) {
      const text = normalize(link.textContent);
      const href = link.href || link.getAttribute('href') || '';

      if (text === 'analytics' || href.includes('/game/analytics/')) {
        const match = href.match(/\/game\/analytics\/([^/?#]+)/);
        if (match) return match[1];
      }
    }

    for (const link of links) {
      const href = link.href || link.getAttribute('href') || '';

      let match = href.match(/\/game\/summary\/([^/?#]+)/);
      if (match) return match[1];

      match = href.match(/\/game\/edit\/([^/?#]+)/);
      if (match) return match[1];

      match = href.match(/[?&]game_id=([^&#]+)/);
      if (match) return match[1];
    }

    return null;
  }

  function extractPublishedGamesFromDashboardPage() {
    const rows = [...document.querySelectorAll('.game_list .game_row, .game_row')];
    const games = [];

    for (const row of rows) {
      const rowText = normalize(row.textContent);
      const isPublished = rowText.includes('published');

      if (!isPublished) continue;

      const nameNode =
        row.querySelector('.game_title .game_link') ||
        row.querySelector('.game_title a.game_link') ||
        row.querySelector('a.game_link') ||
        row.querySelector('.game_title a') ||
        row.querySelector('.game_title') ||
        row.querySelector('.title');

      const name = String(nameNode?.textContent || '').trim();
      if (!name) continue;

      const id = extractGameIdFromDashboardRow(row);

      const gameUrlNode =
        row.querySelector('.game_title a.game_link') ||
        row.querySelector('a.game_link') ||
        nameNode;

      const href = gameUrlNode?.href || gameUrlNode?.getAttribute('href') || '';

      if (!games.some(g => normalize(g.name) === normalize(name))) {
        games.push({
          id,
          name,
          href,
          cachedAt: Date.now()
        });
      }
    }

    return games;
  }

  function cacheDashboardGamesIfOnDashboard() {
    if (!isDashboardPage) return;

    const games = extractPublishedGamesFromDashboardPage();

    if (games.length) {
      dashboardGames = games;
      saveDashboardGames(games);
      console.log('[itch.io stats] cached published games:', games);
    }
  }

  function createSearchWidget() {
    loadDashboardGamesFromCache();

    const openButton = document.createElement('button');
    openButton.id = 'tm-itch-open-button';
    openButton.textContent = '🔎';
    openButton.title = 'Открыть itch.io stats';
    document.body.appendChild(openButton);

    const widget = document.createElement('div');
    widget.id = 'tm-itch-finder';
    widget.innerHTML = `
      <div class="tm-widget-head">
        <div class="tm-widget-title">itch.io stats</div>
        <button id="tm-itch-collapse" title="Свернуть">×</button>
      </div>
      <div class="tm-widget-scroll-body">
        <input id="tm-itch-query" placeholder="Название игры..." />
        <button id="tm-itch-search">Найти и листать</button>
        <div id="tm-itch-status">Введите название игры</div>

        <div class="tm-games-title">Мои публичные игры</div>
        <div id="tm-dashboard-games">Кэша нет. Открой Dashboard.</div>
      </div>
    `;
    document.body.appendChild(widget);

    installWidgetDrag(widget, widget.querySelector('.tm-widget-head'));

    const input = document.querySelector('#tm-itch-query');
    const button = document.querySelector('#tm-itch-search');
    const status = document.querySelector('#tm-itch-status');
    const dashboardList = document.querySelector('#tm-dashboard-games');
    const collapseButton = document.querySelector('#tm-itch-collapse');
    const pendingSearch = transferredPayload?.pendingSearch;
    const refreshProgress = getRefreshProgressText();

    if (status && refreshProgress) {
      status.textContent = refreshProgress;
    }

    function setCollapsed(collapsed, options = {}) {
      const shouldStopSearch = options.stopSearch !== false;
      const shouldPersist = options.persist !== false;

      if (collapsed && shouldStopSearch && searching) {
        stopSearch('Остановлено: виджет свёрнут');
      }

      widget.classList.toggle('tm-collapsed', collapsed);
      openButton.classList.toggle('tm-visible', collapsed);
      if (shouldPersist) {
        localStorage.setItem(STORAGE_KEY_COLLAPSED, collapsed ? '1' : '0');
      }
    }

    collapseButton.addEventListener('click', () => setCollapsed(true));
    openButton.addEventListener('click', () => setCollapsed(false));

    const collapsedState = localStorage.getItem(STORAGE_KEY_COLLAPSED);

    if (refreshProgress) {
      setCollapsed(false, { stopSearch: false, persist: false });
    } else if (collapsedState === null) {
      setCollapsed(true, { stopSearch: false });
    } else {
      setCollapsed(collapsedState === '1', { stopSearch: false });
    }

    button.addEventListener('click', () => startSearch(input.value));

    if (pendingSearch?.name) {
      transferredPayload.pendingSearch = null;
      setTimeout(() => startSearch(pendingSearch), 0);
    }

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') button.click();
    });

    if (!dashboardGames.length) {
      dashboardList.textContent = 'Кэша нет. Открой Dashboard.';
    } else {
      dashboardList.innerHTML = '';

      dashboardGames.forEach(game => {
        const item = document.createElement('div');
        item.className = 'tm-game-item';
        item.textContent = game.name;
        item.title = 'Клик — искать эту игру';
        item.addEventListener('click', () => startSearch(game));
        dashboardList.appendChild(item);
      });
    }

    setTimeout(() => {
      installTiltForVisibleCards();
      passiveScanOwnGames();
    }, 300);
  }

  function installTiltForVisibleCards() {
    if (!isGamesPage) return;

    for (const card of getGameCards()) {
      installTilt(card);
    }
  }

  function getPublicGameIdFromPage() {
    const root = document.querySelector('[id^="view_html_game_"]');
    const match = root?.id?.match(new RegExp('view_html_game_([0-9]+)'));
    return match ? match[1] : null;
  }

  function extractInfoPanelMetaFromPublicGamePage() {
    const gameId = getPublicGameIdFromPage();
    if (!gameId) return null;

    const root = document.querySelector('#view_html_game_' + CSS.escape(gameId));
    const panel =
      root?.querySelector('div.columns div.left_col.column div.more_information_toggle.open div.info_panel_wrapper') ||
      root?.querySelector('.info_panel_wrapper') ||
      document.querySelector('.info_panel_wrapper');

    if (!panel) return null;

    const result = {
      id: gameId,
      url: location.href,
      name: document.querySelector('.game_title')?.textContent?.trim() || document.querySelector('h1')?.textContent?.trim() || document.title.trim(),
      sections: getEmptyMetaSections(),
      genres: [],
      platforms: [],
      tags: [],
      genreLinks: [],
      platformLinks: [],
      tagLinks: [],
      cachedAt: Date.now()
    };

    const rows = [...panel.querySelectorAll('tr, .info_panel_row, .info_row, .metadata_row, .info_panel_widget')];
    const typedLinkSections = new Map();

    for (const row of rows) {
      const sectionKey = detectMetaType(row);
      if (!sectionKey) continue;

      [...row.querySelectorAll('a[href]')].forEach(link => {
        typedLinkSections.set(link, sectionKey);
      });
    }

    const links = [...panel.querySelectorAll('a[href]')];

    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const value = String(link.textContent || '').trim();
      if (!value) continue;
      const forcedType = typedLinkSections.get(link) || detectFilterSectionKeyFromHref(href, value) || '';
      if (!forcedType || !result.sections[forcedType]) continue;

      const normalizedLabel = normalizeSectionLabel(forcedType, value);
      if (!normalizedLabel) continue;

      result.sections[forcedType].labels.push(normalizedLabel);
      result.sections[forcedType].links.push({
        label: normalizedLabel,
        href: toAbsoluteItchUrl(href)
      });

      if (forcedType === 'type' && normalize(normalizedLabel) === 'html5') {
        result.sections.platforms.labels.push('Web');
        result.sections.platforms.links.push({
          label: 'Web',
          href: 'https://itch.io/games/platform-web'
        });
      }
    }

    function detectMetaType(row) {
      const cells = [...row.children].filter(Boolean);
      const labelCandidates = [
        row.querySelector('th'),
        row.querySelector('.label'),
        row.querySelector('.info_label'),
        row.querySelector('.meta_label'),
        cells[0]
      ].filter(Boolean);

      const labelText = normalize(labelCandidates.map(node => node.textContent || '').join(' ').trim());
      if (labelText === 'content' || labelText.startsWith('content ')) return '';
      const labelSection = Object.entries(FILTER_SECTION_LABEL_ALIASES).find(([, aliases]) => {
        return aliases.some(alias => labelText.includes(normalize(alias)));
      });
      if (labelSection) return labelSection[0];

      const fullText = normalize(row.textContent);
      if (fullText === 'content' || fullText.startsWith('content ')) return '';
      const fullTextSection = Object.entries(FILTER_SECTION_LABEL_ALIASES).find(([, aliases]) => {
        return aliases.some(alias => fullText.includes(normalize(alias)));
      });
      if (fullTextSection) return fullTextSection[0];

      return '';
    }

    function extractRowValues(row, type) {
      const clone = row.cloneNode(true);
      const cells = [...clone.children].filter(Boolean);
      const firstCell = cells[0] || null;
      const lastCell = cells.length > 1 ? cells[cells.length - 1] : clone;

      if (firstCell && firstCell !== lastCell) firstCell.remove();

      const container = lastCell || clone;
      const linkValues = [...container.querySelectorAll('a[href]')]
        .map(link => String(link.textContent || '').trim())
        .filter(Boolean);

      if (linkValues.length) return linkValues;

      const rawText = String(container.innerText || container.textContent || '')
        .replace(/^(genres?|platforms?|tags?|price|type|misc|languages?|average session length|multiplayer features?)\s*:?\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!rawText) return [];

      return rawText
        .split(/\s*,\s*/)
        .map(x => x.trim())
        .filter(Boolean)
        .filter(value => normalize(value) !== normalize(type.replace(/s$/, '')));
    }

    for (const row of rows) {
      const sectionKey = detectMetaType(row);
      if (!sectionKey || !result.sections[sectionKey]) continue;
      extractRowValues(row, sectionKey).forEach(value => {
        const normalizedLabel = normalizeSectionLabel(sectionKey, value);
        if (normalizedLabel) result.sections[sectionKey].labels.push(normalizedLabel);
      });
    }

    if (root?.querySelector('.play_game_btn, .launch_btn, iframe[src*="html5"], .iframe_placeholder')) {
      result.sections.type.labels.push('HTML5');
      result.sections.platforms.labels.push('Web');
    }

    if (root?.querySelector('.download_btn, a[href*="/file/"], a[href*="/download"]')) {
      result.sections.type.labels.push('Downloadable');
    }

    const purchaseText = normalize(root?.querySelector('.purchase_banner_widget, .buy_row, .buy_message, .button_message, .game_purchase_price')?.textContent || '');
    if (purchaseText) {
      if (purchaseText.includes('free') || purchaseText.includes('0.00') || purchaseText.includes('name your own price')) {
        result.sections.price.labels.push('Free');
      }
      if (purchaseText.includes('% off') || purchaseText.includes('sale')) {
        result.sections.price.labels.push('On Sale');
      }
      if (/\$\s*\d/.test(purchaseText) || purchaseText.includes('usd')) {
        result.sections.price.labels.push('Paid');
      }
    }

    getFilterSectionConfigs().forEach(section => {
      result.sections[section.key].labels = normalizeLabelList(
        result.sections[section.key].labels.filter(value => !isIgnoredMetaLabel(value))
      );
      result.sections[section.key].links = backfillMissingLinkEntries(
        section.type,
        result.sections[section.key].labels,
        result.sections[section.key].links
      );
    });

    result.genres = result.sections.genres.labels;
    result.platforms = result.sections.platforms.labels;
    const sideMetaLabels = new Set([
      ...result.genres,
      ...result.platforms
    ].map(value => normalize(value)));
    result.tags = normalizeLabelList(result.sections.tags.labels
      .filter(value => !sideMetaLabels.has(normalize(value))));
    result.sections.tags.labels = result.tags;
    result.sections.tags.links = backfillMissingLinkEntries('tag', result.tags, result.sections.tags.links);
    result.genreLinks = result.sections.genres.links;
    result.platformLinks = result.sections.platforms.links;
    result.tagLinks = result.sections.tags.links;

    return result;
  }

  function cachePublicGameMetaIfAvailable() {
    const meta = extractInfoPanelMetaFromPublicGamePage();
    if (!meta) return;

    storeMetaOnCurrentOrigin(meta);
    console.log('[itch.io stats] cached game meta:', meta);

    const params = new URLSearchParams(location.search);
    const returnUrl = params.get('tm_return');
    const refreshMode = params.get('tm_refresh') === '1';
    const refreshState = loadRefreshState();

    if (refreshMode) {
      if (!refreshState || refreshState.phase !== 'fetch-meta') {
        abortRefreshFlow('missing fetch-meta state on public page');
        return;
      }

      if (!isSameGame(refreshState.game, meta)) {
        abortRefreshFlow('public game does not match refresh target');
        return;
      }

      refreshState.game = {
        id: meta.id || refreshState.game?.id || null,
        name: meta.name || refreshState.game?.name || 'Unknown game'
      };
      refreshState.phase = 'search';
      refreshState.index = 0;
      refreshState.queue = buildRefreshQueue(refreshState.game);
      saveRefreshState(refreshState);

      if (refreshState.queue.length) {
        setTransferredMeta(meta);
        setTransferredRefreshState(refreshState);
        location.href = refreshState.queue[0].url;
        return;
      }

      abortRefreshFlow('refresh queue is empty');
      return;
    }

    if (returnUrl) {
      setTransferredMeta(meta);
      location.href = returnUrl;
    }
  }

  function formatStatCell(record) {
    if (!record) return '—';
    return '#' + record.globalPosition + ' Page ' + record.page;
  }

  function formatStatCell(record) {
    if (!record) return '—';
    return '#' + record.globalPosition;
  }

  function findRecordsForLabel(records, label) {
    const wanted = normalize(label);

    return records.filter(record => {
      return getSearchLabelsFromRecord(record).some(value => normalize(value) === wanted);
    });
  }

  function normalizeLabelList(values) {
    return [...new Set(
      values
        .flat()
        .map(x => String(x || '').trim())
        .filter(Boolean)
    )];
  }

  function formatStatCell(record) {
    if (!record) return '—';
    if (record.displayRank) return record.displayRank;
    return '#' + record.globalPosition;
  }

  function normalizeLabelList(values) {
    const result = [];
    const seen = new Set();

    for (const rawValue of values.flat()) {
      const value = String(rawValue || '').trim();
      const key = normalize(value);

      if (!value || !key || seen.has(key)) continue;

      seen.add(key);
      result.push(value);
    }

    return result;
  }

  function formatOverflowRank(loadedGamesCount) {
    const loaded = Number(loadedGamesCount || 0);
    if (loaded >= 1000) return '>1000';
    if (loaded > 0) return '>' + loaded;
    return '-';
  }

  function formatStatCell(record) {
    if (!record) return '-';
    if (record.displayRank) return record.displayRank;
    return '#' + record.globalPosition;
  }

  function getCurrentDeltaMarker(currentRecord, bestRecord) {
    if (!currentRecord || !bestRecord) return '';

    const currentRank = Number(currentRecord.globalPosition || Number.MAX_SAFE_INTEGER);
    const bestRank = Number(bestRecord.globalPosition || Number.MAX_SAFE_INTEGER);

    if (!Number.isFinite(currentRank) || !Number.isFinite(bestRank)) return '';
    if (currentRank > bestRank) return ' 📉';
    if (currentRank < bestRank) return ' 📈';
    return '';
  }

  function renderStatCell(record, options = {}) {
    const text = record ? formatStatCell(record) : '🔎';
    const className = options.current ? 'tm-stat-current' : '';
    const marker = options.current ? getCurrentDeltaMarker(record, options.bestRecord) : '';
    const content = `${escapeHtml(text)}${escapeHtml(marker)}`;

    if (options.href && options.current) {
      const buttonClass = ['tm-stat-link', className].filter(Boolean).join(' ');
      return `<button class="${buttonClass}" data-open-search-url="${escapeHtml(options.href)}">${content}</button>`;
    }

    if (className) {
      return `<span class="${className}">${content}</span>`;
    }

    return content;
  }

  function renderBestStatCell(record) {
    return record ? renderStatCell(record) : '&#8212;';
  }

  function getRecordSeries(record) {
    const category = normalize(getRecordCategory(record));
    const match = SEARCH_SERIES.find(item => normalize(item.label) === category);
    return match?.key || '';
  }

  function hasRecordModifiers(record) {
    return getFilterSectionConfigs().some(section => getRecordSectionLabels(record, section.key).length > 0);
  }

  function isDefaultSummaryRecord(record) {
    if (!record) return false;

    const summaryLabel = normalize(record?.meta?.summaryLabel);
    if (summaryLabel === normalize('Default')) return true;
    if (summaryLabel) return false;

    return !!getRecordSeries(record) && !hasRecordModifiers(record);
  }

  function getQueueItemRecords(records, item) {
    const seriesRecords = records.filter(record => getRecordSeries(record) === item.series);
    const wantedLabel = normalize(item.label);
    const wantedId = normalize(item.id);

    if (item.section === 'default') {
      return seriesRecords.filter(record => {
        const focus = buildSummaryFocusTarget(record);
        return focus?.section === 'default';
      });
    }

    if (item.section === 'intersections') {
      return seriesRecords.filter(record => {
        const focus = buildSummaryFocusTarget(record);
        if (focus?.section !== 'intersections') return false;
        const recordIntersectionId = normalize(record?.meta?.intersectionId);
        if (wantedId && recordIntersectionId === wantedId) return true;
        return normalize(record?.meta?.summaryLabel) === wantedLabel;
      });
    }

    return seriesRecords.filter(record => {
      const focus = buildSummaryFocusTarget(record);
      if (focus?.section === item.section && normalize(focus.label) === wantedLabel) {
        return true;
      }

      // Keep legacy records without summary labels working, but only when they
      // belong to a single summary section. This prevents intersections like
      // "/games/free/platform-web/tag-horror" from leaking into "Price > Free".
      if (normalize(record?.meta?.summaryLabel)) return false;

      const matchingSections = getFilterSectionConfigs().filter(section => {
        return getRecordSectionLabels(record, section.key).length > 0;
      });
      if (matchingSections.length !== 1 || matchingSections[0]?.key !== item.section) return false;

      return getRecordSectionLabels(record, item.section).some(label => normalize(label) === wantedLabel);
    });
  }

  function dedupeRefreshItems(items) {
    const seen = new Set();

    return items
      .filter(item => item.url)
      .filter(item => {
        const key = `${item.section}:${item.series}:${normalize(item.label)}:${item.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function buildFilterLinkEntries(type, labels, links) {
    const byLabel = new Map(
      normalizeLinkEntries(links).map(item => [normalize(item.label), item.href])
    );

    return normalizeLabelList(labels)
      .map(label => ({
        label,
        href: byLabel.get(normalize(label)) || buildSearchUrlForLabel(type, label)
      }))
      .filter(item => item.href);
  }

  function isFiniteRankRecord(record) {
    const rank = Number(record?.globalPosition);
    return Number.isFinite(rank) && rank > 0 && rank < Number.MAX_SAFE_INTEGER;
  }

  function formatChartDayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getLocalDayKey(value = Date.now()) {
    const date = value instanceof Date ? value : new Date(Number(value));
    if (Number.isNaN(date.getTime())) return '';
    return formatChartDayKey(date);
  }

  function getLocalHourKey(value = Date.now()) {
    const date = value instanceof Date ? value : new Date(Number(value));
    if (Number.isNaN(date.getTime())) return '';
    const hour = String(date.getHours()).padStart(2, '0');
    return `${formatChartDayKey(date)} ${hour}`;
  }

  function getRecentChartDays(count = 7, options = {}) {
    const {
      sparseLabels = false,
      sparseStep = 7
    } = options || {};
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      day: '2-digit'
    });
    const fullFormatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit'
    });
    const days = [];
    const today = new Date();

    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
      const shortLabel = formatter.format(date);
      const fullLabel = fullFormatter.format(date);
      const index = count - 1 - offset;
      const shouldShowLabel = !sparseLabels || index % sparseStep === 0;
      days.push({
        key: formatChartDayKey(date),
        label: sparseLabels ? (shouldShowLabel ? fullLabel : '') : shortLabel,
        fullLabel: count <= 7 ? shortLabel : fullLabel
      });
    }

    return days;
  }

  function getRecentChartHours() {
    const hours = [];
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const dayKey = formatChartDayKey(now);

    for (let hour = 0; hour < 24; hour += 1) {
      const date = new Date(year, month, day, hour);
      const hourLabel = `${hour}h`;
      hours.push({
        key: `${dayKey} ${String(hour).padStart(2, '0')}`,
        label: hour % 2 === 0 ? hourLabel : '',
        fullLabel: hourLabel,
        dayKey,
        hour
      });
    }

    return hours;
  }

  function collectBestRankByDay(records, days, dayKeySet) {
    const bestByDay = new Map();

    records.forEach(record => {
      if (!isFiniteRankRecord(record)) return;

      const foundAt = Number(record?.foundAt || 0);
      const date = new Date(foundAt);
      if (Number.isNaN(date.getTime())) return;

      const dayKey = String(record?.localDayKey || '') || formatChartDayKey(date);
      if (!dayKeySet.has(dayKey)) return;

      const rank = Number(record.globalPosition);
      const previous = bestByDay.get(dayKey);
      if (!previous || rank < previous.value || (rank === previous.value && foundAt >= previous.foundAt)) {
        bestByDay.set(dayKey, {
          value: rank,
          foundAt
        });
      }
    });

    return days.map(day => {
      const point = bestByDay.get(day.key);
      return point ? {
        dayKey: day.key,
        dayLabel: day.fullLabel || day.label,
        value: point.value,
        foundAt: point.foundAt
      } : null;
    });
  }

  function collectLatestRankByHour(records, hours, hourKeySet) {
    const latestByHour = new Map();

    records.forEach(record => {
      if (!isFiniteRankRecord(record)) return;

      const foundAt = Number(record?.foundAt || 0);
      const date = new Date(foundAt);
      if (Number.isNaN(date.getTime())) return;

      const hourKey = getLocalHourKey(date);
      if (!hourKeySet.has(hourKey)) return;

      const rank = Number(record.globalPosition);
      const previous = latestByHour.get(hourKey);
      if (!previous || foundAt >= previous.foundAt) {
        latestByHour.set(hourKey, {
          value: rank,
          foundAt
        });
      }
    });

    return hours.map(hour => {
      const point = latestByHour.get(hour.key);
      return point ? {
        dayKey: hour.dayKey,
        dayLabel: hour.fullLabel || hour.label,
        value: point.value,
        foundAt: point.foundAt
      } : null;
    });
  }

  function getSectionLineChartData(records, section, labels) {
    const days = getRecentChartDays(7);
    const dayKeySet = new Set(days.map(day => day.key));
    const palette = ['#4A8CFF', '#FFC53D', '#D86BFF', '#FF7F50', '#8A5CFF', '#31D0AA', '#4DD8FF', '#FF5D8F', '#9BE564', '#FFD166'];

    function buildModeSeries(seriesType) {
      return labels.map((label, index) => ({
        key: `${seriesType}:${normalize(label)}`,
        label,
        color: palette[index % palette.length],
        points: collectBestRankByDay(getQueueItemRecords(records, {
          section,
          label,
          series: seriesType
        }), days, dayKeySet)
      })).filter(item => item.points.some(Boolean));
    }

    return {
      days,
      modes: ANALYTICS_SERIES.reduce((acc, item) => {
        acc[item.key] = buildModeSeries(item.key);
        return acc;
      }, {})
    };
  }

  function getChartCoordinates(points, getX, getY) {
    return points.reduce((acc, point, index) => {
      if (!point) return acc;
      acc.push({
        index,
        value: point.value,
        x: getX(index),
        y: getY(point.value),
        point
      });
      return acc;
    }, []);
  }

  function splitChartCoordinatesByNeighboringPoints(coords) {
    return coords.reduce((groups, coord) => {
      const currentGroup = groups[groups.length - 1];
      const previousCoord = currentGroup?.[currentGroup.length - 1];

      if (!previousCoord || coord.index - previousCoord.index !== 1) {
        groups.push([coord]);
      } else {
        currentGroup.push(coord);
      }

      return groups;
    }, []);
  }

  let chartClipPathSequence = 0;

  function getChartClipPathMarkup(margin, plotWidth, plotHeight, padding = 10) {
    const id = `tm-stat-chart-clip-${chartClipPathSequence += 1}`;
    return {
      id,
      markup: `
        <defs>
          <clipPath id="${id}">
            <rect x="${margin.left - padding}" y="${margin.top - padding}" width="${plotWidth + (padding * 2)}" height="${plotHeight + (padding * 2)}"></rect>
          </clipPath>
        </defs>
      `
    };
  }

  function buildNeighborSegmentsPath(points, getX, getY) {
    const coords = getChartCoordinates(points, getX, getY);
    if (coords.length < 2) return '';

    return splitChartCoordinatesByNeighboringPoints(coords)
      .filter(group => group.length >= 2)
      .map(group => group.reduce((path, coord, index) => {
        return `${path}${index === 0 ? 'M' : ' L'}${coord.x} ${coord.y}`;
      }, ''))
      .join(' ');
  }

  function buildSmoothBezierPath(points, getX, getY) {
    const coords = getChartCoordinates(points, getX, getY);
    if (coords.length < 2) return '';
    if (coords.length === 2) {
      return `M${coords[0].x} ${coords[0].y} L${coords[1].x} ${coords[1].y}`;
    }

    // Monotone cubic Hermite slopes prevent Bezier handles from overshooting the data.
    const intervals = [];
    const slopes = [];
    for (let index = 0; index < coords.length - 1; index += 1) {
      const interval = coords[index + 1].index - coords[index].index;
      intervals.push(interval);
      slopes.push((coords[index + 1].value - coords[index].value) / interval);
    }

    const derivatives = new Array(coords.length).fill(0);

    function clampEndpointDerivative(derivative, slope) {
      if (!slope || Math.sign(derivative) !== Math.sign(slope)) return 0;
      return Math.sign(slope) * Math.min(Math.abs(derivative), 3 * Math.abs(slope));
    }

    derivatives[0] = clampEndpointDerivative(
      ((2 * intervals[0] + intervals[1]) * slopes[0] - intervals[0] * slopes[1]) /
        (intervals[0] + intervals[1]),
      slopes[0]
    );

    const last = coords.length - 1;
    derivatives[last] = clampEndpointDerivative(
      ((2 * intervals[last - 1] + intervals[last - 2]) * slopes[last - 1] - intervals[last - 1] * slopes[last - 2]) /
        (intervals[last - 1] + intervals[last - 2]),
      slopes[last - 1]
    );

    for (let index = 1; index < last; index += 1) {
      const previousSlope = slopes[index - 1];
      const nextSlope = slopes[index];
      if (!previousSlope || !nextSlope || previousSlope * nextSlope <= 0) {
        derivatives[index] = 0;
        continue;
      }

      const previousInterval = intervals[index - 1];
      const nextInterval = intervals[index];
      const firstWeight = 2 * nextInterval + previousInterval;
      const secondWeight = nextInterval + 2 * previousInterval;
      derivatives[index] = (firstWeight + secondWeight) /
        (firstWeight / previousSlope + secondWeight / nextSlope);
    }

    let path = `M${coords[0].x} ${coords[0].y}`;

    for (let index = 0; index < last; index += 1) {
      const start = coords[index];
      const end = coords[index + 1];
      const interval = intervals[index];
      const xDistance = end.x - start.x;
      const firstControlValue = start.value + derivatives[index] * interval / 3;
      const secondControlValue = end.value - derivatives[index + 1] * interval / 3;
      path += ` C${start.x + xDistance / 3} ${getY(firstControlValue)}, ${end.x - xDistance / 3} ${getY(secondControlValue)}, ${end.x} ${end.y}`;
    }

    return path;
  }

  function buildLinearTrendPath(points, getX, getY, indexRange = {}) {
    const coords = getChartCoordinates(points, getX, getY);
    if (coords.length < 2) return '';

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    coords.forEach(coord => {
      sumX += coord.index;
      sumY += coord.value;
      sumXY += coord.index * coord.value;
      sumXX += coord.index * coord.index;
    });

    const count = coords.length;
    const denominator = count * sumXX - sumX * sumX;
    const slope = denominator ? ((count * sumXY) - (sumX * sumY)) / denominator : 0;
    const intercept = count ? (sumY - slope * sumX) / count : 0;
    const startIndex = Number.isFinite(indexRange.start) ? indexRange.start : coords[0].index;
    const endIndex = Number.isFinite(indexRange.end) ? indexRange.end : coords[coords.length - 1].index;
    const startValue = intercept + slope * startIndex;
    const endValue = intercept + slope * endIndex;

    return `M${getX(startIndex)} ${getY(startValue)} L${getX(endIndex)} ${getY(endValue)}`;
  }

  function buildMovingAverageTrendPoints(points, windowSize) {
    const validPoints = points.reduce((acc, point, index) => {
      if (!point) return acc;
      acc.push({ index, value: point.value });
      return acc;
    }, []);

    if (validPoints.length < 2) return [];

    return validPoints.map((item, index) => {
      const slice = validPoints.slice(Math.max(0, index - windowSize + 1), index + 1);
      const average = slice.reduce((sum, point) => sum + point.value, 0) / slice.length;
      return {
        index: item.index,
        value: average
      };
    });
  }

  function buildTrendPaths(points, getX, getY, durationDays, trends, indexRange = {}) {
    const trendState = normalizeSummaryChartTrends(trends);
    const movingAverageWindow = durationDays === 1 ? 3 : 5;
    const result = [];

    if (trendState.linear) {
      const linearPath = buildLinearTrendPath(points, getX, getY, indexRange);
      if (linearPath) {
        result.push({
          kind: 'linear',
          path: linearPath
        });
      }
    }

    if (trendState.ma) {
      const movingAveragePoints = buildMovingAverageTrendPoints(points, movingAverageWindow);
      if (movingAveragePoints.length >= 2) {
        const trendPoints = new Array(points.length).fill(null);
        movingAveragePoints.forEach(point => {
          trendPoints[point.index] = { value: point.value };
        });
        result.push({
          kind: 'ma',
          path: buildSmoothBezierPath(trendPoints, getX, getY)
        });
      }
    }

    return result;
  }

  function buildSeriesChartMarkup(series, options) {
    const {
      getX,
      getY,
      durationDays = 7,
      showTrends = false,
      trendState = null,
      xIndexRange = {},
      palette = []
    } = options || {};

    const markup = series.map((item, index) => {
      const color = item.color || palette[index % palette.length] || '#4A8CFF';
      const seriesKey = String(item.key || `${index}`);
      const backgroundPath = buildNeighborSegmentsPath(item.points, getX, getY);
      const smoothPath = buildSmoothBezierPath(item.points, getX, getY);
      const trendPaths = showTrends ? buildTrendPaths(item.points, getX, getY, durationDays, trendState, xIndexRange) : [];
      const unclippedTrendMarkup = trendPaths
        .filter(trend => trend.kind === 'linear')
        .map(trend => `<path class="tm-stat-chart-trend" data-chart-series-key="${escapeHtml(seriesKey)}" d="${trend.path}" stroke="${color}"></path>`)
        .join('');
      const clippedTrendMarkup = trendPaths
        .filter(trend => trend.kind !== 'linear')
        .map(trend => `<path class="tm-stat-chart-trend ${trend.kind === 'ma' ? 'tm-stat-chart-trend-ma' : ''}" data-chart-series-key="${escapeHtml(seriesKey)}" d="${trend.path}" stroke="${color}"></path>`)
        .join('');
      const circles = item.points.map((point, pointIndex) => {
        if (!point) return '';
        const title = `${item.label} • ${point.dayLabel} • #${point.value} • ${getSeriesLabel(point.series || 'popular')}`;
        return `
          <circle class="tm-stat-chart-point" data-chart-point-index="${pointIndex}" data-chart-series-key="${escapeHtml(seriesKey)}" cx="${getX(pointIndex)}" cy="${getY(point.value)}" r="3.5" fill="${color}">
            <title>${escapeHtml(title)}</title>
          </circle>
        `;
      }).join('');

      return {
        clipped: `
          ${backgroundPath ? `<path class="tm-stat-chart-line-bg" data-chart-series-key="${escapeHtml(seriesKey)}" d="${backgroundPath}" stroke="${color}"></path>` : ''}
          ${clippedTrendMarkup}
          ${smoothPath ? `<path class="tm-stat-chart-line" data-chart-series-key="${escapeHtml(seriesKey)}" d="${smoothPath}" stroke="${color}"></path>` : ''}
          ${circles}
        `,
        unclipped: unclippedTrendMarkup
      };
    });

    return {
      clipped: markup.map(item => item.clipped).join(''),
      unclipped: markup.map(item => item.unclipped).join('')
    };
  }

  function renderSectionChart(chartData, options = {}) {
    const days = Array.isArray(chartData?.days) ? chartData.days : [];
    const series = Array.isArray(chartData?.series) ? chartData.series : [];
    const palette = Array.isArray(options.palette) && options.palette.length
      ? options.palette
      : ['#4A8CFF', '#FFC53D', '#D86BFF', '#FF7F50', '#8A5CFF', '#31D0AA', '#4DD8FF', '#FF5D8F', '#9BE564', '#FFD166'];
    const showLegend = options.showLegend !== false;

    if (!days.length || !series.length) {
      return `<div class="tm-stat-muted tm-stat-chart">No data for the last 7 days.</div>`;
    }

    const width = 580;
    const height = 180;
    const margin = { top: 8, right: 12, bottom: 28, left: 44 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const visualPadding = 10;
    const innerPlotHeight = Math.max(1, plotHeight - (visualPadding * 2));
    const values = series.flatMap(item => item.points.filter(Boolean).map(point => point.value));
    if (!values.length) {
      return `<div class="tm-stat-muted tm-stat-chart">No exact rank data for the last 7 days.</div>`;
    }

    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    if (minValue === maxValue) {
      minValue = Math.max(1, minValue - 1);
      maxValue += 1;
    }

    const getX = index => margin.left + (days.length === 1 ? plotWidth / 2 : (plotWidth / (days.length - 1)) * index);
    const getY = value => {
      const ratio = (value - minValue) / (maxValue - minValue);
      return margin.top + visualPadding + ratio * innerPlotHeight;
    };

    const tickValues = [0, 1, 2, 3].map(step => {
      const ratio = step / 3;
      return Math.round(minValue + (maxValue - minValue) * ratio);
    });

    const gridLines = tickValues.map(value => {
      const y = getY(value);
      return `
        <line class="tm-stat-chart-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
        <text class="tm-stat-chart-tick" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">#${value}</text>
      `;
    }).join('');

    const dayLabels = days.map((day, index) => `
      <text class="tm-stat-chart-day" x="${getX(index)}" y="${height - 8}" text-anchor="middle">${escapeHtml(day.label)}</text>
    `).join('');

    const chartMarkup = buildSeriesChartMarkup(series, {
      getX,
      getY,
      durationDays: Math.max(1, days.length),
      xIndexRange: {
        start: 0,
        end: days.length - 1
      },
      palette
    });
    const clipPath = getChartClipPathMarkup(margin, plotWidth, plotHeight, visualPadding);

    const legendMarkup = series.map((item, index) => {
      const color = palette[index % palette.length];
      return `
        <div class="tm-stat-chart-legend-item" title="${escapeHtml(item.label)}">
          <span class="tm-stat-chart-legend-swatch" style="background:${color}"></span>
          <span class="tm-stat-chart-legend-label">${escapeHtml(item.label)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="tm-stat-chart">
        <svg class="tm-stat-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Last 7 days current ranks chart">
          ${clipPath.markup}
          ${gridLines}
          <line class="tm-stat-chart-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
          ${chartMarkup.unclipped}
          <g clip-path="url(#${clipPath.id})">${chartMarkup.clipped}</g>
          ${dayLabels}
        </svg>
        ${showLegend ? `
          <div class="tm-stat-chart-legend">
            ${legendMarkup}
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderSectionFieldCharts(chartData) {
    const days = Array.isArray(chartData?.days) ? chartData.days : [];
    const fields = Array.isArray(chartData?.fields) ? chartData.fields : [];

    if (!days.length || !fields.length) {
      return `<div class="tm-stat-muted tm-stat-chart">No data for the last 7 days.</div>`;
    }

    const cards = fields.map(field => {
      const hasPoints = Array.isArray(field.points) && field.points.some(Boolean);
      const cardChart = hasPoints
        ? renderSectionChart({
            days,
            series: [{
              label: field.label,
              points: field.points
            }]
          }, {
            palette: [field.color || '#4A8CFF'],
            showLegend: false
          })
        : `<div class="tm-stat-muted tm-stat-chart">No exact rank data for the last 7 days.</div>`;

      return `
        <div class="tm-stat-chart-card">
          <div class="tm-stat-chart-card-title">${escapeHtml(field.label)}</div>
          ${cardChart}
        </div>
      `;
    }).join('');

    return `<div class="tm-stat-chart-grid-4">${cards}</div>`;
  }

  function getSectionToggleChartData(records, section, labels) {
    const palette = ['#4A8CFF', '#FFC53D', '#D86BFF', '#FF7F50', '#8A5CFF', '#31D0AA', '#4DD8FF', '#FF5D8F', '#9BE564', '#FFD166'];

    function buildMode(mode, days, dayKeySet) {
      return labels.map((label, index) => ({
        key: `${mode}:${normalize(label)}`,
        label,
        color: palette[index % palette.length],
        points: collectBestRankByDay(getQueueItemRecords(records, {
          section,
          label,
          series: mode
        }), days, dayKeySet)
      })).filter(item => item.points.some(Boolean));
    }

    function buildDuration(durationDays) {
      const days = durationDays === 1
        ? getRecentChartHours()
        : getRecentChartDays(durationDays, {
          sparseLabels: durationDays >= 30,
          sparseStep: 7
        });
      const dayKeySet = new Set(days.map(day => day.key));
      return {
        days,
        modes: ANALYTICS_SERIES.reduce((acc, item) => {
          acc[item.key] = labels.map((label, index) => ({
            key: `${item.key}:${normalize(label)}`,
            label,
            color: palette[index % palette.length],
            points: durationDays === 1
              ? collectLatestRankByHour(getQueueItemRecords(records, {
                section,
                label,
                series: item.key
              }), days, dayKeySet)
              : collectBestRankByDay(getQueueItemRecords(records, {
                section,
                label,
                series: item.key
              }), days, dayKeySet)
          })).filter(seriesItem => seriesItem.points.some(Boolean));
          return acc;
        }, {})
      };
    }

    return {
      durations: {
        1: buildDuration(1),
        7: buildDuration(7),
        30: buildDuration(30),
        90: buildDuration(90)
      }
    };
  }

  function renderSectionChartSkeleton(chartKey, seriesKeys = ANALYTICS_SERIES.map(item => item.key), collapsed = false) {
    return `
      <div class="tm-stat-chart ${collapsed ? 'tm-collapsed' : ''}" data-chart-root="${escapeHtml(chartKey)}">
        <div class="tm-stat-chart-head">
          <div class="tm-stat-chart-head-top">
            <div class="tm-stat-chart-head-left">
              <button
                class="tm-stat-chart-collapse"
                type="button"
                data-chart-collapse
                title="${collapsed ? 'Развернуть график' : 'Свернуть график'}"
                aria-label="${collapsed ? 'Развернуть график' : 'Свернуть график'}"
                aria-expanded="${collapsed ? 'false' : 'true'}"
              >${collapsed ? '+' : '-'}</button>
              <span class="tm-stat-chart-header-label">Graph</span>
            </div>
            <div class="tm-stat-chart-head-right">
              <button class="tm-stat-chart-copy-button" type="button" data-chart-copy title="Copy chart image" aria-label="Copy chart image">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path fill="currentColor" d="M5 1.5A1.5 1.5 0 0 0 3.5 3v7A1.5 1.5 0 0 0 5 11.5h1V10H5V3h6v1h1.5V3A1.5 1.5 0 0 0 11 1.5H5Zm3 4A1.5 1.5 0 0 0 6.5 7v5A1.5 1.5 0 0 0 8 13.5h4A1.5 1.5 0 0 0 13.5 12V7A1.5 1.5 0 0 0 12 5.5H8Zm0 1h4a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5H8a.5.5 0 0 1-.5-.5V7a.5.5 0 0 1 .5-.5Z"></path>
                </svg>
              </button>
              <div class="tm-stat-chart-toggle">
                ${[1, 7, 30, 90].map((duration, index) => `
                  <button class="tm-stat-chart-toggle-button ${index === 0 ? 'tm-active' : ''}" type="button" data-chart-duration="${duration}">${duration}d</button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="tm-stat-chart-content">
          <h1 class="tm-stat-chart-title"></h1>
          <div class="tm-stat-chart-body"></div>
        </div>
        <div class="tm-stat-chart-tooltip"></div>
      </div>
    `;
  }

  function canCopyChartImage() {
    return !!(
      navigator?.clipboard?.write &&
      typeof ClipboardItem !== 'undefined' &&
      typeof XMLSerializer !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined'
    );
  }

  function setChartCopyButtonState(button, state = 'idle') {
    if (!button) return;

    button.classList.remove('tm-success', 'tm-error');

    if (state === 'success') {
      button.classList.add('tm-success');
      button.title = 'Chart image copied';
      button.setAttribute('aria-label', 'Chart image copied');
      return;
    }

    if (state === 'error') {
      button.classList.add('tm-error');
      button.title = 'Failed to copy chart image';
      button.setAttribute('aria-label', 'Failed to copy chart image');
      return;
    }

    button.title = 'Copy chart image';
    button.setAttribute('aria-label', 'Copy chart image');
  }

  function wrapChartExportText(text, maxCharsPerLine = 42) {
    const source = String(text || '').trim();
    if (!source) return [];

    const words = source.split(/\s+/).filter(Boolean);
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      if (!currentLine) {
        currentLine = word;
        return;
      }

      const nextLine = `${currentLine} ${word}`;
      if (nextLine.length <= maxCharsPerLine) {
        currentLine = nextLine;
        return;
      }

      lines.push(currentLine);
      currentLine = word;
    });

    if (currentLine) lines.push(currentLine);
    return lines;
  }

  function getChartSvgCopyMarkup(root) {
    const svg = root?.querySelector?.('.tm-stat-chart-svg');
    if (!svg) return '';

    const clone = svg.cloneNode(true);
    clone.querySelectorAll('.tm-stat-chart-hover-zone').forEach(node => node.remove());
    clone.querySelectorAll('.tm-stat-chart-hover-line').forEach(node => node.remove());

    const viewBox = String(clone.getAttribute('viewBox') || '').trim();
    const [, , rawWidth = 580, rawHeight = 180] = viewBox.split(/\s+/).map(Number);
    const exportWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 580;
    const exportHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 180;

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(exportWidth));
    clone.setAttribute('height', String(exportHeight));

    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', '0');
    background.setAttribute('y', '0');
    background.setAttribute('width', String(exportWidth));
    background.setAttribute('height', String(exportHeight));
    background.setAttribute('rx', '10');
    background.setAttribute('fill', '#161616');
    clone.insertBefore(background, clone.firstChild);

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      .tm-stat-chart-grid { stroke: rgba(255,255,255,.08); stroke-width: 1; }
      .tm-stat-chart-axis { stroke: rgba(255,255,255,.18); stroke-width: 1; }
      .tm-stat-chart-tick { fill: rgba(255,255,255,.52); font-size: 10px; font-weight: 700; }
      .tm-stat-chart-day { fill: rgba(255,255,255,.62); font-size: 10px; font-weight: 700; }
      .tm-stat-chart-line { fill: none; stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; }
      .tm-stat-chart-line-bg { fill: none; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; opacity: .16; }
      .tm-stat-chart-trend { fill: none; stroke-width: 1.5; stroke-dasharray: 6 4; opacity: .95; }
      .tm-stat-chart-trend-ma { stroke-dasharray: 2 5; opacity: .78; }
      .tm-stat-chart-point { stroke: rgba(17,17,17,.92); stroke-width: 1.5; }
      text { font-family: Arial, sans-serif; }
    `;
    clone.insertBefore(style, background.nextSibling);

    const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    exportSvg.setAttribute('width', String(exportWidth));

    const titleText = String(root.querySelector('.tm-stat-chart-title')?.textContent || '').trim();
    const titleLines = wrapChartExportText(titleText, Math.max(18, Math.floor((exportWidth - 40) / 11)));
    const titleHeight = titleLines.length ? (titleLines.length * 24) + 8 : 0;

    const legendItems = Array.from(root.querySelectorAll('.tm-stat-chart-legend-item'))
      .filter(item => !item.classList.contains('tm-series-hidden'))
      .map(item => ({
        label: String(item.querySelector('.tm-stat-chart-legend-label')?.textContent || '').trim(),
        color: String(item.querySelector('.tm-stat-chart-legend-swatch')?.style?.background || '#4A8CFF').trim() || '#4A8CFF'
      }))
      .filter(item => item.label);

    const legendPaddingX = 20;
    const legendItemGap = 6;
    const legendRowGap = 6;
    const legendRowHeight = 22;
    let legendCursorX = legendPaddingX;
    let legendCursorY = 0;
    const legendLayout = legendItems.map(item => {
      const estimatedWidth = Math.min(120, Math.max(46, Math.round((item.label.length * 6.4) + 28)));
      if (legendCursorX > legendPaddingX && legendCursorX + estimatedWidth > exportWidth - legendPaddingX) {
        legendCursorX = legendPaddingX;
        legendCursorY += legendRowHeight + legendRowGap;
      }

      const layout = {
        ...item,
        width: estimatedWidth,
        x: legendCursorX,
        y: legendCursorY
      };
      legendCursorX += estimatedWidth + legendItemGap;
      return layout;
    });
    const legendHeight = legendLayout.length ? legendCursorY + legendRowHeight : 0;

    const chartOffsetY = 16 + titleHeight;
    const legendOffsetY = chartOffsetY + exportHeight + (legendHeight ? 12 : 0);
    const totalHeight = legendOffsetY + legendHeight + 16;

    exportSvg.setAttribute('height', String(totalHeight));
    exportSvg.setAttribute('viewBox', `0 0 ${exportWidth} ${totalHeight}`);

    const exportBackground = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    exportBackground.setAttribute('x', '0');
    exportBackground.setAttribute('y', '0');
    exportBackground.setAttribute('width', String(exportWidth));
    exportBackground.setAttribute('height', String(totalHeight));
    exportBackground.setAttribute('rx', '12');
    exportBackground.setAttribute('fill', '#161616');
    exportSvg.appendChild(exportBackground);

    if (titleLines.length) {
      titleLines.forEach((line, index) => {
        const titleNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleNode.setAttribute('x', '20');
        titleNode.setAttribute('y', String(36 + (index * 24)));
        titleNode.setAttribute('fill', 'rgba(255,255,255,.76)');
        titleNode.setAttribute('font-size', '20');
        titleNode.setAttribute('font-weight', '800');
        titleNode.setAttribute('font-family', 'Arial, sans-serif');
        titleNode.textContent = line;
        exportSvg.appendChild(titleNode);
      });
    }

    const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chartGroup.setAttribute('transform', `translate(0 ${chartOffsetY})`);
    chartGroup.appendChild(clone);
    exportSvg.appendChild(chartGroup);

    legendLayout.forEach(item => {
      const pill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      pill.setAttribute('x', String(item.x));
      pill.setAttribute('y', String(legendOffsetY + item.y));
      pill.setAttribute('width', String(item.width));
      pill.setAttribute('height', String(legendRowHeight));
      pill.setAttribute('rx', '11');
      pill.setAttribute('fill', 'rgba(255,255,255,.05)');
      exportSvg.appendChild(pill);

      const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      swatch.setAttribute('cx', String(item.x + 12));
      swatch.setAttribute('cy', String(legendOffsetY + item.y + 11));
      swatch.setAttribute('r', '4');
      swatch.setAttribute('fill', item.color);
      exportSvg.appendChild(swatch);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(item.x + 22));
      label.setAttribute('y', String(legendOffsetY + item.y + 15));
      label.setAttribute('fill', 'rgba(255,255,255,.86)');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '700');
      label.setAttribute('font-family', 'Arial, sans-serif');
      label.textContent = item.label;
      exportSvg.appendChild(label);
    });

    return new XMLSerializer().serializeToString(exportSvg);
  }

  async function copyChartSvgToClipboard(root) {
    const markup = getChartSvgCopyMarkup(root);
    if (!markup) throw new Error('Chart SVG is missing');

    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Unable to render chart image'));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || 580;
      canvas.height = image.naturalHeight || 180;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context is unavailable');
      context.drawImage(image, 0, 0);

      const pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => {
          if (result) resolve(result);
          else reject(new Error('Unable to export PNG'));
        }, 'image/png');
      });

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob
        })
      ]);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function renderSectionToggleChartInto(root, chartData, mode = 'popular', durationDays = 1) {
    if (!root) return;

    const chartKey = root.getAttribute('data-chart-root') || '';
    const body = root.querySelector('.tm-stat-chart-body');
    const title = root.querySelector('.tm-stat-chart-title');
    const tooltip = root.querySelector('.tm-stat-chart-tooltip');
    const copyButton = root.querySelector('[data-chart-copy]');
    const durationLabel = `${durationDays}d`;
    const modeLabel = isKnownSeriesKey(mode) ? getSeriesLabel(mode) : 'Section not selected';
    const chartPref = getSummaryChartPref(chartKey, Object.keys(chartData?.durations?.[durationDays]?.modes || chartData?.durations?.[1]?.modes || {}));
    const trendState = normalizeSummaryChartTrends(chartPref.trends);
    const hiddenSeriesSet = new Set(normalizeSummaryChartHiddenSeries(chartPref.hiddenSeries));
    const durationData = chartData?.durations?.[durationDays] || chartData?.durations?.[1] || null;
    const days = Array.isArray(durationData?.days) ? durationData.days : [];
    const allSeries = Array.isArray(durationData?.modes?.[mode]) ? durationData.modes[mode] : [];
    const series = allSeries.filter(item => !hiddenSeriesSet.has(String(item?.key || '')));

    if (!body) return;
    if (title) title.textContent = `${modeLabel} / ${durationLabel}`;
    if (copyButton) {
      copyButton.disabled = !canCopyChartImage();
      setChartCopyButtonState(copyButton);
    }

    try {
      if (!days.length || !allSeries.length) {
        body.innerHTML = `<div class="tm-stat-muted">No data for the last ${durationLabel}.</div>`;
        if (tooltip) {
          tooltip.classList.remove('tm-visible');
          tooltip.innerHTML = '';
        }
        return;
      }

      if (!series.length) {
        const legendMarkup = allSeries.map(item => `
          <div class="tm-stat-chart-legend-item tm-series-hidden" tabindex="0" data-chart-series-key="${escapeHtml(item.key)}" title="${escapeHtml(item.label)}">
            <span class="tm-stat-chart-legend-swatch" style="background:${item.color}"></span>
            <span class="tm-stat-chart-legend-eyeoff" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="12" height="12">
                <path fill="currentColor" d="M1.5 2.56 2.56 1.5l11.94 11.94-1.06 1.06-2.15-2.15A9.54 9.54 0 0 1 8 13C4.18 13 1.43 10.5.27 8.78a1.43 1.43 0 0 1 0-1.56A13.3 13.3 0 0 1 3.6 3.8L1.5 2.56Zm7.44 7.44-2.38-2.38a2 2 0 0 0 2.38 2.38Zm3.93-.19L10.9 7.84a2.99 2.99 0 0 0-3.74-3.74L5.63 2.57A8.95 8.95 0 0 1 8 3c3.82 0 6.57 2.5 7.73 4.22.36.53.36 1.03 0 1.56a13.62 13.62 0 0 1-2.86 3.03Z"></path>
              </svg>
            </span>
            <span class="tm-stat-chart-legend-label">${escapeHtml(item.label)}</span>
          </div>
        `).join('');
        const trendControlsMarkup = `
          <label class="tm-stat-chart-trend-control">
            <input type="checkbox" data-chart-trend="linear" ${trendState.linear ? 'checked' : ''}>
            <span>Линейный тренд</span>
          </label>
          <label class="tm-stat-chart-trend-control">
            <input type="checkbox" data-chart-trend="ma" ${trendState.ma ? 'checked' : ''}>
            <span>Скользящее среднее (${durationDays === 1 ? '3 точки' : '5 точек'})</span>
          </label>
        `;
        body.innerHTML = `
          <div class="tm-stat-muted">All series are hidden.</div>
          <div class="tm-stat-chart-legend">${legendMarkup}${trendControlsMarkup}</div>
        `;
        return;
      }

      const width = 580;
      const height = 180;
      const margin = { top: 8, right: 12, bottom: 28, left: 44 };
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const visualPadding = 10;
      const innerPlotHeight = Math.max(1, plotHeight - (visualPadding * 2));
      const values = series.flatMap(item => item.points.filter(Boolean).map(point => point.value));

      if (!values.length) {
        body.innerHTML = `<div class="tm-stat-muted">No exact rank data for the last ${durationLabel}.</div>`;
        return;
      }

    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    if (minValue === maxValue) {
      minValue = Math.max(1, minValue - 1);
      maxValue += 1;
    }

    const getX = index => margin.left + (days.length === 1 ? plotWidth / 2 : (plotWidth / (days.length - 1)) * index);
    const getY = value => margin.top + visualPadding + ((value - minValue) / (maxValue - minValue)) * innerPlotHeight;
    const tickValues = [0, 1, 2, 3].map(step => Math.round(minValue + (maxValue - minValue) * (step / 3)));

    const gridLines = tickValues.map(value => {
      const y = getY(value);
      return `
        <line class="tm-stat-chart-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
        <text class="tm-stat-chart-tick" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">#${value}</text>
      `;
    }).join('');

    const dayLabels = days.map((day, index) => `
      <text class="tm-stat-chart-day" x="${getX(index)}" y="${height - 8}" text-anchor="middle">${escapeHtml(day.label)}</text>
    `).join('');

    const chartMarkup = buildSeriesChartMarkup(series, {
      getX,
      getY,
      durationDays,
      showTrends: true,
      trendState,
      xIndexRange: {
        start: 0,
        end: days.length - 1
      }
    });
    const clipPath = getChartClipPathMarkup(margin, plotWidth, plotHeight, visualPadding);

    const hoverZones = days.map((day, index) => {
      const prevX = index === 0 ? margin.left : (getX(index - 1) + getX(index)) / 2;
      const nextX = index === days.length - 1 ? width - margin.right : (getX(index) + getX(index + 1)) / 2;
      return `<rect class="tm-stat-chart-hover-zone" data-chart-day-index="${index}" x="${prevX}" y="${margin.top}" width="${Math.max(1, nextX - prevX)}" height="${plotHeight}"></rect>`;
    }).join('');

    const legendMarkup = allSeries.map(item => `
      <div class="tm-stat-chart-legend-item ${hiddenSeriesSet.has(String(item.key || '')) ? 'tm-series-hidden' : ''}" tabindex="0" data-chart-series-key="${escapeHtml(item.key)}" title="${escapeHtml(item.label)}">
        <span class="tm-stat-chart-legend-swatch" style="background:${item.color}"></span>
        <span class="tm-stat-chart-legend-eyeoff" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path fill="currentColor" d="M1.5 2.56 2.56 1.5l11.94 11.94-1.06 1.06-2.15-2.15A9.54 9.54 0 0 1 8 13C4.18 13 1.43 10.5.27 8.78a1.43 1.43 0 0 1 0-1.56A13.3 13.3 0 0 1 3.6 3.8L1.5 2.56Zm7.44 7.44-2.38-2.38a2 2 0 0 0 2.38 2.38Zm3.93-.19L10.9 7.84a2.99 2.99 0 0 0-3.74-3.74L5.63 2.57A8.95 8.95 0 0 1 8 3c3.82 0 6.57 2.5 7.73 4.22.36.53.36 1.03 0 1.56a13.62 13.62 0 0 1-2.86 3.03Z"></path>
          </svg>
        </span>
        <span class="tm-stat-chart-legend-label">${escapeHtml(item.label)}</span>
      </div>
    `).join('');
    const trendControlsMarkup = `
      <label class="tm-stat-chart-trend-control">
        <input type="checkbox" data-chart-trend="linear" ${trendState.linear ? 'checked' : ''}>
        <span>Линейный тренд</span>
      </label>
      <label class="tm-stat-chart-trend-control">
        <input type="checkbox" data-chart-trend="ma" ${trendState.ma ? 'checked' : ''}>
        <span>Скользящее среднее (${durationDays === 1 ? '3 точки' : '5 точек'})</span>
      </label>
    `;

    body.innerHTML = `
      <svg class="tm-stat-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${modeLabel} ${durationLabel} current ranks chart`)}">
        ${clipPath.markup}
        ${gridLines}
        <line class="tm-stat-chart-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
        ${chartMarkup.unclipped}
        <g clip-path="url(#${clipPath.id})">${chartMarkup.clipped}</g>
        <line class="tm-stat-chart-hover-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" visibility="hidden"></line>
        ${hoverZones}
        ${dayLabels}
      </svg>
      <div class="tm-stat-chart-legend">${legendMarkup}${trendControlsMarkup}</div>
    `;

      const svg = body.querySelector('.tm-stat-chart-svg');
      const hoverLine = body.querySelector('.tm-stat-chart-hover-line');
      let activeLegendSeriesKey = '';
      let activeGraphSeriesKey = '';
      let copyFeedbackTimer = null;
      const hoverRanges = days.map((day, index) => ({
        index,
        startX: index === 0 ? margin.left : (getX(index - 1) + getX(index)) / 2,
        endX: index === days.length - 1 ? width - margin.right : (getX(index) + getX(index + 1)) / 2
      }));

    function highlightChartPoints(activeIndex = null) {
      body.querySelectorAll('[data-chart-point-index]').forEach(point => {
        const pointIndex = Number(point.getAttribute('data-chart-point-index'));
        point.classList.toggle('tm-day-dimmed', activeIndex !== null && pointIndex !== activeIndex);
      });
    }

    function syncSeriesHighlight() {
      const activeSeriesKey = activeGraphSeriesKey || activeLegendSeriesKey;
      body.querySelectorAll('[data-chart-series-key]').forEach(node => {
        const nodeSeriesKey = String(node.getAttribute('data-chart-series-key') || '');
        const hidden = hiddenSeriesSet.has(nodeSeriesKey);
        node.classList.toggle('tm-series-dimmed', !!activeSeriesKey && nodeSeriesKey !== activeSeriesKey);
        node.classList.toggle('tm-series-active', !!activeSeriesKey && nodeSeriesKey === activeSeriesKey);
        node.classList.toggle('tm-series-hidden', hidden);
      });
      if (tooltip) {
        tooltip.querySelectorAll('[data-chart-series-key]').forEach(node => {
          const nodeSeriesKey = String(node.getAttribute('data-chart-series-key') || '');
          const hidden = hiddenSeriesSet.has(nodeSeriesKey);
          node.classList.toggle('tm-series-dimmed', !!activeSeriesKey && nodeSeriesKey !== activeSeriesKey);
          node.classList.toggle('tm-series-active', !!activeSeriesKey && nodeSeriesKey === activeSeriesKey);
          node.classList.toggle('tm-series-hidden', hidden);
        });
      }
    }

    function applyLegendSeriesHighlight(seriesKey = '') {
      activeLegendSeriesKey = String(seriesKey || '');
      syncSeriesHighlight();
    }

    function applyGraphSeriesHighlight(seriesKey = '') {
      activeGraphSeriesKey = String(seriesKey || '');
      syncSeriesHighlight();
    }

    function showTooltipAtIndex(index) {
      if (!Number.isInteger(index) || index < 0 || index >= days.length) return;

      const x = getX(index);
      const day = days[index];
      highlightChartPoints(index);
      const rows = series.map(item => ({
        key: item.key,
        label: item.label,
        color: item.color,
        point: item.points[index]
      })).sort((a, b) => {
        const aValue = Number(a.point?.value);
        const bValue = Number(b.point?.value);
        const aHasValue = Number.isFinite(aValue);
        const bHasValue = Number.isFinite(bValue);

        if (aHasValue && bHasValue) return aValue - bValue;
        if (aHasValue) return -1;
        if (bHasValue) return 1;
        return a.label.localeCompare(b.label);
      });

      if (hoverLine) {
        hoverLine.setAttribute('x1', String(x));
        hoverLine.setAttribute('x2', String(x));
        hoverLine.setAttribute('visibility', 'visible');
      }

      if (!tooltip || !svg) return;

      tooltip.innerHTML = `
        <div class="tm-stat-chart-tooltip-day">${escapeHtml(day.fullLabel || day.label)}</div>
        ${rows.map(row => `
          <div class="tm-stat-chart-tooltip-row" data-chart-series-key="${escapeHtml(row.key)}">
            <span class="tm-stat-chart-tooltip-dot" style="background:${row.color}"></span>
            <span class="tm-stat-chart-tooltip-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
            <span class="tm-stat-chart-tooltip-value">${row.point ? `#${row.point.value}` : '--'}</span>
          </div>
        `).join('')}
      `;

      const rect = root.getBoundingClientRect();
      const plotX = (x / width) * rect.width;
      tooltip.style.left = `${Math.min(Math.max(plotX + 12, 8), Math.max(8, rect.width - 228))}px`;
      tooltip.style.top = '44px';
      tooltip.classList.add('tm-visible');
      syncSeriesHighlight();
    }

    function hideTooltip() {
      if (tooltip) {
        tooltip.classList.remove('tm-visible');
        tooltip.innerHTML = '';
      }
      if (hoverLine) hoverLine.setAttribute('visibility', 'hidden');
      highlightChartPoints();
      syncSeriesHighlight();
    }

    svg?.addEventListener('mousemove', event => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const svgX = ((event.clientX - rect.left) / rect.width) * width;
      const svgY = ((event.clientY - rect.top) / rect.height) * height;
      const inPlot = svgX >= margin.left && svgX <= (width - margin.right) && svgY >= margin.top && svgY <= (height - margin.bottom);
      if (!inPlot) {
        hideTooltip();
        return;
      }

      const hoveredRange = hoverRanges.find(range => svgX >= range.startX && svgX <= range.endX);
      if (!hoveredRange) {
        hideTooltip();
        return;
      }

      showTooltipAtIndex(hoveredRange.index);
    });

    svg?.addEventListener('mouseleave', () => {
      applyGraphSeriesHighlight('');
      hideTooltip();
    });

    svg?.querySelectorAll('[data-chart-series-key]').forEach(node => {
      node.addEventListener('mouseenter', () => {
        applyGraphSeriesHighlight(node.getAttribute('data-chart-series-key') || '');
      });
      node.addEventListener('mouseleave', () => {
        applyGraphSeriesHighlight('');
      });
    });

    body.querySelectorAll('[data-chart-trend]').forEach(input => {
      input.addEventListener('change', () => {
        const nextTrends = {
          ...trendState,
          [input.getAttribute('data-chart-trend') || '']: input.checked
        };
        setSummaryChartPref(chartKey, {
          mode,
          duration: durationDays,
          trends: nextTrends,
          hiddenSeries: Array.from(hiddenSeriesSet)
        });
        renderSectionToggleChartInto(root, chartData, mode, durationDays);
      });
    });

    body.querySelectorAll('.tm-stat-chart-legend-item[data-chart-series-key]').forEach(item => {
      const seriesKey = item.getAttribute('data-chart-series-key') || '';
      const activate = () => applyLegendSeriesHighlight(seriesKey);
      const deactivate = () => applyLegendSeriesHighlight('');
      const toggleSeries = () => {
        const nextHiddenSeries = new Set(hiddenSeriesSet);
        if (nextHiddenSeries.has(seriesKey)) nextHiddenSeries.delete(seriesKey);
        else nextHiddenSeries.add(seriesKey);

        setSummaryChartPref(chartKey, {
          mode,
          duration: durationDays,
          trends: trendState,
          hiddenSeries: Array.from(nextHiddenSeries)
        });
        renderSectionToggleChartInto(root, chartData, mode, durationDays);
      };
      item.addEventListener('mouseenter', activate);
      item.addEventListener('focus', activate);
      item.addEventListener('mouseleave', deactivate);
      item.addEventListener('blur', deactivate);
      item.addEventListener('click', event => {
        event.preventDefault();
        toggleSeries();
      });
      item.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleSeries();
      });
    });

      body.addEventListener('mouseleave', hideTooltip);

      if (copyButton) {
        copyButton.onclick = async event => {
          event.preventDefault();
          if (!svg || copyButton.disabled) return;

          clearTimeout(copyFeedbackTimer);
          copyButton.disabled = true;
          setChartCopyButtonState(copyButton);

          try {
            await copyChartSvgToClipboard(root);
            setChartCopyButtonState(copyButton, 'success');
          } catch (error) {
            console.warn('[itch-stats] Failed to copy chart image', error);
            setChartCopyButtonState(copyButton, 'error');
          } finally {
            copyFeedbackTimer = window.setTimeout(() => {
              copyButton.disabled = !canCopyChartImage();
              setChartCopyButtonState(copyButton);
            }, 1600);
          }
        };
      }
    } catch (error) {
      console.warn('[itch-stats] Failed to render chart', {
        chartKey,
        mode,
        durationDays,
        error
      });
      body.innerHTML = `<div class="tm-stat-muted">Failed to render chart.</div>`;
      if (tooltip) {
        tooltip.classList.remove('tm-visible');
        tooltip.innerHTML = '';
      }
    }
  }

  function sortRefreshItems(items, records) {
    function getPriority(item) {
      const hasRecords = getQueueItemRecords(records, item).length > 0;
      const sectionOrder = getFilterSectionConfigs().reduce((acc, section, index) => {
        acc[section.key] = index + 1;
        return acc;
      }, {});

      if (item.section === 'default' && hasRecords) return 100;
      if (item.section === 'default') return 10;
      if (item.section === 'intersections') return 0;
      if (sectionOrder[item.section]) return sectionOrder[item.section];
      return 50;
    }

    return [...items].sort((a, b) => {
      const priorityDelta = getPriority(a) - getPriority(b);
      if (priorityDelta) return priorityDelta;

      const seriesDelta = getSeriesOrder(a.series) - getSeriesOrder(b.series);
      if (seriesDelta) return seriesDelta;

      const sectionDelta = String(a.section || '').localeCompare(String(b.section || ''));
      if (sectionDelta) return sectionDelta;

      const labelDelta = normalize(a.label).localeCompare(normalize(b.label));
      if (labelDelta) return labelDelta;

      return String(a.series || '').localeCompare(String(b.series || ''));
    });
  }

  function getSummaryData(game) {
    const positions = loadPositions();
    const metaCache = loadGameMeta();
    const possibleKeys = [
      game?.id ? `id:${game.id}` : null,
      game?.name ? `name:${normalize(game.name)}` : null
    ].filter(Boolean);

    let entry = null;
    let meta = null;

    for (const key of possibleKeys) {
      if (!entry && positions[key]) entry = positions[key];
      if (!meta && metaCache[key]) meta = metaCache[key];
    }

    const records = Array.isArray(entry?.records) ? entry.records : [];

    if (!meta) {
      const namesToMatch = [
        game?.name,
        entry?.game?.name,
        ...records.map(record => record?.game?.name)
      ]
        .map(name => normalize(name))
        .filter(Boolean);

      const cachedItems = Object.values(metaCache)
        .filter(item => item && typeof item === 'object');

      meta = cachedItems.find(item => {
        const itemName = normalize(item?.name);
        return itemName && namesToMatch.some(name => {
          return itemName === name || itemName.includes(name) || name.includes(itemName);
        });
      }) || null;

      if (!meta && cachedItems.length === 1) {
        meta = cachedItems[0];
      }
    }

    const mainLabels = SEARCH_SERIES.map(item => item.label);
    const sectionsData = getFilterSectionConfigs().reduce((acc, section) => {
      const sectionLinks = getRecordSectionLinks(meta, section.key);
      const liveSummaryLabels = getMetaSectionLabelsForSummary(meta, section.key);
      const summaryLabels = [
        ...(liveSummaryLabels.length ? liveSummaryLabels : getDerivedSectionLabelsForSummary(records, section.key)),
        ...(section.key === 'misc' ? getKnownFilterLabels(section.type) : [])
      ];
      const canonicalLabels = normalizeLabelList(
        summaryLabels.map(label => canonicalizeLabelWithLinks(section.type, label, sectionLinks))
      );

      if (section.key === 'platforms' && canonicalLabels.some(label => normalize(label) === 'web') && !canonicalLabels.some(label => normalize(label) === 'mobile web')) {
        canonicalLabels.push('Mobile Web');
      }

      acc[section.key] = {
        labels: canonicalLabels,
        links: buildFilterLinkEntries(section.type, canonicalLabels, sectionLinks)
      };
      return acc;
    }, {});

    const knownSideLabels = new Set([
      ...mainLabels,
      ...sectionsData.genres.labels,
      ...sectionsData.platforms.labels
    ].map(x => normalize(x)));
    sectionsData.tags.labels = sectionsData.tags.labels
      .filter(label => !knownSideLabels.has(normalize(label)));
    sectionsData.tags.links = buildFilterLinkEntries('tag', sectionsData.tags.labels, sectionsData.tags.links);

    const metaUrl = meta?.url || '';
    const publicBaseUrl = game?.href || metaUrl;

    return {
      possibleKeys,
      entry,
      meta,
      records,
      mainLabels,
      sectionsData,
      genreLabels: sectionsData.genres.labels,
      platformLabels: sectionsData.platforms.labels,
      tagLabels: sectionsData.tags.labels,
      publicBaseUrl,
      genreLinks: sectionsData.genres.links,
      platformLinks: sectionsData.platforms.links,
      tagLinks: sectionsData.tags.links,
      intersections: getGameIntersections(game)
    };
  }

  function buildRefreshQueue(game) {
    const data = getSummaryData(game);
    const enabledSeries = getEnabledSummarySeries();
    const sectionState = loadSummarySectionState();
    const sectionRefreshItems = getFilterSectionConfigs().flatMap(section => {
      if (!getSummarySectionStateEntry(sectionState, section.key).enabled) return [];
      const links = Array.isArray(data.sectionsData?.[section.key]?.links) ? data.sectionsData[section.key].links : [];
      return links.flatMap(item => enabledSeries.map(series => ({
        section: section.key,
        label: item.label,
        series,
        url: buildSeriesUrl(series, item.href)
      })));
    });
    const items = dedupeRefreshItems([
      ...(getSummarySectionStateEntry(sectionState, 'default').enabled ? enabledSeries.map(series => ({
        section: 'default',
        label: 'Default',
        series,
        url: buildSeriesUrl(series, 'https://itch.io/games')
      })) : []),
      ...sectionRefreshItems,
      ...(getSummarySectionStateEntry(sectionState, 'intersections').enabled ? data.intersections.flatMap(item => enabledSeries.map(series => ({
        section: 'intersections',
        id: item.id || '',
        label: item.label,
        series,
        url: buildSeriesUrl(series, item.popularUrl),
        parts: item.parts
      }))) : [])
    ]);

    const missingItems = items.filter(item => !getQueueItemRecords(data.records, item).length);
    if (missingItems.length) {
      return sortRefreshItems(missingItems, data.records);
    }

    return sortRefreshItems(items, data.records);
  }

  function startSummaryRefresh(game, widget = null) {
    if (!game) return false;

    const refreshState = {
      phase: 'search',
      game: {
        id: game?.id || null,
        name: game?.name || 'Unknown game'
      },
      summaryUrl: location.href,
      queue: buildRefreshQueue(game),
      index: 0,
      startedAt: Date.now()
    };

    if (!refreshState.queue.length) {
      const status = widget?.querySelector?.('#tm-summary-refresh-status') || document.querySelector('#tm-summary-refresh-status');
      if (status) status.textContent = 'Нет включённых разделов для обновления.';
      return false;
    }

    saveRefreshState(refreshState);
    location.href = refreshState.queue[0].url;
    return true;
  }

  function triggerJsonDownload(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function replaceGameDataset(game, payload) {
    if (!game || !payload) return false;

    const positions = loadPositions();
    const metaCache = loadGameMeta();
    const intersectionsState = loadIntersectionsState();
    const currentKey = getGameKey(game);
    const currentPossibleKeys = [
      game?.id ? `id:${game.id}` : null,
      game?.name ? `name:${normalize(game.name)}` : null
    ].filter(Boolean);
    const importedGame = payload.game || {};
    const importedPossibleKeys = Array.isArray(payload.possibleKeys) ? payload.possibleKeys.filter(Boolean) : [];
    const importedCurrentKey = importedGame?.id
      ? `id:${importedGame.id}`
      : (importedGame?.name ? `name:${normalize(importedGame.name)}` : '');
    const cleanupKeys = [...new Set([...currentPossibleKeys, ...importedPossibleKeys, importedCurrentKey].filter(Boolean))];

    cleanupKeys.forEach(key => {
      delete positions[key];
      delete metaCache[key];
    });

    const importedEntry = deepClone(payload.positionsEntry, null);
    if (importedEntry && currentKey) {
      importedEntry.game = {
        id: game?.id || importedEntry.game?.id || importedGame?.id || null,
        name: game?.name || importedEntry.game?.name || importedGame?.name || ''
      };
      positions[currentKey] = importedEntry;
    }

    let importedMeta = deepClone(payload.meta, null);
    if (!importedMeta && importedEntry?.game) {
      importedMeta = {
        id: importedEntry.game.id || importedGame?.id || null,
        name: importedEntry.game.name || importedGame?.name || '',
        url: '',
        sections: getEmptyMetaSections()
      };
    }
    if (importedMeta) {
      importedMeta.id = game?.id || importedMeta.id || importedGame?.id || null;
      importedMeta.name = game?.name || importedMeta.name || importedGame?.name || '';
      importedMeta.importedHiddenSections = collectImportedHiddenSections(importedEntry?.records || [], importedMeta);
      if (importedMeta.id) metaCache[`id:${importedMeta.id}`] = importedMeta;
      if (importedMeta.name) metaCache[`name:${normalize(importedMeta.name)}`] = importedMeta;
    }

    const intersectionKey = getIntersectionStorageKey(game);
    if (intersectionKey) {
      intersectionsState[intersectionKey] = normalizeIntersectionItems(
        Array.isArray(payload.intersections) ? deepClone(payload.intersections, []) : []
      );
    }

    savePositions(positions);
    saveGameMeta(metaCache);
    saveIntersectionsState(intersectionsState);
    return true;
  }

  function buildLegacyStatLabelCell(label) {
    return escapeHtml(label);
  }

  function buildStatRows(records, labels) {
    return labels
      .map(label => {
        const matching = findRecordsForLabel(records, label);
        const current = matching.reduce((best, item) => {
          if (!best) return item;
          return Number(item.foundAt || 0) >= Number(best.foundAt || 0) ? item : best;
        }, null);
        const best = matching.reduce((bestItem, item) => {
          if (!bestItem) return item;
          return Number(item.globalPosition || 999999) < Number(bestItem.globalPosition || 999999) ? item : bestItem;
        }, null);

        return `
          <tr>
            <td>${buildLegacyStatLabelCell(label)}</td>
            <td>${renderStatCell(current, { current: true, bestRecord: best })}</td>
            <td>${renderBestStatCell(best)}</td>
          </tr>
        `;
      })
      .join('');
  }

  function findGameForCurrentSummaryPage() {
    const gameId = getCurrentGameIdFromSummaryUrl();
    loadDashboardGamesFromCache();

    if (gameId) {
      const byId = dashboardGames.find(g => String(g.id) === String(gameId));
      if (byId) return byId;
    }

    const title =
      document.querySelector('.game_title')?.textContent ||
      document.querySelector('h1')?.textContent ||
      document.title?.replace(/analytics|summary|itch\.io/gi, '').trim();

    if (title) {
      const byName = dashboardGames.find(g => normalize(title).includes(normalize(g.name)));
      if (byName) return byName;

      return {
        id: gameId,
        name: title.trim()
      };
    }

    return {
      id: gameId,
      name: gameId ? `Game ${gameId}` : 'Unknown game'
    };
  }

  function getSummaryStatsMountPoint() {
    const referrersBlock = document.querySelector('.padded .referrers');
    if (referrersBlock?.parentElement) {
      return {
        parent: referrersBlock.parentElement,
        after: referrersBlock
      };
    }

    const paddedBlocks = [...document.querySelectorAll('.padded')];
    if (paddedBlocks.length) {
      return {
        parent: paddedBlocks[paddedBlocks.length - 1],
        after: null
      };
    }

    return {
      parent:
        document.querySelector('.inner_column') ||
        document.querySelector('.main') ||
        document.body,
      after: null
    };
  }

  function createSummaryStatsWidget() {
    const game = findGameForCurrentSummaryPage();
    const summaryData = getSummaryData(game);
    const {
      possibleKeys,
      records,
      sectionsData,
      publicBaseUrl,
      intersections
    } = summaryData;
    const publicGameUrl = publicBaseUrl
      ? publicBaseUrl + (publicBaseUrl.includes('?') ? '&' : '?') + 'tm_return=' + encodeURIComponent(location.href)
      : '';

    const existingWidget = document.querySelector('#tm-itch-summary-stats');
    if (existingWidget) existingWidget.remove();
    const mountPoint = getSummaryStatsMountPoint();

    const widget = document.createElement('div');
    const sectionState = loadSummarySectionState();
    const seriesState = loadSummarySeriesState();
    const visibleSeries = ANALYTICS_SERIES
      .map(item => item.key)
      .filter(key => seriesState[key]);
    const selected = new Set();
    widget.id = 'tm-itch-summary-stats';
    widget.classList.add('tm-embedded');

    function getLatestRecord(recordsToCheck) {
      return recordsToCheck.reduce((best, item) => {
        if (!best) return item;
        return Number(item.foundAt || 0) >= Number(best.foundAt || 0) ? item : best;
      }, null);
    }

    function getBestRecord(recordsToCheck) {
      return recordsToCheck.reduce((best, item) => {
        if (!best) return item;
        return Number(item.globalPosition || 999999) < Number(best.globalPosition || 999999) ? item : best;
      }, null);
    }

    function getLatestAnalyticsTimestamp() {
      return records.reduce((best, record) => Math.max(best, Number(record?.foundAt || 0)), 0);
    }

    function launchSummaryRefresh() {
      return startSummaryRefresh(game, widget);
    }

    function showSummaryReminder() {
      if (summaryReminderShown) return;
      summaryReminderShown = true;

      const previous = document.querySelector('#tm-summary-reminder');
      if (previous) previous.remove();

      const reminder = document.createElement('div');
      reminder.id = 'tm-summary-reminder';
      reminder.className = 'tm-summary-reminder';

      const latestFoundAt = getLatestAnalyticsTimestamp();
      if (!latestFoundAt) return;

      const now = new Date();
      const then = new Date(latestFoundAt);
      const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
      const days = Math.max(0, Math.floor((startNow - startThen) / (24 * 60 * 60 * 1000)));
      if (!days) return;

      const dateText = then.toLocaleDateString('ru-RU');
      const timeText = then.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const dayLabel = days === 1 ? 'день' : (days >= 2 && days <= 4 ? 'дня' : 'дней');
      const reminderTitle = `Аналитика не обновлялась ${days} ${dayLabel}`;
      const reminderMeta = `Последнее обновление: ${dateText} в ${timeText}`;

      reminder.innerHTML = `
        <div class="tm-summary-reminder-badge">
          <span class="tm-summary-reminder-badge-value">${days}</span>
          <span class="tm-summary-reminder-badge-label">${escapeHtml(dayLabel)}</span>
        </div>
        <div class="tm-summary-reminder-content">
          <div class="tm-summary-reminder-title">${escapeHtml(reminderTitle)}</div>
          <div class="tm-summary-reminder-meta">${escapeHtml(reminderMeta)}</div>
        </div>
        <button class="tm-summary-reminder-close" type="button" title="Закрыть">×</button>
      `;
      document.body.appendChild(reminder);

      let removed = false;
      const removeReminder = () => {
        if (removed) return;
        removed = true;
        reminder.classList.remove('tm-visible');
        setTimeout(() => reminder.remove(), 180);
      };

      const closeButton = reminder.querySelector('.tm-summary-reminder-close');
      closeButton?.addEventListener('click', event => {
        event.stopPropagation();
        removeReminder();
      });
      if (game) {
        reminder.classList.add('tm-clickable');
        reminder.title = 'Нажми, чтобы обновить аналитику';
        reminder.addEventListener('click', () => {
          launchSummaryRefresh();
          removeReminder();
        });
      }
      setTimeout(() => reminder.classList.add('tm-visible'), 10);
      setTimeout(removeReminder, 5000);
    }

    function createFilterOptions(type, labels, links) {
      const linkByLabel = new Map(links.map(item => [normalize(item.label), item.href]));
      return labels
        .map(label => ({
          type,
          label,
          href: linkByLabel.get(normalize(label)) || buildSearchUrlForLabel(type, label)
        }))
        .filter(item => item.href);
    }

    const filterSections = getFilterSectionConfigs();
    const selectableOptions = filterSections.flatMap(section => {
      const sectionData = sectionsData?.[section.key] || { labels: [], links: [] };
      return createFilterOptions(section.type, sectionData.labels, sectionData.links).map(item => ({
        ...item,
        sectionKey: section.key
      }));
    });
    const sectionHrefByLabel = filterSections.reduce((acc, section) => {
      acc[section.key] = new Map(
        (sectionsData?.[section.key]?.links || []).map(item => [normalize(item.label), item.href])
      );
      return acc;
    }, {});
    const intersectionHrefByLabel = new Map(intersections.map(item => [normalize(item.label), item.popularUrl]));

    function getSummaryBaseHref(section, label) {
      const key = normalize(label);
      if (section === 'default') return 'https://itch.io/games';
      const sectionConfig = getFilterSectionConfigByKey(section);
      if (sectionConfig) {
        return sectionHrefByLabel[section]?.get(key) || buildSearchUrlForLabel(sectionConfig.type, label);
      }
      if (section === 'intersections') return intersectionHrefByLabel.get(key) || '';
      return '';
    }

    function buildRow(label, section = '', extra = {}) {
      const baseHref = getSummaryBaseHref(section, label);
      const seriesStats = ANALYTICS_SERIES.reduce((acc, item) => {
        const matchingRecords = getQueueItemRecords(records, {
          section,
          label,
          series: item.key
        });

        acc[item.key] = {
          href: baseHref ? buildSeriesUrl(item.key, baseHref) : '',
          current: getLatestRecord(matchingRecords),
          best: getBestRecord(matchingRecords)
        };
        return acc;
      }, {});

      return {
        label,
        section,
        seriesStats,
        ...extra
      };
    }

    function buildRows(labels, section = '') {
      return labels.map(label => buildRow(label, section));
    }

    function getSectionSeriesMode(sectionKey) {
      const pendingFocus = transferredPayload?.pendingSummaryFocus;
      const requestedSeries = String(pendingFocus?.section === sectionKey ? pendingFocus?.series || '' : '').trim();
      if (requestedSeries && visibleSeries.includes(requestedSeries)) {
        return requestedSeries;
      }
      return getSummaryChartPref(sectionKey, visibleSeries).mode;
    }

    function buildSeriesHeaderCells() {
      return `
        <th class="tm-stat-series-cell">Now</th>
        <th class="tm-stat-series-cell">Best</th>
      `;
    }

    function buildSeriesValueCells(row, activeSeriesKey = '') {
      const stats = row.seriesStats?.[activeSeriesKey] || {};
      return `
        <td class="tm-stat-series-cell" data-summary-series-current="${escapeHtml(activeSeriesKey)}">${renderStatCell(stats.current, { current: true, bestRecord: stats.best, href: stats.href })}</td>
        <td class="tm-stat-series-cell" data-summary-series-best="${escapeHtml(activeSeriesKey)}">${renderBestStatCell(stats.best)}</td>
      `;
    }

    function sortRowsForSeries(rows, activeSeriesKey = '') {
      return [...rows].sort((left, right) => {
        const leftRank = Number(left?.seriesStats?.[activeSeriesKey]?.current?.globalPosition || Number.POSITIVE_INFINITY);
        const rightRank = Number(right?.seriesStats?.[activeSeriesKey]?.current?.globalPosition || Number.POSITIVE_INFINITY);
        if (leftRank !== rightRank) return leftRank - rightRank;
        return normalize(left?.label).localeCompare(normalize(right?.label));
      });
    }

    function buildTableRows(rows, options = {}) {
      if (!rows.length) {
        return `
          <tr>
            ${options.selectable ? '<td class="tm-stat-select-col"></td>' : '<td class="tm-stat-select-col tm-stat-placeholder-cell"></td>'}
            <td>&#8212;</td>
            <td class="tm-stat-series-cell">&#8212;</td>
            <td class="tm-stat-series-cell">&#8212;</td>
            ${options.allowDelete ? '<td class="tm-stat-action-col"></td>' : '<td class="tm-stat-action-col tm-stat-placeholder-cell"></td>'}
          </tr>
        `;
      }

      return rows.map(row => {
        const selectMeta = options.getSelectMeta ? options.getSelectMeta(row) : null;
        const selectCell = options.selectable ? `
          <td class="tm-stat-select-col">
            <input
              class="tm-stat-checkbox"
              type="${escapeHtml(selectMeta?.inputType || 'checkbox')}"
              ${selectMeta?.inputName ? `name="${escapeHtml(selectMeta.inputName)}"` : ''}
              data-select-key="${escapeHtml(selectMeta?.selectKey || '')}"
              data-select-type="${escapeHtml(selectMeta?.selectType || '')}"
              ${options.enabled === false ? 'disabled' : ''}
            >
          </td>
        ` : '<td class="tm-stat-select-col tm-stat-placeholder-cell"></td>';

        const actionCell = options.allowDelete ? `
          <td class="tm-stat-action-col">
            <button class="tm-remove-intersection" data-remove-intersection="${escapeHtml(row.id)}" title="Удалить" ${options.enabled === false ? 'disabled' : ''}>×</button>
          </td>
        ` : '<td class="tm-stat-action-col tm-stat-placeholder-cell"></td>';

        return `
          <tr data-summary-row-section="${escapeHtml(row.section || options.sectionKey || '')}" data-summary-row-label="${escapeHtml(normalize(row.label))}">
            ${selectCell}
            <td><div class="tm-stat-name-cell"><span>${escapeHtml(row.displayLabel || row.label)}</span></div></td>
            ${buildSeriesValueCells(row, options.activeSeriesKey)}
            ${actionCell}
          </tr>
        `;
      }).join('');
    }

    function buildSectionSeriesSelector(sectionKey, activeSeriesKey, enabled) {
      if (!visibleSeries.length) return '';

      return `
        <div class="tm-section-series-toggle">
          ${visibleSeries.map(seriesKey => `
            <button
              class="tm-section-series-button ${seriesKey === activeSeriesKey ? 'tm-active' : ''}"
              type="button"
              data-section-series="${escapeHtml(seriesKey)}"
              data-section-series-key="${escapeHtml(sectionKey)}"
              ${enabled ? '' : 'disabled'}
            >${escapeHtml(getSeriesLabel(seriesKey))}</button>
          `).join('')}
        </div>
      `;
    }

    function sectionHtml(key, title, rows, options = {}) {
      const sectionUiState = getSummarySectionStateEntry(sectionState, key);
      const autoCollapsed = rows.length < 4;
      const chartCollapsed = sectionUiState.touched
        ? !!sectionUiState.chartCollapsed
        : autoCollapsed || !!sectionUiState.chartCollapsed;
      const enabled = !!sectionUiState.enabled;
      const activeSeriesKey = getSectionSeriesMode(key);
      const sortedRows = sortRowsForSeries(rows, activeSeriesKey);
      const chartHtml = renderSectionChartSkeleton(options.chartKey || key, visibleSeries, chartCollapsed);
      const emptySeriesNote = visibleSeries.length
        ? ''
        : `<div class="tm-stat-muted">Включите хотя бы один раздел выше, чтобы видеть аналитику и запускать обновление.</div>`;
      const bodyHtml = enabled
        ? `
          <div class="tm-stat-section-body">
            <div class="tm-stat-table-wrap">
              <table class="tm-stat-table">
                <thead>
                  <tr>
                    ${options.selectable ? '<th class="tm-stat-select-col"></th>' : '<th class="tm-stat-select-col tm-stat-placeholder-col"></th>'}
                    <th>Раздел</th>
                    ${buildSeriesHeaderCells()}
                    ${options.allowDelete ? '<th class="tm-stat-action-col"></th>' : '<th class="tm-stat-action-col tm-stat-placeholder-col"></th>'}
                  </tr>
                </thead>
                <tbody>
                  ${buildTableRows(sortedRows, {
                    ...options,
                    enabled,
                    activeSeriesKey
                  })}
                </tbody>
              </table>
            </div>
            ${emptySeriesNote}
            <div class="tm-stat-chart-shell">
              ${chartHtml}
            </div>
          </div>
        `
        : '';

      return `
        <section class="tm-stat-section" data-summary-section="${escapeHtml(key)}">
          <div class="tm-stat-section-title">
            <div class="tm-stat-section-title-main">
              <input
                class="tm-stat-section-enable"
                type="checkbox"
                data-section-enable="${escapeHtml(key)}"
                ${enabled ? 'checked' : ''}
              >
              <div class="tm-stat-section-title-copy">
                <span class="tm-stat-section-title-text">${escapeHtml(title)}</span>
                ${buildSectionSeriesSelector(key, activeSeriesKey, enabled)}
              </div>
            </div>
          </div>
          ${bodyHtml}
        </section>
      `;
    }

    const defaultRows = [buildRow('Top', 'default', {
      displayLabel: getSeriesLabel(getSectionSeriesMode('default')) || 'Top'
    })];
    const sectionRowsByKey = filterSections.reduce((acc, section) => {
      acc[section.key] = buildRows(sectionsData?.[section.key]?.labels || [], section.key);
      return acc;
    }, {});
    const intersectionRows = intersections.map(item => buildRow(item.label, 'intersections', {
      id: item.id || ''
    }));

    const chartDataByKey = filterSections.reduce((acc, section) => {
      acc[section.key] = getSectionToggleChartData(records, section.key, sectionRowsByKey[section.key].map(row => row.label));
      return acc;
    }, {
      default: getSectionToggleChartData(records, 'default', defaultRows.map(row => row.label)),
      intersections: getSectionToggleChartData(records, 'intersections', intersectionRows.map(row => row.label))
    });

    const seriesToggleHtml = ANALYTICS_SERIES.map(item => `
      <label class="tm-series-toggle">
        <input class="tm-series-toggle-input" type="checkbox" data-summary-series="${escapeHtml(item.key)}" ${seriesState[item.key] ? 'checked' : ''}>
        <span class="tm-series-toggle-label">${escapeHtml(item.label)}</span>
      </label>
    `).join('');

    const filterSectionsHtml = filterSections.map(section => {
      function getSelectMeta(row) {
        const normalizedLabel = normalize(row.label);
        if (section.selection === 'single') {
          return {
            selectKey: `${section.type}|${normalizedLabel}`,
            selectType: section.type,
            inputType: 'radio',
            inputName: `tm-select-${section.key}`
          };
        }

        if (section.selection === 'price') {
          const isPriceBase = getPriceBaseSelectionLabels().some(label => normalize(label) === normalizedLabel);
          return {
            selectKey: `${section.type}|${normalizedLabel}`,
            selectType: isPriceBase ? 'price-base' : 'price-extra',
            inputType: isPriceBase ? 'radio' : 'checkbox',
            inputName: isPriceBase ? 'tm-select-price-base' : ''
          };
        }

        return {
          selectKey: `${section.type}|${normalizedLabel}`,
          selectType: section.type,
          inputType: 'checkbox',
          inputName: ''
        };
      }

      return sectionHtml(section.key, section.title, sectionRowsByKey[section.key], {
        selectable: true,
        getSelectMeta
      });
    }).join('');

    const sidePanelHtml = `
      <aside class="tm-summary-sidepanel">
        <div class="tm-summary-sidepanel-title">Summary Controls</div>
        <div class="tm-series-toolbar">
          <div class="tm-series-toolbar-title">Разделы аналитики и обновления</div>
          <div class="tm-series-toggle-row">
            ${seriesToggleHtml}
          </div>
          <div class="tm-stat-muted">Обновление проходит только по включённым разделам.</div>
        </div>
        <div class="tm-summary-control-stack">
          <button class="tm-small-button tm-secondary-button tm-intersections-action" id="tm-build-intersection">
            Собрать пересечение
          </button>
          ${publicGameUrl ? `
            <button class="tm-small-button tm-secondary-button" id="tm-fetch-game-tags">
              Получить теги
            </button>
          ` : `
            <button class="tm-small-button tm-secondary-button" disabled>
              Нет ссылки
            </button>
          `}
          ${game ? `
            <button class="tm-small-button tm-primary-button" id="tm-refresh-game-stats">
              &#x21bb; Обновить
            </button>
            <div class="tm-stat-muted" id="tm-summary-refresh-status"></div>
          ` : `
            <button class="tm-small-button tm-primary-button" disabled>
              &#x21bb; Обновить
            </button>
          `}
          <button class="tm-small-button tm-secondary-button" id="tm-export-game-stats">
            Экспорт
          </button>
          <button class="tm-small-button tm-secondary-button" id="tm-import-game-stats">
            Импорт
          </button>
          <input class="tm-summary-sidepanel-file" id="tm-import-game-stats-file" type="file" accept="application/json">
          <button class="tm-small-button tm-clear-button" id="tm-clear-this-game-stats">
            Очистить
          </button>
        </div>
      </aside>
    `;

    widget.innerHTML = `
      <div class="tm-widget-head">
        <div class="tm-widget-title">Summary Stats</div>
        <button class="tm-widget-collapse" id="tm-summary-collapse" type="button" title="Свернуть">-</button>
      </div>
      <div class="tm-summary-root-body tm-widget-scroll-body">
        <div class="tm-summary-shell">
          ${sidePanelHtml}
          <div class="tm-summary-main">
            ${sectionHtml('default', 'Общее', defaultRows)}
            ${filterSectionsHtml}
            ${sectionHtml('intersections', 'Пересечения', intersectionRows, {
              allowDelete: true
            })}

            ${!records.length ? `
              <div class="tm-stat-muted">
                Для этой игры пока нет сохранённых позиций.
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    if (mountPoint.after?.nextSibling) {
      mountPoint.parent.insertBefore(widget, mountPoint.after.nextSibling);
    } else if (mountPoint.after) {
      mountPoint.parent.appendChild(widget);
    } else {
      mountPoint.parent.appendChild(widget);
    }
    showSummaryReminder();

    const rootBody = widget.querySelector('.tm-summary-root-body');
    const collapseButton = widget.querySelector('#tm-summary-collapse');

    function setSummaryCollapsed(collapsed, persist = true) {
      if (!rootBody || !collapseButton) return;
      rootBody.classList.toggle('tm-hidden', collapsed);
      collapseButton.textContent = collapsed ? '+' : '-';
      collapseButton.title = collapsed ? 'Развернуть' : 'Свернуть';
      collapseButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (persist) {
        localStorage.setItem(STORAGE_KEY_SUMMARY_COLLAPSED, collapsed ? '1' : '0');
      }
    }

    collapseButton?.addEventListener('click', () => {
      const isCollapsed = rootBody?.classList.contains('tm-hidden');
      setSummaryCollapsed(!isCollapsed);
    });

    setSummaryCollapsed(localStorage.getItem(STORAGE_KEY_SUMMARY_COLLAPSED) === '1', false);

    widget.querySelectorAll('[data-chart-root]').forEach(root => {
      const chartKey = root.getAttribute('data-chart-root');
      const chartData = chartDataByKey[chartKey];
      if (!chartData) return;

      const initialPref = getSummaryChartPref(chartKey, visibleSeries);
      let currentMode = initialPref.mode;
      let currentDuration = initialPref.duration;

      root.querySelectorAll('[data-chart-duration]').forEach(button => {
        const buttonDuration = Number(button.getAttribute('data-chart-duration')) || 1;
        button.classList.toggle('tm-active', buttonDuration === currentDuration);
      });

      try {
        renderSectionToggleChartInto(root, chartData, currentMode, currentDuration);
      } catch (error) {
        console.warn('[itch-stats] Failed to initialize chart', { chartKey, error });
      }

      root.querySelectorAll('[data-chart-duration]').forEach(button => {
        button.addEventListener('click', () => {
          const nextDuration = Number(button.getAttribute('data-chart-duration')) || currentDuration;
          currentDuration = nextDuration;
          setSummaryChartPref(chartKey, {
            mode: currentMode,
            duration: currentDuration,
            trends: getSummaryChartPref(chartKey, visibleSeries).trends,
            hiddenSeries: getSummaryChartPref(chartKey, visibleSeries).hiddenSeries
          });
          root.querySelectorAll('[data-chart-duration]').forEach(other => {
            other.classList.toggle('tm-active', other === button);
          });
          try {
            renderSectionToggleChartInto(root, chartData, currentMode, currentDuration);
          } catch (error) {
            console.warn('[itch-stats] Failed to update chart duration', {
              chartKey,
              duration: currentDuration,
              error
            });
          }
        });
      });
    });

    function setChartCollapsed(root, collapsed) {
      if (!root) return;

      const content = root.querySelector('.tm-stat-chart-content');
      const button = root.querySelector('[data-chart-collapse]');
      if (!content) return;

      if (collapsed) {
        content.style.maxHeight = `${content.scrollHeight}px`;
        content.offsetHeight;
        root.classList.add('tm-collapsed');
        content.style.maxHeight = '0px';
      } else {
        root.classList.remove('tm-collapsed');
        content.style.maxHeight = '0px';
        content.offsetHeight;
        content.style.maxHeight = `${content.scrollHeight}px`;
      }

      if (button) {
        button.textContent = collapsed ? '+' : '-';
        button.title = collapsed ? 'Развернуть график' : 'Свернуть график';
        button.setAttribute('aria-label', collapsed ? 'Развернуть график' : 'Свернуть график');
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
    }

    function scrollSummaryWidgetIntoView() {
      widget.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }

    function focusSummaryTarget(target) {
      if (!target || typeof target !== 'object') return;

      const sectionKey = String(target.section || '').trim();
      const labelKey = normalize(target.label);
      const seriesKey = String(target.series || '').trim();
      if (!sectionKey || !labelKey) return;

      if (seriesKey && visibleSeries.includes(seriesKey)) {
        const currentPref = getSummaryChartPref(sectionKey, visibleSeries);
        if (currentPref.mode !== seriesKey) {
          setSummaryChartPref(sectionKey, {
            ...currentPref,
            mode: seriesKey
          });
          if (transferredPayload) transferredPayload.pendingSummaryFocus = target;
          createSummaryStatsWidget();
          return;
        }
      }

      const rowSelector = `[data-summary-row-section="${CSS.escape(sectionKey)}"][data-summary-row-label="${CSS.escape(labelKey)}"]`;
      const row = widget.querySelector(rowSelector) || widget.querySelector(`[data-summary-row-label="${CSS.escape(labelKey)}"]`);
      if (!row) return;

      const scrollBody = widget.querySelector('.tm-widget-scroll-body') || widget;
      const bodyRect = scrollBody.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const nextTop = scrollBody.scrollTop + (rowRect.top - bodyRect.top) - (scrollBody.clientHeight / 2) + (rowRect.height / 2);

      scrollBody.scrollTo({
        top: Math.max(0, nextTop),
        behavior: 'smooth'
      });

      setTimeout(() => {
        row.classList.add('tm-stat-focus-row', 'tm-stat-focus-live');

        const focusCell = seriesKey
          ? row.querySelector(`[data-summary-series-current="${CSS.escape(seriesKey)}"]`)
          : null;
        if (focusCell) focusCell.classList.add('tm-stat-focus-cell');

        setTimeout(() => {
          row.classList.remove('tm-stat-focus-live');
          row.classList.remove('tm-stat-focus-row');
          if (focusCell) focusCell.classList.remove('tm-stat-focus-cell');
        }, 2600);
      }, 420);
    }

    widget.querySelectorAll('.tm-stat-chart-content').forEach(content => {
      const root = content.closest('.tm-stat-chart');
      content.style.maxHeight = root?.classList.contains('tm-collapsed')
        ? '0px'
        : `${content.scrollHeight}px`;

      content.addEventListener('transitionend', event => {
        if (event.propertyName !== 'max-height') return;
        content.style.maxHeight = root?.classList.contains('tm-collapsed')
          ? '0px'
          : 'none';
      });
    });

    widget.querySelectorAll('[data-chart-collapse]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const root = button.closest('[data-chart-root]');
        const key = root?.getAttribute('data-chart-root');
        if (!key || !root) return;

        const state = loadSummarySectionState();
        const current = getSummarySectionStateEntry(state, key);
        const isCollapsed = root.classList.contains('tm-collapsed');
        const nextCollapsed = !isCollapsed;

        state[key] = {
          ...current,
          chartCollapsed: nextCollapsed,
          touched: true
        };
        saveSummarySectionState(state);
        setChartCollapsed(root, nextCollapsed);
      });
    });

    widget.querySelectorAll('[data-section-enable]').forEach(input => {
      input.addEventListener('click', event => {
        event.stopPropagation();
      });

      input.addEventListener('change', () => {
        const key = input.getAttribute('data-section-enable');
        if (!key) return;

        const state = loadSummarySectionState();
        const current = getSummarySectionStateEntry(state, key);
        state[key] = {
          ...current,
          enabled: input.checked
        };
        saveSummarySectionState(state);
        createSummaryStatsWidget();
      });
    });

    widget.querySelectorAll('[data-section-series]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const seriesKey = button.getAttribute('data-section-series');
        const sectionKey = button.getAttribute('data-section-series-key');
        if (!sectionKey || !seriesKey || !isKnownSeriesKey(seriesKey)) return;

        const currentPref = getSummaryChartPref(sectionKey, visibleSeries);
        setSummaryChartPref(sectionKey, {
          mode: seriesKey,
          duration: currentPref.duration,
          trends: currentPref.trends,
          hiddenSeries: currentPref.hiddenSeries
        });
        createSummaryStatsWidget();
      });
    });

    widget.querySelectorAll('[data-summary-series]').forEach(input => {
      input.addEventListener('change', () => {
        const seriesKey = input.getAttribute('data-summary-series');
        if (!seriesKey || !isKnownSeriesKey(seriesKey)) return;

        const nextState = loadSummarySeriesState();
        nextState[seriesKey] = input.checked;
        saveSummarySeriesState(nextState);
        createSummaryStatsWidget();
      });
    });

    widget.querySelectorAll('.tm-stat-checkbox').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-select-key');
        const type = input.getAttribute('data-select-type');
        if (!key) return;

        if (input.type === 'radio' && input.checked) {
          widget.querySelectorAll(`.tm-stat-checkbox[data-select-type="${type}"]`).forEach(other => {
            const otherKey = other.getAttribute('data-select-key');
            if (other === input || !otherKey) return;
            selected.delete(otherKey);
          });
        }

        if (input.checked) selected.add(key);
        else selected.delete(key);
        updateBuildIntersectionButtonVisibility();
      });
    });

    widget.querySelectorAll('[data-remove-intersection]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-remove-intersection');
        saveGameIntersections(game, intersections.filter(item => item.id !== id));
        createSummaryStatsWidget();
      });
    });

    widget.querySelectorAll('[data-open-search-url]').forEach(button => {
      button.addEventListener('click', () => {
        const href = button.getAttribute('data-open-search-url');
        if (!href) return;

        setTransferredPendingSearch({
          id: game?.id || null,
          name: game?.name || 'Unknown game'
        });
        location.href = href;
      });
    });

    function exportCurrentGameStats() {
      const payload = getCurrentGameDataset(game, summaryData);
      const fileNameBase = slugifyLabel(payload.game?.name || game?.name || 'itch-stats');
      triggerJsonDownload(`itch-stats-${fileNameBase || 'game'}-${EXPORT_SCHEMA_VERSION}.json`, payload);
    }

    function getSelectedIntersectionParts() {
      return normalizeIntersectionParts(
        selectableOptions.filter(item => selected.has(`${item.type}|${normalize(item.label)}`))
      );
    }

    function updateBuildIntersectionButtonVisibility() {
      const buildButton = widget.querySelector('#tm-build-intersection');
      if (!buildButton) return;

      const parts = getSelectedIntersectionParts();
      const canBuild = !!game && parts.length >= 2 && !hasIntersectionItem(intersections, parts);
      buildButton.style.display = canBuild ? '' : 'none';
      buildButton.disabled = !canBuild;
      buildButton.title = !game
        ? 'Игра не определена'
        : (parts.length < 2
          ? 'Выберите минимум два фильтра'
          : `Собрать пересечение: ${parts.map(part => part.label).join(' + ')}`);
    }

    function buildIntersectionFromParts(parts) {
      if (!game) return false;

      const normalizedParts = normalizeIntersectionParts(parts);
      if (normalizedParts.length < 2) return false;

      const id = buildIntersectionId(normalizedParts);
      const urls = buildIntersectionUrls(normalizedParts);
      if (!urls.popularUrl || !urls.newPopularUrl) return false;

      const item = {
        id,
        label: normalizedParts.map(part => part.label).join(' + '),
        parts: normalizedParts,
        popularUrl: urls.popularUrl,
        newPopularUrl: urls.newPopularUrl
      };

      const nextItems = [...getGameIntersections(game)];
      const existingIndex = nextItems.findIndex(entry => entry.id === id);
      if (existingIndex >= 0) nextItems[existingIndex] = item;
      else nextItems.push(item);

      saveGameIntersections(game, nextItems);
      createSummaryStatsWidget();
      return true;
    }

    function enhanceReferrerIntersectionButtons() {
      document.querySelectorAll('.game_edit_referrer_analytics_widget table.referrers tbody tr').forEach(row => {
        const firstCell = row.cells?.[0];
        const link = firstCell?.querySelector?.('a[href]');
        if (!firstCell || !link) return;

        const existingButton = firstCell.querySelector('[data-tm-referrer-intersection]');
        const href = link.href || link.getAttribute('href') || '';
        const parts = getIntersectionPartsFromReferrerHref(href);

        if (parts.length < 2) {
          existingButton?.remove();
          return;
        }

        if (hasIntersectionItem(intersections, parts)) {
          existingButton?.remove();
          return;
        }

        const button = existingButton || document.createElement('button');
        button.type = 'button';
        button.className = 'button outline tm-referrer-intersection-button';
        button.textContent = 'Собрать пересечение';
        button.disabled = !game;
        button.title = game
          ? `Собрать пересечение: ${parts.map(part => part.label).join(' + ')}`
          : 'Игра не определена';
        button.setAttribute('data-tm-referrer-intersection', '1');
        button.dataset.href = href;

        if (!button._tmBound) {
          button.addEventListener('click', () => {
            if (!game) return;
            buildIntersectionFromParts(getIntersectionPartsFromReferrerHref(button.dataset.href || ''));
          });
          button._tmBound = true;
        }

        if (button !== existingButton) {
          link.insertAdjacentElement('afterend', button);
        }
      });
    }

    async function importCurrentGameStats(file) {
      if (!file || !game) return;

      let parsed = null;
      try {
        parsed = safeJsonParse(await file.text(), null);
      } catch (_) {
        parsed = null;
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        alert('Не удалось прочитать файл импорта.');
        return;
      }

      const sameGame = isSameGame(parsed.game, game);
      if (!sameGame) {
        alert('Файл импорта относится к другой игре.');
        return;
      }

      const existingPayload = getCurrentGameDataset(game, summaryData);
      const hasConflict =
        JSON.stringify(existingPayload.positionsEntry || null) !== JSON.stringify(parsed.positionsEntry || null) ||
        JSON.stringify(existingPayload.meta || null) !== JSON.stringify(parsed.meta || null) ||
        JSON.stringify(existingPayload.intersections || []) !== JSON.stringify(parsed.intersections || []);

      if (hasConflict) {
        const choice = prompt(
          'Найдены конфликтующие данные для этой игры.\n1 — оставить текущие данные\n2 — заменить текущие импортом\n0 — отменить импорт',
          '0'
        );
        if (choice === '1') return;
        if (choice !== '2') return;
      }

      if (!replaceGameDataset(game, parsed)) {
        alert('Не удалось импортировать данные.');
        return;
      }

      createSummaryStatsWidget();
    }

    const buildIntersectionButton = widget.querySelector('#tm-build-intersection');
    if (buildIntersectionButton) {
      buildIntersectionButton.addEventListener('click', () => {
        const parts = getSelectedIntersectionParts();
        buildIntersectionFromParts(parts);
      });
    }
    updateBuildIntersectionButtonVisibility();

    enhanceReferrerIntersectionButtons();

    const fetchTagsButton = widget.querySelector('#tm-fetch-game-tags');
    if (fetchTagsButton && publicGameUrl) {
      fetchTagsButton.addEventListener('click', () => {
        location.href = publicGameUrl;
      });
    }

    const refreshButton = widget.querySelector('#tm-refresh-game-stats');
    if (refreshButton && game) {
      refreshButton.addEventListener('click', () => {
        launchSummaryRefresh();
      });
    }

    const exportButton = widget.querySelector('#tm-export-game-stats');
    exportButton?.addEventListener('click', exportCurrentGameStats);

    const importButton = widget.querySelector('#tm-import-game-stats');
    const importInput = widget.querySelector('#tm-import-game-stats-file');
    importButton?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      await importCurrentGameStats(file);
      importInput.value = '';
    });

    const clearButton = widget.querySelector('#tm-clear-this-game-stats');
    clearButton.addEventListener('click', () => {
      if (!confirm('Очистить сохранённую статистику для этой игры?')) return;

      const all = loadPositions();
      const metaCache = loadGameMeta();
      const intersectionsState = loadIntersectionsState();
      const intersectionKey = getIntersectionStorageKey(game);

      for (const key of possibleKeys) {
        delete all[key];
        delete metaCache[key];
      }

      savePositions(all);
      saveGameMeta(metaCache);
      if (intersectionKey) {
        delete intersectionsState[intersectionKey];
        saveIntersectionsState(intersectionsState);
      }
      createSummaryStatsWidget();
    });

    const pendingSummaryFocus = transferredPayload?.pendingSummaryFocus;
    const pendingSummaryWidget = !!transferredPayload?.pendingSummaryWidget;
    if (pendingSummaryWidget) {
      transferredPayload.pendingSummaryWidget = false;
      setTimeout(() => scrollSummaryWidgetIntoView(), 40);
    }
    if (pendingSummaryFocus) {
      transferredPayload.pendingSummaryFocus = null;
      setTimeout(() => focusSummaryTarget(pendingSummaryFocus), 40);
    }
  }

  function installGamesPageObserver() {
    if (!isGamesPage) return;

    let timer = null;

    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        installTiltForVisibleCards();
        passiveScanOwnGames();
      }, 160);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        installTiltForVisibleCards();
        passiveScanOwnGames();
      }, 160);
    }, { passive: true });
  }

  function safeInit(label, fn) {
    try {
      fn();
    } catch (error) {
      console.error('[itch.io stats] init failed:', label, error);
    }
  }

  transferredPayload = consumeTransferredMeta();

  if (stopForCloudflareChallenge()) return;

  installAjaxObserver();

  if (isDashboardPage) {
    cacheDashboardGamesIfOnDashboard();

    const dashboardObserver = new MutationObserver(() => {
      cacheDashboardGamesIfOnDashboard();
    });

    dashboardObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (isGamesPage) {
    safeInit('games widget', () => {
      createSearchWidget();
      installGamesPageObserver();
    });
  }

  if (isPublicGamePage) {
    safeInit('public game meta', () => {
      cachePublicGameMetaIfAvailable();

      const publicGameObserver = new MutationObserver(() => {
        cachePublicGameMetaIfAvailable();
      });

      publicGameObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  if (isSummaryPage) {
    safeInit('summary stats', () => {
      createSummaryStatsWidget();

      let summaryReferrersTimer = null;
      const summaryReferrersObserver = new MutationObserver(() => {
        clearTimeout(summaryReferrersTimer);
        summaryReferrersTimer = setTimeout(() => {
          createSummaryStatsWidget();
        }, 120);
      });

      const referrersRoot = document.querySelector('.game_edit_referrer_analytics_widget');
      if (referrersRoot) {
        summaryReferrersObserver.observe(referrersRoot, {
          childList: true,
          subtree: true
        });
      }
    });
  }

  maybeResumeRefreshFlow().catch(error => {
    console.error('[itch.io stats] refresh resume failed:', error);
  });
})();
