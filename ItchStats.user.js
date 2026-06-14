// ==UserScript==
// @name         itch.io stats
// @namespace    https://itch.io/
// @version      5.0
// @description  Ищет свои игры в списках itch.io, сохраняет позиции, показывает статистику и пассивно подсвечивает найденные игры
// @match        https://itch.io/*
// @match        https://*.itch.io/*
// @author       Nnican
// @license      MIT
// @grant        none
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

  const style = document.createElement('style');
  style.textContent = `
    :root {
      --tm-accent: #D36D6D;
      --tm-accent-strong: #bc5b5b;
      --tm-accent-soft: rgba(211,109,109,.28);
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
      margin: 10px -12px 8px;
      padding: 9px 12px;
      background: var(--tm-accent);
      color: #fff;
      font-size: 13px;
      font-weight: 900;
      text-align: left;
      border-top: 1px solid rgba(255,255,255,.18);
      border-bottom: 1px solid rgba(255,255,255,.55);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }

    .tm-stat-section {
      margin-bottom: 8px;
    }

    .tm-stat-section-body {
      overflow: hidden;
      opacity: 1;
      max-height: 2000px;
      transition: max-height .28s ease, opacity .22s ease, margin-top .28s ease;
      will-change: max-height, opacity;
    }

    .tm-stat-section-body.tm-hidden {
      opacity: 0;
      max-height: 0;
      margin-top: -2px;
    }

    .tm-stat-section-toggle {
      opacity: .78;
      font-size: 12px;
      font-weight: 900;
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
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 8px;
      background: var(--tm-accent-strong);
      color: #fff;
      cursor: pointer;
      font-weight: 900;
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
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(0,0,0,.52);
      color: rgba(255,255,255,.74);
      font-size: 10px;
      line-height: 1.2;
      font-weight: 800;
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
      font-weight: 800;
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
      font-weight: 700;
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

    .tm-stat-chart {
      margin-top: 12px;
      padding: 10px 10px 8px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 10px;
      background: rgba(255,255,255,.03);
      position: relative;
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

    .tm-stat-chart-head-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
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
    }

    .tm-stat-chart-line {
      fill: none;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      filter: drop-shadow(0 0 6px rgba(255,255,255,.1));
    }

    .tm-stat-chart-line-bg {
      fill: none;
      stroke-width: 1.25;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: .28;
    }

    .tm-stat-chart-trend {
      fill: none;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: .85;
      stroke-dasharray: 5 4;
    }

    .tm-stat-chart-trend-ma {
      stroke-dasharray: 3 4;
    }

    .tm-stat-chart-point {
      stroke: #111;
      stroke-width: 1.5;
    }

    .tm-stat-chart-hover-line {
      stroke: rgba(255,255,255,.18);
      stroke-width: 1;
      stroke-dasharray: 4 4;
    }

    .tm-stat-chart-hover-zone {
      fill: transparent;
      cursor: crosshair;
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
    }

    .tm-stat-chart-legend-swatch {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      flex: 0 0 auto;
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
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  function saveSummarySectionState(data) {
    localStorage.setItem(STORAGE_KEY_SUMMARY_SECTIONS, JSON.stringify(data || {}));
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
    return duration === 30 ? 30 : duration === 7 ? 7 : 1;
  }

  function normalizeSummaryChartTrends(trends) {
    return {
      linear: !!trends?.linear,
      ma: !!trends?.ma
    };
  }

  function getSummaryChartPref(chartKey, visibleModes = []) {
    const allPrefs = loadSummaryChartPrefs();
    const pref = allPrefs?.[chartKey];
    const mode = visibleModes.includes(pref?.mode) ? pref.mode : (visibleModes[0] || '');
    const duration = normalizeSummaryChartDuration(pref?.duration);
    const trends = normalizeSummaryChartTrends(pref?.trends);
    return { mode, duration, trends };
  }

  function setSummaryChartPref(chartKey, pref) {
    if (!chartKey) return;

    const allPrefs = loadSummaryChartPrefs();
    allPrefs[chartKey] = {
      mode: String(pref?.mode || ''),
      duration: normalizeSummaryChartDuration(pref?.duration),
      trends: normalizeSummaryChartTrends(pref?.trends)
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

  function getGameIntersections(game) {
    const all = loadIntersectionsState();
    const key = getIntersectionStorageKey(game);
    const items = Array.isArray(all[key]) ? all[key] : [];
    const normalizedItems = items
      .filter(item => item && typeof item === 'object' && item.id && item.label)
      .map(item => {
        if (!Array.isArray(item.parts) || !item.parts.length) return item;

        const parts = normalizeIntersectionParts(item.parts);
        const urls = buildIntersectionUrls(parts);
        if (!urls.popularUrl || !urls.newPopularUrl) return item;

        return {
          ...item,
          id: buildIntersectionId(parts),
          label: parts.map(part => part.label).join(' + '),
          parts,
          popularUrl: urls.popularUrl,
          newPopularUrl: urls.newPopularUrl
        };
      });

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
    all[key] = Array.isArray(items) ? items : [];
    saveIntersectionsState(all);
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
    if (exactMatch) return type === 'platform' ? normalizePlatformLabel(exactMatch.label) : exactMatch.label;

    const slugToken = type === 'platform' && normalizedText === 'html5'
      ? 'html5'
      : `${type}-${slugifyLabel(text)}`;
    const tokenMatch = findLinkEntryByToken(type, slugToken, normalizedLinks);
    return tokenMatch?.label
      ? (type === 'platform' ? normalizePlatformLabel(tokenMatch.label) : tokenMatch.label)
      : (type === 'platform' ? normalizePlatformLabel(text) : text);
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
    const order = { genre: 0, platform: 1, tag: 2 };
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
      if (!part?.type || !labelKey || !href || seen.has(labelKey)) continue;
      seen.add(labelKey);
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
      tag: []
    };
    const seenByType = {
      genre: new Set(),
      platform: new Set(),
      tag: new Set()
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

  function buildSearchUrlForLabel(type, label) {
    const slug = slugifyLabel(label);

    if (type === 'main') {
      const seriesMatch = SEARCH_SERIES.find(item => normalize(item.label) === normalize(label));
      return buildSeriesUrl(seriesMatch?.key || 'popular', 'https://itch.io/games');
    }

    if (type === 'platform' && (normalize(label) === 'html5' || normalize(label) === 'web')) {
      return 'https://itch.io/games/platform-web';
    }

    if (type === 'platform' && normalize(label) === 'mobile web') {
      return 'https://itch.io/games/platform-mobile-web';
    }

    if (!slug) return '';
    return `https://itch.io/games/${type}-${slug}`;
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
      text.includes('security check') ||
      text.includes('проверки безопасности') ||
      text.includes('один момент')
    );
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

    const sectionLabels = {
      default: 'Общее',
      platforms: 'Платформа',
      genres: 'Жанр',
      tags: 'Тег',
      intersections: 'Пересечение'
    };
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
    const gameGenreLinks = Array.isArray(gameMeta?.genreLinks) ? gameMeta.genreLinks : [];
    const gamePlatformLinks = Array.isArray(gameMeta?.platformLinks) ? gameMeta.platformLinks : [];
    const gameTagLinks = Array.isArray(gameMeta?.tagLinks) ? gameMeta.tagLinks : [];

    const category = getSearchCategoryFromPath(location.pathname);

    const tags = [];
    const genres = [];
    const platforms = [];

    function addBySlug(value) {
      if (!value) return;
      if (isIgnoredSearchSegment(value)) return;

      const platformLabel = getKnownPlatformLabel(value);
      if (platformLabel) {
        platforms.push(platformLabel);
        return;
      }

      if (value.startsWith('tag-')) {
        tags.push(canonicalizeLabelWithLinks('tag', value.replace(/^tag-/, '').replaceAll('-', ' '), gameTagLinks));
        return;
      }

      if (value.startsWith('genre-')) {
        genres.push(canonicalizeLabelWithLinks('genre', value.replace(/^genre-/, '').replaceAll('-', ' '), gameGenreLinks));
        return;
      }

      if (value.startsWith('platform-')) {
        const tokenMatch = findLinkEntryByToken('platform', value, gamePlatformLinks);
        platforms.push(normalizePlatformLabel(tokenMatch?.label || value.replace(/^platform-/, '').replaceAll('-', ' ')));
        return;
      }

      const tokenMatch = findLinkEntryByToken('platform', value, gamePlatformLinks);
      if (tokenMatch?.label) platforms.push(normalizePlatformLabel(tokenMatch.label));
    }

    parts.forEach(addBySlug);

    for (const [key, value] of params.entries()) {
      addBySlug(key);
      addBySlug(value);
    }

    if (queueItemMatchesPage) {
      if (queueItem.section === 'platforms') platforms.push(queueItem.label);
      if (queueItem.section === 'genres') genres.push(queueItem.label);
      if (queueItem.section === 'tags') tags.push(queueItem.label);
      if (queueItem.section === 'intersections' && Array.isArray(queueItem.parts)) {
        queueItem.parts.forEach(part => {
          if (!part?.label) return;
          if (part.type === 'platform') platforms.push(normalizePlatformLabel(part.label));
          if (part.type === 'genre') genres.push(part.label);
          if (part.type === 'tag') tags.push(part.label);
        });
      }
    }

    return {
      category,
      tags: [...new Set(tags)],
      genres: [...new Set(genres)],
      platforms: [...new Set(platforms)],
      summaryLabel: queueItemMatchesPage ? queueItem.label : ''
    };
  }

  function getSearchLabelsFromRecord(record) {
    if (!record) return [];

    const labels = [];
    const recordCategory = getRecordCategory(record);

    if (recordCategory) labels.push(recordCategory);
    if (record.meta?.summaryLabel) labels.push(record.meta.summaryLabel);

    if (Array.isArray(record.meta?.tags)) {
      record.meta.tags
        .filter(tag => !isIgnoredMetaLabel(tag))
        .forEach(tag => labels.push(tag));
    }

    if (Array.isArray(record.meta?.genres)) {
      record.meta.genres.forEach(genre => labels.push(genre));
    }

    if (Array.isArray(record.meta?.platforms)) {
      record.meta.platforms.forEach(platform => labels.push(platform));
    }

    const rawTags = String(record.tags || '');
    const parts = String(record.path || '')
      .split('/')
      .filter(Boolean);

    if (!labels.length && recordCategory) {
      labels.push(recordCategory);
    }

    parts
      .filter(part => part.startsWith('tag-') || part.startsWith('genre-') || part.startsWith('platform-') || getKnownPlatformLabel(part))
      .map(part => getKnownPlatformLabel(part) || part.replace(/^(tag|genre|platform)-/, '').replaceAll('-', ' '))
      .filter(label => !isIgnoredMetaLabel(label))
      .forEach(label => labels.push(label));

    rawTags
      .split(/[\/|]/)
      .map(x => x.trim())
      .filter(Boolean)
      .filter(x => x !== 'без фильтров')
      .filter(x => !x.startsWith('sort:'))
      .map(x => getKnownPlatformLabel(x) || x.replace(/^(tag|genre|platform)-/, '').replaceAll('-', ' '))
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
    const tags = Array.isArray(meta.tags) ? meta.tags.filter(Boolean) : [];
    const genres = Array.isArray(meta.genres) ? meta.genres.filter(Boolean) : [];
    const platforms = Array.isArray(meta.platforms) ? meta.platforms.filter(Boolean) : [];

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

      if (platforms.some(item => normalize(item) === normalize(summaryLabel))) {
        return { section: 'platforms', label: summaryLabel, series };
      }

      if (genres.some(item => normalize(item) === normalize(summaryLabel))) {
        return { section: 'genres', label: summaryLabel, series };
      }

      if (tags.some(item => normalize(item) === normalize(summaryLabel))) {
        return { section: 'tags', label: summaryLabel, series };
      }
    }

    const pathParts = getSearchPathParts(record.path || '');
    const gameIndex = pathParts.indexOf('games');
    const filterParts = gameIndex >= 0
      ? pathParts.slice(gameIndex + 1).filter(part => part && !isKnownSeriesPathPart(part))
      : [];

    for (const part of filterParts) {
      if (part.startsWith('genre-')) {
        return {
          section: 'genres',
          label: genres[0] || part.replace(/^genre-/, '').replaceAll('-', ' '),
          series
        };
      }

      if (part.startsWith('tag-')) {
        return {
          section: 'tags',
          label: tags[0] || part.replace(/^tag-/, '').replaceAll('-', ' '),
          series
        };
      }

      const knownPlatform = getKnownPlatformLabel(part);
      if (part.startsWith('platform-') || knownPlatform) {
        return {
          section: 'platforms',
          label: platforms[0] || knownPlatform || normalizePlatformLabel(part.replace(/^platform-/, '').replaceAll('-', ' ')),
          series
        };
      }
    }

    if (genres[0]) return { section: 'genres', label: genres[0], series };
    if (platforms[0]) return { section: 'platforms', label: platforms[0], series };
    if (tags[0]) return { section: 'tags', label: tags[0], series };

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

    if (summaryUrl && focusTarget) {
      info.classList.add('tm-clickable');
      info.title = 'Открыть аналитику и перейти к записи';
      info.addEventListener('click', () => {
        setTransferredPendingSummaryWidget();
        setTransferredPendingSummaryFocus(focusTarget);
        location.href = summaryUrl;
      });
    }

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

  async function jumpToLastLoadedGame(game, status = null) {
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
        'Перехожу к последней загруженной игре...',
        `Пролистано игр: ${Math.min(rememberedIndex, cards.length)}`
      ]);
    }

    anchorCard.scrollIntoView({
      behavior: 'auto',
      block: 'end'
    });

    await wait(50);

    window.scrollBy({
      top: Math.max(SCROLL_STEP, Math.round(window.innerHeight * 0.9)),
      behavior: 'auto'
    });

    await wait(120);
    return true;
  }

  async function jumpToCurrentListTail(status = null) {
    const cards = getGameCards();
    const lastCard = cards[cards.length - 1];
    if (!lastCard) return false;

    if (status) {
      setSearchStatus(status, [
        'Быстро перехожу к концу загруженного списка...',
        `Пролистано игр: ${cards.length}`
      ]);
    }

    lastCard.scrollIntoView({
      behavior: 'auto',
      block: 'end'
    });

    await wait(20);

    window.scrollBy({
      top: Math.max(window.innerHeight, SCROLL_STEP),
      behavior: 'auto'
    });

    await wait(80);
    return true;
  }

  async function waitForSearchPageReady(status = null, timeoutMs = 90000) {
    if (!isGamesPage || isSearchPageReady()) return true;

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (status) {
        setSearchStatus(status, isCloudflareChallengePage()
          ? 'Жду завершения проверки Cloudflare...'
          : 'Жду полной загрузки списка игр...');
      }

      await sleep(500);
      if (isSearchPageReady()) return true;
    }

    return false;
  }

  async function waitForCloudflareChallengeToClear(status = null, timeoutMs = 180000) {
    if (!isCloudflareChallengePage()) return true;

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (status) {
        setSearchStatus(status, 'Cloudflare просит проверку. Не скроллю страницу и жду завершения challenge...');
      }

      await sleep(500);

      if (!isCloudflareChallengePage()) {
        await sleep(1200);
        return true;
      }
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

    searching = true;
    pausedByHiddenTab = false;

    button.textContent = 'Остановить';
    updateStatusScrolling();

    const pageReady = await waitForSearchPageReady(status);
    if (!pageReady) {
      searching = false;
      button.textContent = 'Найти и листать';
      status.textContent = 'Поиск остановлен: список игр не загрузился полностью.';
      return;
    }

    const initiallyFound = findGameByName(targetText);
    if (!initiallyFound) {
      await jumpToLastLoadedGame(targetGame, status);
    }

    let lastScrollY = -1;
    let lastScrollHeight = -1;
    let lastLoadedCount = -1;
    let lastKnownPage = Number(lastLoadedPage || 0);
    let stuckCount = 0;

    while (searching) {
      if (isCloudflareChallengePage()) {
        const challengeCleared = await waitForCloudflareChallengeToClear(status);

        if (!challengeCleared) {
          searching = false;
          button.textContent = 'Найти и листать';
          status.textContent = 'Поиск остановлен: Cloudflare слишком долго держит проверку.';
          return;
        }

        const pageReadyAfterChallenge = await waitForSearchPageReady(status);
        if (!pageReadyAfterChallenge) {
          searching = false;
          button.textContent = 'Найти и листать';
          status.textContent = 'Поиск остановлен: после Cloudflare список игр не загрузился.';
          return;
        }

        updateStatusScrolling();
        continue;
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
          removeRecordForContext(targetGame, getSearchContextKey());
          saveLimitReachedPosition(targetGame);
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

      await jumpToCurrentListTail(status);

      const afterY = window.scrollY;
      const afterHeight = document.body.scrollHeight;
      const afterLoaded = getLoadedGamesCount();
      const afterPage = Number(lastLoadedPage || 0);
      const changedDuringBurst =
        afterY !== beforeY ||
        afterHeight !== beforeHeight ||
        afterLoaded !== beforeLoaded ||
        afterPage !== beforePage;

      await sleep(SCROLL_INTERVAL);

      if (!searching) break;
      if (isCloudflareChallengePage()) continue;

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
          removeRecordForContext(targetGame, getSearchContextKey());
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
      const type = detectMetaType(row);
      if (!type) continue;

      [...row.querySelectorAll('a[href]')].forEach(link => {
        typedLinkSections.set(link, type);
      });
    }

    const links = [...panel.querySelectorAll('a[href]')];

    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const value = String(link.textContent || '').trim();
      if (!value) continue;
      const forcedType = typedLinkSections.get(link) || '';

      if (forcedType === 'genres' || (!forcedType && (href.includes('/games/genre-') || href.includes('genre-')))) {
        result.genres.push(value);
        result.genreLinks.push({ label: value, href: toAbsoluteItchUrl(href) });
      }
      if (forcedType === 'platforms' || (!forcedType && (href.includes('/games/platform-') || href.includes('platform-') || href.includes('/games/html5')))) {
        result.platforms.push(normalizePlatformLabel(value));
        result.platformLinks.push({ label: normalizePlatformLabel(value), href: toAbsoluteItchUrl(href) });
      }
      if (forcedType === 'tags' || (!forcedType && (href.includes('/games/tag-') || href.includes('tag-')))) {
        result.tags.push(value);
        result.tagLinks.push({ label: value, href: toAbsoluteItchUrl(href) });
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
      if (labelText.includes('genre')) return 'genres';
      if (labelText.includes('platform')) return 'platforms';
      if (labelText.includes('tag')) return 'tags';

      const fullText = normalize(row.textContent);
      if (fullText === 'content' || fullText.startsWith('content ')) return '';
      if (fullText.includes('genre')) return 'genres';
      if (fullText.includes('platform')) return 'platforms';
      if (fullText.includes('tag')) return 'tags';

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
        .replace(/^(genres?|platforms?|tags?)\s*:?\s*/i, '')
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
      const type = detectMetaType(row);
      if (!type) continue;
      result[type].push(...extractRowValues(row, type));
    }

    result.genres = normalizeLabelList(result.genres.filter(value => !isIgnoredMetaLabel(value)));
    result.platforms = normalizeLabelList(result.platforms.filter(value => !isIgnoredMetaLabel(value)));
    const sideMetaLabels = new Set([
      ...result.genres,
      ...result.platforms
    ].map(value => normalize(value)));
    result.tags = normalizeLabelList(result.tags
      .filter(value => !isIgnoredMetaLabel(value))
      .filter(value => !sideMetaLabels.has(normalize(value))));
    result.genreLinks = backfillMissingLinkEntries('genre', result.genres, result.genreLinks);
    result.platformLinks = backfillMissingLinkEntries('platform', result.platforms, result.platformLinks);
    result.tagLinks = backfillMissingLinkEntries('tag', result.tags, result.tagLinks);

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

    if (returnUrl && (meta.genres.length || meta.platforms.length || meta.tags.length)) {
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
    const tags = Array.isArray(record?.meta?.tags) ? record.meta.tags : [];
    const genres = Array.isArray(record?.meta?.genres) ? record.meta.genres : [];
    const platforms = Array.isArray(record?.meta?.platforms) ? record.meta.platforms : [];
    return !!(tags.length || genres.length || platforms.length);
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

    if (item.section === 'default') {
      return seriesRecords.filter(record => isDefaultSummaryRecord(record));
    }

    if (item.section === 'intersections') {
      const wanted = normalize(item.label);
      return seriesRecords.filter(record => normalize(record?.meta?.summaryLabel) === wanted);
    }

    return findRecordsForLabel(seriesRecords, item.label);
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
      const shouldShowLabel = !sparseLabels || index % sparseStep === 0 || index === count - 1;
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

  function buildNeighborSegmentsPath(points, getX, getY) {
    const coords = getChartCoordinates(points, getX, getY);
    if (coords.length < 2) return '';

    let path = `M${coords[0].x} ${coords[0].y}`;
    for (let index = 1; index < coords.length; index += 1) {
      path += ` L${coords[index].x} ${coords[index].y}`;
    }

    return path;
  }

  function buildSmoothBezierPath(points, getX, getY) {
    const coords = getChartCoordinates(points, getX, getY);
    if (coords.length < 2) return '';
    if (coords.length === 2) {
      return `M${coords[0].x} ${coords[0].y} L${coords[1].x} ${coords[1].y}`;
    }

    let path = `M${coords[0].x} ${coords[0].y}`;

    for (let index = 0; index < coords.length - 1; index += 1) {
      const p0 = coords[index - 1] || coords[index];
      const p1 = coords[index];
      const p2 = coords[index + 1];
      const p3 = coords[index + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return path;
  }

  function buildLinearTrendPath(points, getX, getY) {
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
    const startIndex = 0;
    const endIndex = Math.max(...points.map((_, index) => index));
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

  function buildTrendPaths(points, getX, getY, durationDays, trends) {
    const trendState = normalizeSummaryChartTrends(trends);
    const movingAverageWindow = durationDays === 1 ? 3 : 5;
    const result = [];

    if (trendState.linear) {
      const linearPath = buildLinearTrendPath(points, getX, getY);
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
        let path = `M${getX(movingAveragePoints[0].index)} ${getY(movingAveragePoints[0].value)}`;
        for (let index = 1; index < movingAveragePoints.length; index += 1) {
          const point = movingAveragePoints[index];
          path += ` L${getX(point.index)} ${getY(point.value)}`;
        }
        result.push({
          kind: 'ma',
          path
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
      palette = []
    } = options || {};

    return series.map((item, index) => {
      const color = item.color || palette[index % palette.length] || '#4A8CFF';
      const backgroundPath = buildNeighborSegmentsPath(item.points, getX, getY);
      const smoothPath = buildSmoothBezierPath(item.points, getX, getY);
      const trendPaths = showTrends ? buildTrendPaths(item.points, getX, getY, durationDays, trendState) : [];
      const circles = item.points.map((point, pointIndex) => {
        if (!point) return '';
        const title = `${item.label} • ${point.dayLabel} • #${point.value} • ${getSeriesLabel(point.series || 'popular')}`;
        return `
          <circle class="tm-stat-chart-point" cx="${getX(pointIndex)}" cy="${getY(point.value)}" r="3.5" fill="${color}">
            <title>${escapeHtml(title)}</title>
          </circle>
        `;
      }).join('');

      return `
        ${backgroundPath ? `<path class="tm-stat-chart-line-bg" d="${backgroundPath}" stroke="${color}"></path>` : ''}
        ${trendPaths.map(trend => `<path class="tm-stat-chart-trend ${trend.kind === 'ma' ? 'tm-stat-chart-trend-ma' : ''}" d="${trend.path}" stroke="${color}"></path>`).join('')}
        ${smoothPath ? `<path class="tm-stat-chart-line" d="${smoothPath}" stroke="${color}"></path>` : ''}
        ${circles}
      `;
    }).join('');
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
      return margin.top + ratio * plotHeight;
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

    const lineMarkup = buildSeriesChartMarkup(series, {
      getX,
      getY,
      durationDays: Math.max(1, days.length),
      palette
    });

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
          ${gridLines}
          <line class="tm-stat-chart-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
          ${lineMarkup}
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
        30: buildDuration(30)
      }
    };
  }

  function renderSectionChartSkeleton(chartKey, seriesKeys = ANALYTICS_SERIES.map(item => item.key)) {
    return `
      <div class="tm-stat-chart" data-chart-root="${escapeHtml(chartKey)}">
        <div class="tm-stat-chart-head">
          <div class="tm-stat-chart-head-top">
            <div class="tm-stat-chart-head-left">
              <div class="tm-stat-chart-toggle">
                ${seriesKeys.map((seriesKey, index) => `
                  <button class="tm-stat-chart-toggle-button ${index === 0 ? 'tm-active' : ''}" type="button" data-chart-mode="${escapeHtml(seriesKey)}">${escapeHtml(getSeriesLabel(seriesKey))}</button>
                `).join('')}
              </div>
            </div>
            <div class="tm-stat-chart-head-right">
              <div class="tm-stat-chart-toggle">
                ${[1, 7, 30].map((duration, index) => `
                  <button class="tm-stat-chart-toggle-button ${index === 0 ? 'tm-active' : ''}" type="button" data-chart-duration="${duration}">${duration}d</button>
                `).join('')}
              </div>
            </div>
          </div>
          <h1 class="tm-stat-chart-title"></h1>
        </div>
        <div class="tm-stat-chart-body"></div>
        <div class="tm-stat-chart-tooltip"></div>
      </div>
    `;
  }

  function renderSectionToggleChartInto(root, chartData, mode = 'popular', durationDays = 1) {
    if (!root) return;

    const chartKey = root.getAttribute('data-chart-root') || '';
    const body = root.querySelector('.tm-stat-chart-body');
    const title = root.querySelector('.tm-stat-chart-title');
    const tooltip = root.querySelector('.tm-stat-chart-tooltip');
    const durationLabel = `${durationDays}d`;
    const modeLabel = isKnownSeriesKey(mode) ? getSeriesLabel(mode) : 'Section not selected';
    const chartPref = getSummaryChartPref(chartKey, Object.keys(chartData?.durations?.[durationDays]?.modes || chartData?.durations?.[1]?.modes || {}));
    const trendState = normalizeSummaryChartTrends(chartPref.trends);
    const durationData = chartData?.durations?.[durationDays] || chartData?.durations?.[1] || null;
    const days = Array.isArray(durationData?.days) ? durationData.days : [];
    const series = Array.isArray(durationData?.modes?.[mode]) ? durationData.modes[mode] : [];

    if (!body) return;
    if (title) title.textContent = `${modeLabel} / ${durationLabel}`;

    if (!days.length || !series.length) {
      body.innerHTML = `<div class="tm-stat-muted">No data for the last ${durationLabel}.</div>`;
      if (tooltip) {
        tooltip.classList.remove('tm-visible');
        tooltip.innerHTML = '';
      }
      return;
    }

    const width = 580;
    const height = 180;
    const margin = { top: 8, right: 12, bottom: 28, left: 44 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
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
    const getY = value => margin.top + ((value - minValue) / (maxValue - minValue)) * plotHeight;
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

    const lineMarkup = buildSeriesChartMarkup(series, {
      getX,
      getY,
      durationDays,
      showTrends: true,
      trendState
    });

    const hoverZones = days.map((day, index) => {
      const prevX = index === 0 ? margin.left : (getX(index - 1) + getX(index)) / 2;
      const nextX = index === days.length - 1 ? width - margin.right : (getX(index) + getX(index + 1)) / 2;
      return `<rect class="tm-stat-chart-hover-zone" data-chart-day-index="${index}" x="${prevX}" y="${margin.top}" width="${Math.max(1, nextX - prevX)}" height="${plotHeight}"></rect>`;
    }).join('');

    const legendMarkup = series.map(item => `
      <div class="tm-stat-chart-legend-item" title="${escapeHtml(item.label)}">
        <span class="tm-stat-chart-legend-swatch" style="background:${item.color}"></span>
        <span class="tm-stat-chart-legend-label">${escapeHtml(item.label)}</span>
      </div>
    `).join('');
    const trendControlsMarkup = `
      <label class="tm-stat-chart-trend-control">
        <input type="checkbox" data-chart-trend="linear" ${trendState.linear ? 'checked' : ''}>
        <span>Trend: Linear</span>
      </label>
      <label class="tm-stat-chart-trend-control">
        <input type="checkbox" data-chart-trend="ma" ${trendState.ma ? 'checked' : ''}>
        <span>Trend: MA</span>
      </label>
    `;

    body.innerHTML = `
      <svg class="tm-stat-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${modeLabel} ${durationLabel} current ranks chart`)}">
        ${gridLines}
        <line class="tm-stat-chart-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
        ${lineMarkup}
        <line class="tm-stat-chart-hover-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" visibility="hidden"></line>
        ${hoverZones}
        ${dayLabels}
      </svg>
      <div class="tm-stat-chart-legend">${legendMarkup}${trendControlsMarkup}</div>
    `;

    const svg = body.querySelector('.tm-stat-chart-svg');
    const hoverLine = body.querySelector('.tm-stat-chart-hover-line');

    function hideTooltip() {
      if (tooltip) {
        tooltip.classList.remove('tm-visible');
        tooltip.innerHTML = '';
      }
      if (hoverLine) hoverLine.setAttribute('visibility', 'hidden');
    }

    body.querySelectorAll('[data-chart-day-index]').forEach(zone => {
      zone.addEventListener('mouseenter', () => {
        const index = Number(zone.getAttribute('data-chart-day-index'));
        const x = getX(index);
        const day = days[index];
        const rows = series.map(item => ({
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
            <div class="tm-stat-chart-tooltip-row">
              <span class="tm-stat-chart-tooltip-dot" style="background:${row.color}"></span>
              <span class="tm-stat-chart-tooltip-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
              <span class="tm-stat-chart-tooltip-value">${row.point ? `#${row.point.value}` : '--'}</span>
            </div>
          `).join('')}
        `;

        const rect = root.getBoundingClientRect();
        const plotX = (x / width) * rect.width;
        tooltip.style.left = `${Math.min(Math.max(plotX + 12, 8), Math.max(8, rect.width - 228))}px`;
        tooltip.style.top = `44px`;
        tooltip.classList.add('tm-visible');
      });

      zone.addEventListener('mouseleave', hideTooltip);
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
          trends: nextTrends
        });
        renderSectionToggleChartInto(root, chartData, mode, durationDays);
      });
    });

    body.addEventListener('mouseleave', hideTooltip);
  }

  function sortRefreshItems(items, records) {
    function getPriority(item) {
      const hasRecords = getQueueItemRecords(records, item).length > 0;

      if (item.section === 'default' && hasRecords) return 100;
      if (item.section === 'default') return 10;
      if (item.section === 'intersections') return 0;
      if (item.section === 'platforms') return 1;
      if (item.section === 'genres') return 2;
      if (item.section === 'tags') return 3;
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
    const metaGenres = Array.isArray(meta?.genres) ? meta.genres : [];
    const metaPlatforms = Array.isArray(meta?.platforms) ? meta.platforms : [];
    const metaTags = Array.isArray(meta?.tags) ? meta.tags : [];
    const metaGenreLinks = Array.isArray(meta?.genreLinks) ? meta.genreLinks : [];
    const metaPlatformLinks = Array.isArray(meta?.platformLinks) ? meta.platformLinks : [];
    const metaTagLinks = Array.isArray(meta?.tagLinks) ? meta.tagLinks : [];

    const recordGenres = records.flatMap(record => {
      return Array.isArray(record.meta?.genres)
        ? record.meta.genres.map(label => canonicalizeLabelWithLinks('genre', label, metaGenreLinks))
        : [];
    });

    const recordPlatforms = records.flatMap(record => {
      return Array.isArray(record.meta?.platforms)
        ? record.meta.platforms.map(label => canonicalizeLabelWithLinks('platform', label, metaPlatformLinks))
        : [];
    });
    const recordContextPlatforms = records.flatMap(record => {
      return getPlatformLabelsFromRecordContext(record)
        .map(label => canonicalizeLabelWithLinks('platform', label, metaPlatformLinks));
    });

    const recordTags = records.flatMap(record => {
      return Array.isArray(record.meta?.tags)
        ? record.meta.tags.map(label => canonicalizeLabelWithLinks('tag', label, metaTagLinks))
        : [];
    });

    const allRecordLabels = records.flatMap(record => getSearchLabelsFromRecord(record));

    const genreLabels = normalizeLabelList([
      metaGenres.map(label => canonicalizeLabelWithLinks('genre', label, metaGenreLinks)),
      recordGenres
    ]);

    const platformLabels = normalizeLabelList([
      metaPlatforms.map(label => canonicalizeLabelWithLinks('platform', label, metaPlatformLinks)),
      recordPlatforms,
      recordContextPlatforms
    ]);
    if (platformLabels.some(label => normalize(label) === 'web') && !platformLabels.some(label => normalize(label) === 'mobile web')) {
      platformLabels.push('Mobile Web');
    }

    const knownSideLabels = new Set([
      ...mainLabels,
      ...genreLabels,
      ...platformLabels
    ].map(x => normalize(x)));

    const canonicalMetaTags = normalizeLabelList(
      metaTags.map(label => canonicalizeLabelWithLinks('tag', label, metaTagLinks))
    );
    const canonicalMetaTagSet = new Set(canonicalMetaTags.map(label => normalize(label)));

    const searchTagLabels = allRecordLabels
      .filter(label => !knownSideLabels.has(normalize(label)))
      .map(label => canonicalizeLabelWithLinks('tag', label, metaTagLinks));

    const tagSources = canonicalMetaTags.length
      ? [
        canonicalMetaTags,
        recordTags.filter(label => canonicalMetaTagSet.has(normalize(label))),
        searchTagLabels.filter(label => canonicalMetaTagSet.has(normalize(label)))
      ]
      : [
        canonicalMetaTags,
        recordTags,
        searchTagLabels
      ];

    const tagLabels = normalizeLabelList(tagSources)
      .filter(label => !isIgnoredMetaLabel(label))
      .filter(label => !knownSideLabels.has(normalize(label)));

    const metaUrl = meta?.url || '';
    const publicBaseUrl = game?.href || metaUrl;

    const genreLinks = buildFilterLinkEntries('genre', genreLabels, metaGenreLinks);
    const platformLinks = buildFilterLinkEntries('platform', platformLabels, metaPlatformLinks);
    const tagLinks = buildFilterLinkEntries('tag', tagLabels, metaTagLinks);

    return {
      possibleKeys,
      entry,
      meta,
      records,
      mainLabels,
      genreLabels,
      platformLabels,
      tagLabels,
      publicBaseUrl,
      genreLinks,
      platformLinks,
      tagLinks,
      intersections: getGameIntersections(game)
    };
  }

  function buildRefreshQueue(game) {
    const data = getSummaryData(game);
    const enabledSeries = getEnabledSummarySeries();
    const items = dedupeRefreshItems([
      ...enabledSeries.map(series => ({
        section: 'default',
        label: 'Default',
        series,
        url: buildSeriesUrl(series, 'https://itch.io/games')
      })),
      ...data.platformLinks.flatMap(item => enabledSeries.map(series => ({
        section: 'platforms',
        label: item.label,
        series,
        url: buildSeriesUrl(series, item.href)
      }))),
      ...data.genreLinks.flatMap(item => enabledSeries.map(series => ({
        section: 'genres',
        label: item.label,
        series,
        url: buildSeriesUrl(series, item.href)
      }))),
      ...data.tagLinks.flatMap(item => enabledSeries.map(series => ({
        section: 'tags',
        label: item.label,
        series,
        url: buildSeriesUrl(series, item.href)
      }))),
      ...data.intersections.flatMap(item => enabledSeries.map(series => ({
        section: 'intersections',
        label: item.label,
        series,
        url: buildSeriesUrl(series, item.popularUrl),
        parts: item.parts
      })))
    ]);

    const missingItems = items.filter(item => !getQueueItemRecords(data.records, item).length);
    if (missingItems.length) {
      return sortRefreshItems(missingItems, data.records);
    }

    return sortRefreshItems(items, data.records);
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
    const {
      possibleKeys,
      records,
      genreLabels,
      platformLabels,
      tagLabels,
      publicBaseUrl,
      genreLinks,
      platformLinks,
      tagLinks,
      intersections
    } = getSummaryData(game);
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

      reminder.querySelector('.tm-summary-reminder-close')?.addEventListener('click', removeReminder);
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

    const selectableOptions = [
      ...createFilterOptions('platform', platformLabels, platformLinks),
      ...createFilterOptions('genre', genreLabels, genreLinks),
      ...createFilterOptions('tag', tagLabels, tagLinks)
    ];
    const platformHrefByLabel = new Map(platformLinks.map(item => [normalize(item.label), item.href]));
    const genreHrefByLabel = new Map(genreLinks.map(item => [normalize(item.label), item.href]));
    const tagHrefByLabel = new Map(tagLinks.map(item => [normalize(item.label), item.href]));
    const intersectionHrefByLabel = new Map(intersections.map(item => [normalize(item.label), item.popularUrl]));

    function getSummaryBaseHref(section, label) {
      const key = normalize(label);
      if (section === 'default') return 'https://itch.io/games';
      if (section === 'platforms') return platformHrefByLabel.get(key) || buildSearchUrlForLabel('platform', label);
      if (section === 'genres') return genreHrefByLabel.get(key) || buildSearchUrlForLabel('genre', label);
      if (section === 'tags') return tagHrefByLabel.get(key) || buildSearchUrlForLabel('tag', label);
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

    function buildSeriesHeaderCells() {
      return visibleSeries.map(seriesKey => `
        <th class="tm-stat-series-cell">${escapeHtml(getSeriesLabel(seriesKey))} now</th>
        <th class="tm-stat-series-cell">${escapeHtml(getSeriesLabel(seriesKey))} best</th>
      `).join('');
    }

    function buildSeriesValueCells(row) {
      return visibleSeries.map(seriesKey => {
        const stats = row.seriesStats?.[seriesKey] || {};
        return `
          <td class="tm-stat-series-cell" data-summary-series-current="${escapeHtml(seriesKey)}">${renderStatCell(stats.current, { current: true, bestRecord: stats.best, href: stats.href })}</td>
          <td class="tm-stat-series-cell" data-summary-series-best="${escapeHtml(seriesKey)}">${renderBestStatCell(stats.best)}</td>
        `;
      }).join('');
    }

    function buildTableRows(rows, options = {}) {
      if (!rows.length) {
        return `
          <tr>
            ${options.selectable ? '<td class="tm-stat-select-col"></td>' : '<td class="tm-stat-select-col tm-stat-placeholder-cell"></td>'}
            <td>&#8212;</td>
            ${visibleSeries.map(() => '<td class="tm-stat-series-cell">&#8212;</td><td class="tm-stat-series-cell">&#8212;</td>').join('')}
            ${options.allowDelete ? '<td class="tm-stat-action-col"></td>' : '<td class="tm-stat-action-col tm-stat-placeholder-cell"></td>'}
          </tr>
        `;
      }

      return rows.map(row => {
        const selectKey = options.getSelectKey ? options.getSelectKey(row) : '';
        const selectType = selectKey.split('|')[0] || '';
        const inputType = options.singleSelect ? 'radio' : 'checkbox';
        const inputName = options.singleSelect ? `tm-select-${selectType}` : '';
        const selectCell = options.selectable ? `
          <td class="tm-stat-select-col">
            <input class="tm-stat-checkbox" type="${inputType}" ${inputName ? `name="${escapeHtml(inputName)}"` : ''} data-select-key="${escapeHtml(selectKey)}" data-select-type="${escapeHtml(selectType)}">
          </td>
        ` : '<td class="tm-stat-select-col tm-stat-placeholder-cell"></td>';

        const actionCell = options.allowDelete ? `
          <td class="tm-stat-action-col">
            <button class="tm-remove-intersection" data-remove-intersection="${escapeHtml(row.id)}" title="Удалить">×</button>
          </td>
        ` : '<td class="tm-stat-action-col tm-stat-placeholder-cell"></td>';

        return `
          <tr data-summary-row-section="${escapeHtml(row.section || options.sectionKey || '')}" data-summary-row-label="${escapeHtml(normalize(row.label))}">
            ${selectCell}
            <td><div class="tm-stat-name-cell"><span>${escapeHtml(row.label)}</span></div></td>
            ${buildSeriesValueCells(row)}
            ${actionCell}
          </tr>
        `;
      }).join('');
    }

    function sectionHtml(key, title, rows, options = {}) {
      const collapsed = !!sectionState[key];
      const chartHtml = renderSectionChartSkeleton(options.chartKey || key, visibleSeries);
      const emptySeriesNote = visibleSeries.length
        ? ''
        : `<div class="tm-stat-muted">Включите хотя бы один раздел выше, чтобы видеть аналитику и запускать обновление.</div>`;

      return `
        <section class="tm-stat-section" data-summary-section="${escapeHtml(key)}">
          <div class="tm-stat-section-title" data-section-toggle="${escapeHtml(key)}">
            <span>${escapeHtml(title)}</span>
            <span class="tm-stat-section-toggle">${collapsed ? '+' : '-'}</span>
          </div>
          <div class="tm-stat-section-body ${collapsed ? 'tm-hidden' : ''}">
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
                  ${buildTableRows(rows, options)}
                </tbody>
              </table>
            </div>
            ${emptySeriesNote}
            ${chartHtml}
          </div>
        </section>
      `;
    }

    const defaultRows = [buildRow('Top', 'default')];
    const platformRows = buildRows(platformLabels, 'platforms');
    const genreRows = buildRows(genreLabels, 'genres');
    const tagRows = buildRows(tagLabels, 'tags');
    const intersectionRows = intersections.map(item => buildRow(item.label, 'intersections', {
      id: item.id || ''
    }));

    const chartDataByKey = {
      default: getSectionToggleChartData(records, 'default', defaultRows.map(row => row.label)),
      platforms: getSectionToggleChartData(records, 'platforms', platformRows.map(row => row.label)),
      genres: getSectionToggleChartData(records, 'genres', genreRows.map(row => row.label)),
      tags: getSectionToggleChartData(records, 'tags', tagRows.map(row => row.label)),
      intersections: getSectionToggleChartData(records, 'intersections', intersectionRows.map(row => row.label))
    };

    const seriesToggleHtml = ANALYTICS_SERIES.map(item => `
      <label class="tm-series-toggle">
        <input class="tm-series-toggle-input" type="checkbox" data-summary-series="${escapeHtml(item.key)}" ${seriesState[item.key] ? 'checked' : ''}>
        <span class="tm-series-toggle-label">${escapeHtml(item.label)}</span>
      </label>
    `).join('');

    widget.innerHTML = `
      <div class="tm-widget-head">
        <div class="tm-widget-title">Summary Stats</div>
        <button class="tm-widget-collapse" id="tm-summary-collapse" type="button" title="Свернуть">-</button>
      </div>
      <div class="tm-summary-root-body tm-widget-scroll-body">
        <div class="tm-series-toolbar">
          <div class="tm-series-toolbar-title">Разделы аналитики и обновления</div>
          <div class="tm-series-toggle-row">
            ${seriesToggleHtml}
          </div>
          <div class="tm-stat-muted">Обновление проходит только по включённым разделам.</div>
        </div>

        ${sectionHtml('default', 'Общее', defaultRows)}
        ${sectionHtml('platforms', 'Платформы', platformRows, {
          selectable: true,
          singleSelect: true,
          getSelectKey: row => `platform|${normalize(row.label)}`
        })}
        ${sectionHtml('genres', 'Жанры', genreRows, {
          selectable: true,
          singleSelect: true,
          getSelectKey: row => `genre|${normalize(row.label)}`
        })}
        ${sectionHtml('tags', 'Теги', tagRows, {
          selectable: true,
          getSelectKey: row => `tag|${normalize(row.label)}`
        })}
        ${sectionHtml('intersections', 'Пересечения', intersectionRows, {
          allowDelete: true
        })}

        <button class="tm-small-button tm-secondary-button tm-intersections-action" id="tm-build-intersection">
          Собрать пересечение
        </button>

        ${!records.length ? `
          <div class="tm-stat-muted">
            Для этой игры пока нет сохранённых позиций.
          </div>
        ` : ''}

        <div class="tm-action-row">
          ${publicGameUrl ? `
            <button class="tm-small-button tm-secondary-button" id="tm-fetch-game-tags">
              Получить теги
            </button>
          ` : `
            <button class="tm-small-button tm-secondary-button" disabled>
              Нет ссылки
            </button>
          `}

          <button class="tm-small-button tm-clear-button" id="tm-clear-this-game-stats">
            Очистить
          </button>
        </div>

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

      root.querySelectorAll('[data-chart-mode]').forEach(button => {
        const buttonMode = button.getAttribute('data-chart-mode') || '';
        button.classList.toggle('tm-active', buttonMode === currentMode);
      });
      root.querySelectorAll('[data-chart-duration]').forEach(button => {
        const buttonDuration = Number(button.getAttribute('data-chart-duration')) || 1;
        button.classList.toggle('tm-active', buttonDuration === currentDuration);
      });

      renderSectionToggleChartInto(root, chartData, currentMode, currentDuration);

      root.querySelectorAll('[data-chart-mode]').forEach(button => {
        button.addEventListener('click', () => {
          const nextMode = button.getAttribute('data-chart-mode') || currentMode;
          currentMode = nextMode;
          setSummaryChartPref(chartKey, {
            mode: currentMode,
            duration: currentDuration,
            trends: getSummaryChartPref(chartKey, visibleSeries).trends
          });
          root.querySelectorAll('[data-chart-mode]').forEach(other => {
            other.classList.toggle('tm-active', other === button);
          });
          renderSectionToggleChartInto(root, chartData, currentMode, currentDuration);
        });
      });

      root.querySelectorAll('[data-chart-duration]').forEach(button => {
        button.addEventListener('click', () => {
          const nextDuration = Number(button.getAttribute('data-chart-duration')) || currentDuration;
          currentDuration = nextDuration;
          setSummaryChartPref(chartKey, {
            mode: currentMode,
            duration: currentDuration,
            trends: getSummaryChartPref(chartKey, visibleSeries).trends
          });
          root.querySelectorAll('[data-chart-duration]').forEach(other => {
            other.classList.toggle('tm-active', other === button);
          });
          renderSectionToggleChartInto(root, chartData, currentMode, currentDuration);
        });
      });
    });

    function setSectionCollapsed(body, collapsed) {
      if (!body) return;

      if (collapsed) {
        body.style.maxHeight = `${body.scrollHeight}px`;
        body.offsetHeight;
        body.classList.add('tm-hidden');
        body.style.maxHeight = '0px';
        return;
      }

      body.classList.remove('tm-hidden');
      body.style.maxHeight = '0px';
      body.offsetHeight;
        body.style.maxHeight = `${body.scrollHeight}px`;
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

      const section = widget.querySelector(`[data-summary-section="${CSS.escape(sectionKey)}"]`);
      const sectionBody = section?.querySelector('.tm-stat-section-body');
      const sectionToggle = section?.querySelector('[data-section-toggle]');
      const sectionIcon = sectionToggle?.querySelector('.tm-stat-section-toggle');

      if (sectionBody?.classList.contains('tm-hidden')) {
        const state = loadSummarySectionState();
        state[sectionKey] = false;
        saveSummarySectionState(state);
        setSectionCollapsed(sectionBody, false);
        if (sectionIcon) sectionIcon.textContent = '-';
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

    widget.querySelectorAll('.tm-stat-section-body').forEach(body => {
      body.style.maxHeight = body.classList.contains('tm-hidden')
        ? '0px'
        : `${body.scrollHeight}px`;

      body.addEventListener('transitionend', event => {
        if (event.propertyName !== 'max-height') return;
        body.style.maxHeight = body.classList.contains('tm-hidden')
          ? '0px'
          : 'none';
      });
    });

    widget.querySelectorAll('[data-section-toggle]').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const key = toggle.getAttribute('data-section-toggle');
        const body = toggle.nextElementSibling;
        const icon = toggle.querySelector('.tm-stat-section-toggle');
        const state = loadSummarySectionState();
        const isCollapsed = body ? body.classList.contains('tm-hidden') : !!state[key];
        const nextCollapsed = !isCollapsed;

        state[key] = nextCollapsed;
        saveSummarySectionState(state);

        if (body) setSectionCollapsed(body, nextCollapsed);
        if (icon) icon.textContent = nextCollapsed ? '+' : '-';
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

    const buildIntersectionButton = widget.querySelector('#tm-build-intersection');
    if (buildIntersectionButton) {
      buildIntersectionButton.addEventListener('click', () => {
        const parts = normalizeIntersectionParts(selectableOptions.filter(item => selected.has(`${item.type}|${normalize(item.label)}`)));
        if (!parts.length) return;

        const id = buildIntersectionId(parts);
        const urls = buildIntersectionUrls(parts);
        if (!urls.popularUrl || !urls.newPopularUrl) return;

        const item = {
          id,
          label: parts.map(part => part.label).join(' + '),
          parts,
          popularUrl: urls.popularUrl,
          newPopularUrl: urls.newPopularUrl
        };

        const nextItems = [...intersections];
        const existingIndex = nextItems.findIndex(entry => entry.id === id);
        if (existingIndex >= 0) nextItems[existingIndex] = item;
        else nextItems.push(item);

        saveGameIntersections(game, nextItems);
        createSummaryStatsWidget();
      });
    }

    const fetchTagsButton = widget.querySelector('#tm-fetch-game-tags');
    if (fetchTagsButton && publicGameUrl) {
      fetchTagsButton.addEventListener('click', () => {
        location.href = publicGameUrl;
      });
    }

    const refreshButton = widget.querySelector('#tm-refresh-game-stats');
    if (refreshButton && game) {
      refreshButton.addEventListener('click', () => {
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
          const status = widget.querySelector('#tm-summary-refresh-status');
          if (status) status.textContent = 'Нет включённых разделов для обновления.';
          return;
        }

        saveRefreshState(refreshState);
        location.href = refreshState.queue[0].url;
      });
    }

    const clearButton = widget.querySelector('#tm-clear-this-game-stats');
    clearButton.addEventListener('click', () => {
      if (!confirm('Очистить сохранённую статистику для этой игры?')) return;

      const all = loadPositions();

      for (const key of possibleKeys) {
        delete all[key];
      }

      savePositions(all);
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
    safeInit('summary stats', createSummaryStatsWidget);
  }

  maybeResumeRefreshFlow().catch(error => {
    console.error('[itch.io stats] refresh resume failed:', error);
  });
})();
