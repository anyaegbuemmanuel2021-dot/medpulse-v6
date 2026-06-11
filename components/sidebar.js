// components/sidebar.js — Desktop sidebar renderer
// MedPulse v3

import { db } from '../firebase.js';
import { avatarUrl, CLOUDINARY_CONFIG } from '../cloudinary.js';
import {
  collection, query, orderBy, limit, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function renderSidebar(profile, navigateTo, onLogout) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const photoSrc = profile?.avatarPublicId
    ? avatarUrl(profile.avatarPublicId, 80)
    : profile?.photoURL
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.displayName||'Guest')}&background=00d4ff&color=000&bold=true`;

  const navItems = [
    {
      view: 'feed-view', label: 'Feed',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`
    },
    {
      view: 'search-view', label: 'Discover',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`
    },
    {
      view: 'upload-view', label: 'Share Case',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`
    },
    {
      view: 'messages-view', label: 'Messages',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
    },
    {
      view: 'notifications-view', label: 'Notifications',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`
    },
    {
      view: 'profile-view', label: 'Profile',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
    },
  ];

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <svg viewBox="0 0 28 28" width="26" height="26">
        <rect width="28" height="28" rx="7" fill="#00d4ff" opacity="0.18"/>
        <path d="M14 6v16M6 14h16" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      MedPulse
    </div>

    ${profile ? `
    <div class="sidebar-user">
      <img src="${photoSrc}" class="avatar avatar-sm" alt="${profile.displayName||''}" id="sb-avatar"/>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${profile.displayName || 'Clinician'}</div>
        <div class="sidebar-user-spec">${profile.specialty || 'Healthcare Professional'}</div>
      </div>
    </div>` : `
    <div class="sidebar-user" id="sb-signin-prompt" style="cursor:pointer;justify-content:center;gap:8px;color:var(--accent);font-size:0.85rem;font-weight:600">
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h14M10 4l6 6-6 6"/></svg>
      Sign In to your account
    </div>`}

    <div class="sidebar-section" style="margin-top:8px">
      <div class="sidebar-nav" id="sidebar-nav">
        ${navItems.map(item => `
          <button class="sidebar-nav-btn" data-view="${item.view}">
            ${item.icon}
            ${item.label}
            ${item.view === 'notifications-view' ? `<span class="sidebar-notif-dot hidden" id="sb-notif-dot" style="margin-left:auto;width:7px;height:7px;background:var(--red);border-radius:50%;"></span>` : ''}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="sidebar-section" style="margin-top:16px">
      <div class="sidebar-section-label">Trending Tags</div>
      <div class="sidebar-trending" id="sb-trending">
        <div style="padding:8px 10px;color:var(--text-4);font-size:0.78rem">Loading...</div>
      </div>
    </div>

    <div class="sidebar-spacer"></div>

    ${profile ? `
    <div style="padding:0 10px 10px;">
      <button class="sidebar-nav-btn" id="sb-logout-btn" style="width:100%;color:var(--red);opacity:0.8">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign Out
      </button>
    </div>` : ''}

    <div class="sidebar-footer">
      MedPulse v3 &middot; <a href="#">Privacy</a> &middot; <a href="#">Terms</a><br/>
      Powered by Firebase &amp; Cloudinary CDN
    </div>`;

  // Nav click events
  sidebar.querySelectorAll('.sidebar-nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.dataset.view;
      if (!profile && ['upload-view', 'messages-view', 'profile-view'].includes(viewId)) {

        document.getElementById('auth-overlay')?.classList.remove('hidden');
        return;
      }
      navigateTo(viewId);
    });
  });

  // Sign-in prompt
  sidebar.querySelector('#sb-signin-prompt')?.addEventListener('click', () => {
    document.getElementById('auth-overlay')?.classList.remove('hidden');
  });

  // Logout
  sidebar.querySelector('#sb-logout-btn')?.addEventListener('click', onLogout);

  // Load trending tags
  loadTrendingTags();
}

async function loadTrendingTags() {
  const container = document.getElementById('sb-trending');
  if (!container) return;

  try {
    const snap = await getDocs(
      query(collection(db, 'posts'), orderBy('likeCount', 'desc'), limit(30))
    );

    const tagCounts = {};
    snap.forEach(d => {
      (d.data().tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const sorted = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (!sorted.length) {
      container.innerHTML = '<div style="padding:8px 10px;color:var(--text-4);font-size:0.78rem">No trending tags yet</div>';
      return;
    }

    container.innerHTML = sorted.map(([tag, count]) => `
      <div class="trending-item" data-tag="${tag}">
        <span class="trending-tag">#${tag}</span>
        <span class="trending-count">${count}</span>
      </div>`).join('');

    container.querySelectorAll('.trending-item').forEach(item => {
      item.addEventListener('click', () => {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          searchInput.value = item.dataset.tag;
          searchInput.dispatchEvent(new Event('input'));
        }
        import('../main.js').then(m => m.navigateTo('search-view'));
      });
    });

  } catch (err) {
    console.error('Trending tags error:', err);
    container.innerHTML = '';
  }
}
