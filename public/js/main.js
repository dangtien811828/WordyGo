// ── Sidebar toggle ──
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
}

// Khôi phục trạng thái sidebar
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && localStorage.getItem('sidebar-collapsed') === 'true') {
    sidebar.classList.add('collapsed');
  }

  // Auto-dismiss alerts sau 5 giây
  document.querySelectorAll('.alert').forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transform = 'translateY(-8px)';
      setTimeout(() => alert.remove(), 300);
    }, 5000);
  });
});
