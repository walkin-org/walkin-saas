import { useState } from 'react';

const paths = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  logs: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5',
  team: 'M3 20v-2a5 5 0 0 1 10 0v2 M8 4a3 3 0 1 0 .01 0 M16 5a3 3 0 0 1 0 6 M17 14a4 4 0 0 1 4 4v2',
  store: 'M4 10v10h16V10 M3 10l2-6h14l2 6z M9 20v-6h6v6',
  add: 'M4 4h16v16H4z M8 12h8 M12 8v8'
};
export function Brand() {
  return <strong className="brand"><span className="brandmark" aria-hidden="true">↗</span>walkin</strong>;
}
export function Shell({user,links,page,logout,children}) {
  const [open,setOpen] = useState(false);
  const role = user.role === 'admin' ? 'Superadmin' : 'Collector';
  return <div className="shell">
    <aside className={open ? 'sidebar open' : 'sidebar'} id="sidebar">
      <Brand/><nav aria-label="Main navigation">{links.map(link => <a key={link.path} href={link.path} aria-current={page.path === link.path ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[link.icon]}/></svg>{link.label}</a>)}</nav>
      <footer className="account"><small>{user.email}</small><button className="signout" onClick={logout}>Sign out</button></footer>
    </aside>
    <div className="workspace"><header className="topbar"><button className="menu" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)}>Menu</button>
      <div className="crumb">{role}</div></header>
      <main className="content">{children}</main></div>
  </div>;
}
