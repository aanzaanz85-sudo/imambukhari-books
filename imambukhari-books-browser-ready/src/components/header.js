export function renderHeader(profile) {
  const display = profile?.display_name || (profile?.role === 'kepsek' ? 'Kepala Sekolah' : 'Tata Usaha');
  const role = profile?.role === 'kepsek' ? 'Kepala Sekolah' : 'Tata Usaha';
  return `<header class="topbar"><div><p class="eyebrow">SD ISLAM IMAM BUKHARI</p><h1 id="page-title">Dashboard</h1></div><div class="user-area"><div class="user-avatar">${role === 'Kepala Sekolah' ? 'K' : 'T'}</div><div class="user-copy"><strong>${display}</strong><span>${role}</span></div><button class="button button-quiet" id="sign-out">Keluar</button></div></header>`;
}
