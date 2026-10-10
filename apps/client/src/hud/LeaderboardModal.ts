import { leaderboardService, type LeaderboardResponse } from '../core/LeaderboardService.js';
import type { LeaderboardEntry } from '@echo-drift/shared';

export class LeaderboardModal {
  private modalEl: HTMLElement;
  private listEl: HTMLElement;
  private tabBestBtn: HTMLElement;
  private tabWorstBtn: HTMLElement;
  private refreshBtn: HTMLElement;
  private closeBtn: HTMLElement;
  private totalCountEl: HTMLElement;
  private currentOrder: 'desc' | 'asc' = 'desc';
  private currentHighlightRunId: string | null = null;
  private isLoading = false;

  constructor() {
    this.modalEl = document.getElementById('leaderboard-modal')!;
    this.listEl = document.getElementById('leaderboard-list')!;
    this.tabBestBtn = document.getElementById('tab-sort-best')!;
    this.tabWorstBtn = document.getElementById('tab-sort-worst')!;
    this.refreshBtn = document.getElementById('btn-leaderboard-refresh')!;
    this.closeBtn = document.getElementById('btn-leaderboard-close')!;
    this.totalCountEl = document.getElementById('leaderboard-total-count')!;

    this.bindEvents();
  }

  private bindEvents() {
    this.tabBestBtn?.addEventListener('click', () => {
      if (this.currentOrder === 'desc') return;
      this.currentOrder = 'desc';
      this.updateTabStyles();
      this.loadData();
    });

    this.tabWorstBtn?.addEventListener('click', () => {
      if (this.currentOrder === 'asc') return;
      this.currentOrder = 'asc';
      this.updateTabStyles();
      this.loadData();
    });

    this.refreshBtn?.addEventListener('click', () => {
      this.loadData();
    });

    this.closeBtn?.addEventListener('click', () => {
      this.close();
    });

    // Close on backdrop click
    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.close();
      }
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  private updateTabStyles() {
    if (this.currentOrder === 'desc') {
      this.tabBestBtn?.classList.add('active');
      this.tabWorstBtn?.classList.remove('active');
    } else {
      this.tabBestBtn?.classList.remove('active');
      this.tabWorstBtn?.classList.add('active');
    }
  }

  public isOpen(): boolean {
    return this.modalEl.classList.contains('active');
  }

  public open(highlightRunId?: string) {
    this.currentHighlightRunId = highlightRunId || null;
    this.modalEl.classList.remove('hidden');
    this.modalEl.classList.add('active');
    this.updateTabStyles();
    this.loadData();
  }

  public close() {
    this.modalEl.classList.add('hidden');
    this.modalEl.classList.remove('active');
  }

  private async loadData() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.listEl.innerHTML = `
      <div class="leaderboard-loading">
        <div class="loading-spinner"></div>
        <span>QUERYING GLOBAL MAINFRAME...</span>
      </div>
    `;

    const data = await leaderboardService.getLeaderboard(this.currentOrder, 50);
    this.isLoading = false;

    if (!data || !data.entries) {
      this.listEl.innerHTML = `
        <div class="leaderboard-empty">
          <span class="empty-icon">⚠️</span>
          <p>MAINFRAME DISCONNECTED</p>
          <span class="empty-desc">Could not synchronize global pilot records. Make sure the server is online.</span>
        </div>
      `;
      return;
    }

    this.renderEntries(data);
  }

  private renderEntries(data: LeaderboardResponse) {
    if (this.totalCountEl) {
      this.totalCountEl.innerText = `${data.total} PILOTS LOGGED`;
    }

    if (data.entries.length === 0) {
      this.listEl.innerHTML = `
        <div class="leaderboard-empty">
          <span class="empty-icon">🌌</span>
          <p>NO FLIGHT RECORDS YET</p>
          <span class="empty-desc">Be the first pilot to enter the tunnel and set a record!</span>
        </div>
      `;
      return;
    }

    const currentUserId = leaderboardService.getUserId();
    const isWorstFirst = this.currentOrder === 'asc';

    let html = '';
    data.entries.forEach((entry: LeaderboardEntry) => {
      const isSelf = entry.userId === currentUserId;
      const isHighlighted = this.currentHighlightRunId === entry.id;

      // Rank styling
      let rankBadge = `#${entry.rank}`;
      let rankClass = 'rank-badge';

      if (!isWorstFirst) {
        if (entry.rank === 1) {
          rankBadge = '👑 1';
          rankClass += ' rank-gold';
        } else if (entry.rank === 2) {
          rankBadge = '🥈 2';
          rankClass += ' rank-silver';
        } else if (entry.rank === 3) {
          rankBadge = '🥉 3';
          rankClass += ' rank-bronze';
        }
      } else {
        rankClass += ' rank-reversed';
      }

      // Format time
      const sec = Math.floor(entry.durationMs / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      const timeFormatted = `${mm}:${ss}`;

      // Format date
      let dateFormatted = 'RECENT';
      try {
        const d = new Date(entry.createdAt);
        dateFormatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      } catch {
        // ignore
      }

      const rowClasses = [
        'leaderboard-row',
        isSelf ? 'is-self' : '',
        isHighlighted ? 'is-highlighted' : ''
      ].filter(Boolean).join(' ');

      html += `
        <div class="${rowClasses}">
          <div class="col-rank">
            <span class="${rankClass}">${rankBadge}</span>
          </div>
          <div class="col-pilot">
            <span class="pilot-name">${this.escapeHtml(entry.displayName || 'PILOT')}</span>
            ${isSelf ? '<span class="you-badge">YOU</span>' : ''}
          </div>
          <div class="col-score">
            <span class="score-val">${Math.floor(entry.score).toLocaleString()}</span>
            <span class="score-sub">${entry.distance.toFixed(0)}m</span>
          </div>
          <div class="col-combat">
            <span class="combat-stat kills" title="Enemies Destroyed">✦ ${entry.enemiesDestroyed ?? 0}</span>
            <span class="combat-stat dodges" title="Red Balls Dodged">⚡ ${entry.dodgesCount ?? 0}</span>
          </div>
          <div class="col-time">
            <span class="time-val">${timeFormatted}</span>
            <span class="date-val">${dateFormatted}</span>
          </div>
        </div>
      `;
    });

    this.listEl.innerHTML = html;
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
