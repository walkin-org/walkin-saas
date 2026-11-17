import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { Admin } from './Admin.jsx';
import { Catalog } from './Catalog.jsx';
import { pages } from './pages.js';
import { Brand, Shell } from './Shell.jsx';

function Login({ temporary, onLogin }) {
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (temporary) {
        await api('password','POST',values);
        onLogin(await api('me'));
      } else onLogin(await api('login','POST',values));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <main className="login"><section><h1>{temporary ? 'Set your password' : 'Sign in'}</h1>
    <form onSubmit={submit}>{!temporary && <label>Email address<input name="email" type="email" autoComplete="username" required autoFocus /></label>}
    <label>{temporary ? 'New password · 12 characters minimum' : 'Password'}<input name="password" type="password" autoComplete={temporary ? 'new-password' : 'current-password'} minLength={temporary ? 12 : 1} maxLength="256" required /></label>
    <button disabled={busy}>{busy ? (temporary ? 'Saving…' : 'Signing in…') : (temporary ? 'Save password' : 'Sign in')}</button><output role="status">{error}</output></form></section></main>;
}
function App({initialUser,destination}) {
  const [user,setUser] = useState(initialUser);
  const [issue,setIssue] = useState('');
  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener('session-ended',expired);
    return () => window.removeEventListener('session-ended',expired);
  },[]);
  const links = user && pages[user.role];
  const page = links && (links.find(item => item.path === destination) || links[0]);
  useEffect(() => {
    const path = user && !user.temporary ? page.path : '/';
    if (location.pathname !== path) history.replaceState(null,'',path);
    document.title = (path === '/' ? 'Sign in' : page.label) + ' · Walkin Studio';
  },[user,page]);
  async function logout() {
    try { await api('logout','POST',{}); setUser(null); setIssue(''); }
    catch (e) {setIssue(e.message);}
  }
  if (user && !user.temporary) return <Shell user={user} links={links} page={page} logout={logout}>
    {issue && <p role="alert">{issue}</p>}{user.role === 'admin' ? <Admin tab={page.label}/> : <Catalog mode={page.path === '/collector/new' ? 'create' : 'list'}/>}</Shell>;
  return <><header className="loginbar"><Brand/>{user && <button onClick={logout}>Sign out</button>}</header>
    <Login key={user?.email || 'login'} temporary={user?.temporary} onLogin={u => {setIssue('');setUser(u);}}/></>;
}
async function start() {
  const root = createRoot(document.getElementById('root'));
  const destination = location.pathname.replace(/\/$|\.html$/g,'');
  let user = null;
  try {
    user = await api('me');
  } catch (error) {
    if (error.status !== 401) {
      root.render(<main className="login"><section><h1>Unable to open page</h1><p role="alert">{error.message}</p>
        <button onClick={() => location.reload()}>Retry</button></section></main>);
      return;
    }
  }
  root.render(<App initialUser={user} destination={destination}/>);
}
start();
