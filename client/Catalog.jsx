import { useEffect, useState } from 'react';
import { api } from './api.js';
import { ListLoading } from './Loading.jsx';
import { RoadFields } from './RoadFields.jsx';

async function encode(file) {
  if (!file.size) return '';
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image up to 5 MiB.');
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Unable to read this image.'));
    reader.readAsDataURL(file);
  });
}
export function Catalog({ all = false, mode = 'both' }) {
  const [rows,setRows] = useState(null);
  const [editing,setEditing] = useState(null);
  const [adding,setAdding] = useState(false);
  const [query,setQuery] = useState('');
  const [revision,reload] = useState(0);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [formVersion,setFormVersion] = useState(0);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState('');
  useEffect(() => {
    if (mode === 'create') return;
    let active = true;
    setLoading(true);
    setLoadError('');
    const timer = setTimeout(() => {
      api('storefronts?q='+encodeURIComponent(query)).then(data => { if (active) setRows(data); })
        .catch(e => { if (active) setLoadError(e.message); })
        .finally(() => { if (active) setLoading(false); });
    },150);
    return () => {active = false; clearTimeout(timer);};
  },[query,revision,mode]);
  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    try {
      const {roadId,side,offsetM,frontageM,photo,...details} = data;
      const payload = {...details,photo:await encode(photo),placement:roadId ? {roadId,side,offsetM:Number(offsetM),frontageM:Number(frontageM)} : null};
      if (editing) await api('storefronts/'+editing.id,'PUT',payload);
      else await api('storefronts','POST',payload);
      setFormVersion(n => n+1);
      form.reset(); setEditing(null); setAdding(false); setMessage('Storefront saved.'); reload(n => n+1);
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function archive(row) {
    if (!window.confirm('Archive '+row.name+' and remove it from the catalog?')) return;
    setBusy(true);
    try {
      await api('storefronts/'+row.id,'DELETE');
      if (editing?.id === row.id) setEditing(null);
      reload(n => n+1); setMessage('Storefront archived.');
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  const showForm = mode === 'create' || adding || editing;
  return <><div className="pagehead"><h1>{editing ? 'Edit storefront' : adding || mode === 'create' ? 'Record a storefront' : all ? 'Storefront catalog' : 'My storefronts'}</h1>
    {all && !showForm && <button onClick={() => {setAdding(true);setMessage('');}}>Add storefront</button>}</div>
    <div className="single">{showForm && <section>
    <form key={(editing?.id || 'new')+formVersion} onSubmit={save}>
    <label>Storefront name<input name="name" defaultValue={editing?.name} required maxLength="120"/></label>
    <RoadFields record={editing}/>
    <label>Nearby landmark <small>Optional</small><textarea name="landmark" defaultValue={editing?.landmark} maxLength="300"/></label>
    <label>{editing?.mime ? 'Replace façade photo' : 'Façade photo'} <small>JPEG or PNG · up to 5 MiB</small><input type="file" name="photo" accept="image/png,image/jpeg"/></label>
    <button disabled={busy}>{busy ? 'Saving…' : 'Save storefront'}</button>{(editing || adding) && <button className="quiet" disabled={busy} type="button" onClick={() => {setEditing(null);setAdding(false);setMessage('');}}>Cancel</button>}
    <output role="status">{message}</output></form></section>}
    {!showForm && <section><output role="status">{message}</output><input placeholder="Search storefronts" type="search" aria-label="Search storefronts" value={query} onChange={e => setQuery(e.target.value)} />
    {loadError && <p role="alert">{loadError} <button onClick={() => reload(n => n+1)}>Retry</button></p>}
    {loading && rows !== null && <p className="muted" role="status">Updating results…</p>}
    {rows === null ? (loading && <ListLoading label="Loading storefronts"/>) : rows.length ? rows.map(row => <article key={row.id}>
    {row.mime && <img alt={row.name} loading="lazy" src={'/api/storefronts/'+row.id+'/photo'}/>}<div className="record-info"><h3>{row.name}</h3><p>{row.market}</p>{row.landmark && <p>{row.landmark}</p>}{all && <small>{row.owner || 'Legacy record'}</small>}</div>
    <div className="actions"><button className="quiet" disabled={busy} onClick={() => {setEditing(row);setMessage('');}}>Edit</button><button className="quiet" disabled={busy} onClick={() => archive(row)}>Archive</button></div></article>) :
    !loading && !loadError && <p className="empty">{query ? 'No matching storefronts.' : 'No storefronts recorded yet.'}</p>}</section>}</div></>;
}
