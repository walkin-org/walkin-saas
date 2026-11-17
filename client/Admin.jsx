import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Catalog } from './Catalog.jsx';
import { DashboardLoading } from './Loading.jsx';

function Team({ users, refresh }) {
  const [inviting,setInviting] = useState(false);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  async function action(email, disabled) {
    setBusy(true); setMessage('');
    try {
      if (disabled === undefined) {
        await api('admin/collectors','POST',{email}); setMessage('Invitation sent to '+email+'.'); setInviting(false);
      } else {
        await api('admin/collectors/'+encodeURIComponent(email),'PATCH',{disabled}); setMessage('Access updated.');
      }
    } catch (e) {setMessage(e.message);}
    finally {setBusy(false); refresh();}
  }
  return <><div className="pagehead"><h1>Collectors</h1><button disabled={busy} aria-expanded={inviting} onClick={() => setInviting(!inviting)}>{inviting ? 'Cancel' : 'Invite collector'}</button></div>
  {inviting && <section className="single"><form onSubmit={e => {
    e.preventDefault(); action(new FormData(e.currentTarget).get('email'));
  }}><label>Email address<input autoFocus name="email" type="email" required /></label><button disabled={busy}>Send invitation</button></form></section>}
  <output role="status">{message}</output><section className="directory">{users.length === 0 && <p className="empty">No collectors yet.</p>}{users.map(u => {
    const expired = u.temporary && Date.parse(u.expires) <= Date.now();
    const status = u.disabled ? 'Disabled' : !u.temporary ? 'Active' : u.delivery === 'failed' ? 'Email failed' : expired ? 'Expired' : u.delivery === 'sent' ? 'Invited' : 'Sending';
    return <article key={u.email}><div className="record-info"><b>{u.email}</b><p>{status}</p></div><div className="actions">
      {!u.disabled && (expired || u.delivery === 'failed') ? <button disabled={busy} onClick={() => action(u.email)}>Retry invitation</button> : null}
      <button className="quiet" disabled={busy} onClick={() => action(u.email,!u.disabled)}>{u.disabled ? 'Enable access' : 'Disable access'}</button></div></article>;
  })}</section></>;
}
function RequestLog({logs}) {
  const [errors,setErrors] = useState(false);
  const visible = errors ? logs.filter(row => row.status >= 400) : logs;
  return <><div className="pagehead"><h1>Request log</h1><label className="filter"><input type="checkbox" checked={errors} onChange={e => setErrors(e.target.checked)}/> Errors only</label></div><section><div className="scroll"><table><thead><tr>{['Local time','Account','Request','Status','Duration'].map(t => <th key={t}>{t}</th>)}</tr></thead>
    <tbody>{visible.map((r,i) => <tr key={i}><td>{new Date(r.time).toLocaleString()}</td><td>{r.actor}</td><td><code>{r.method} /api{r.path}</code></td><td><span className={r.status >= 400 ? 'http-status attention' : 'http-status'}>{r.status}</span></td><td>{r.ms} ms</td></tr>)}</tbody></table>{!visible.length && <p className="empty">No matching requests.</p>}</div></section></>;
}
function LatencyChart({logs}) {
  const samples = logs.slice(0,40).reverse();
  if (!samples.length) return <p className="empty">Waiting for the first request.</p>;
  const peak = Math.max(1,...samples.map(r => r.ms));
  const points = samples.map((row,index) => ({
    x: samples.length === 1 ? 280 : 4 + index * 552 / (samples.length-1),
    y: 128 - 120 * row.ms / peak
  }));
  const line = points.map(({x,y}) => x+','+y).join(' ');
  const time = row => new Date(row.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  return <figure className="latency"><div className="axis"><span>{peak} ms</span><span>0 ms</span></div>
    <svg viewBox="0 0 560 136" preserveAspectRatio="none" role="img" aria-label={'Latency of the last '+samples.length+' requests, peak '+peak+' milliseconds'}>
      {[8,48,88,128].map(y => <line key={y} x1="0" x2="560" y1={y} y2={y} stroke="#e6e6e2" strokeDasharray="3 4"/>)}
      {points.length > 1 && <><polygon points={'4,128 '+line+' 556,128'} fill="#fff4cb"/><polyline points={line} fill="none" stroke="#c38c00" strokeWidth="2" vectorEffect="non-scaling-stroke"/></>}
      {points.map(({x,y},i) => <circle key={i} cx={x} cy={y} r={points.length < 10 ? 3 : 1.6} fill="#976c00"><title>{time(samples[i])+' · '+samples[i].ms+' ms'}</title></circle>)}
    </svg><figcaption><span>{time(samples[0])}</span><span>{time(samples.at(-1))}</span></figcaption></figure>;
}
function Overview({data,stamp,refresh,loading}) {
  const metrics = [['API requests',data.total,''],['Mean response',data.meanMs,'ms'],['95th percentile',data.p95Ms,'ms'],['Server errors',data.failures,'']];
  const runtime = [['Database',data.database+' · '+data.dbMs+' ms'],['CPU usage',data.cpuPercent+'%'],['Process memory',data.memoryMiB+' MiB'],['Uptime',Math.floor(data.uptime/3600)+'h '+Math.floor(data.uptime%3600/60)+'m']];
  const config = [['Node.js',data.node],['Photo storage',data.media],['Email',data.mailConfigured ? 'Configured' : 'Incomplete']];
  return <><div className="pagehead"><div><h1>Backend overview</h1><p className="muted">Updated {stamp}</p></div><button disabled={loading} className="secondary" onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <div className="metrics">{metrics.map(([name,value,unit]) => <div key={name}><small>{name}</small><strong>{value.toLocaleString()} {unit && <em>{unit}</em>}</strong></div>)}</div>
    <div className="overview-grid"><section className="panel"><div className="heading"><h2>Request latency</h2><a className="textlink" href="/admin/logs">View log ↗</a></div>
      <LatencyChart logs={data.logs}/></section>
      <section className="panel"><h2>Runtime</h2><dl>{runtime.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <details className="configuration"><summary>Configuration</summary><dl>{config.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details></section></div></>;
}
export function Admin({tab}) {
  const [data,setData] = useState(null);
  const [error,setError] = useState('');
  const [stamp,setStamp] = useState('');
  const [revision,setRevision] = useState(0);
  const [loading,setLoading] = useState(true);
  const refresh = () => setRevision(n => n+1);
  useEffect(() => {
    if (tab === 'Storefront catalog') return;
    let active = true;
    setLoading(true);
    setError('');
    const endpoint = tab === 'Collectors' ? 'collectors' : tab === 'Request log' ? 'logs' : 'overview';
    api('admin/'+endpoint).then(result => {
      if (active) {setData(result);setStamp(new Date().toLocaleTimeString());setError('');}
    }).catch(e => {if (active) setError(e.message);}).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  },[revision,tab]);
  useEffect(() => {
    const timer = setInterval(() => {if (!document.hidden) refresh();},30000);
    return () => clearInterval(timer);
  },[]);
  if (tab === 'Storefront catalog') return <Catalog all/>;
  return <>{error && <p role="alert">{error} <button onClick={refresh}>Retry</button></p>}
    {!data ? (error ? null : <DashboardLoading page={tab}/>) : tab === 'Collectors' ? <Team users={data} refresh={refresh}/> : tab === 'Request log' ? <RequestLog logs={data}/> : <Overview data={data} stamp={stamp} refresh={refresh} loading={loading}/>}</>;
}
