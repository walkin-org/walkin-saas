import {useEffect,useState} from 'react';
import {api} from './api.js';

export function RoadFields({record}) {
  const [roads,setRoads] = useState([]);
  const [selected,select] = useState(record?.road_id || '');
  const [creating,setCreating] = useState(false);
  const [draft,setDraft] = useState({});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [attempt,retry] = useState(0);
  useEffect(() => {
    let active = true;
    api('roads').then(result => {if (active) {setRoads(result);setError('');}})
      .catch(e => {if (active) setError(e.message);});
    return () => {active=false;};
  },[attempt]);
  const road = roads.find(r => r.id===selected);
  async function create() {
    setBusy(true);
    try {
      const added = await api('roads','POST',{...draft,area_type:draft.area_type || 'business_market',length_m:Number(draft.length_m)});
      setRoads(previous => [...previous,added]);select(added.id);setCreating(false);setDraft({});setError('');
    } catch(e) {setError(e.message);}
    finally {setBusy(false);}
  }
  return <fieldset className="road-fields"><legend>Map placement</legend>
    <label>Market road<select name="roadId" value={selected} onChange={e => select(e.target.value)}>
      <option value="">Unmapped storefront</option>{selected && !road && <option value={selected}>Current road</option>}
      {roads.map(r => <option key={r.id} value={r.id}>{r.market} · {r.name}</option>)}</select></label>
    <button type="button" className="quiet" onClick={() => setCreating(!creating)}>{creating ? 'Close road setup' : 'Add a road'}</button>
    {creating && <div className="road-setup">
      <label>Area type<select value={draft.area_type || 'business_market'} onChange={e => setDraft({...draft,area_type:e.target.value})}>
        <option value="business_market">Business market</option><option value="shopping_area">Shopping area</option></select></label>
      {[['market','Market or shopping area'],['name','Road name'],['start_label','Start landmark'],['end_label','End landmark'],['length_m','Length (m)']].map(([key,label]) =>
        <label key={key}>{label}<input type={key==='length_m'?'number':'text'} value={draft[key] || ''} onChange={e => setDraft({...draft,[key]:e.target.value})}/></label>)}
      <button type="button" disabled={busy} onClick={create}>{busy?'Saving…':'Save road'}</button></div>}
    {error && <p role="alert">{error} <button type="button" onClick={() => retry(n=>n+1)}>Reload roads</button></p>}
    {selected ? <><input type="hidden" name="market" value={road?.market || record?.market || ''}/>
      {road && <p>{road.start_label} → {road.end_label} · {road.length_m} m</p>}
      <label>Side facing the end landmark<select name="side" defaultValue={record?.road_side || ''} required><option value="">Choose side</option><option value="left">Left</option><option value="right">Right</option></select></label>
      <label>Distance from start to first façade edge (m)<input name="offsetM" type="number" min="0" max={road?.length_m} step="any" defaultValue={record?.offset_m ?? ''} required/></label>
      <label>Façade width along road (m)<input name="frontageM" type="number" min="0.000001" max={road?.length_m} step="any" defaultValue={record?.frontage_m ?? ''} required/></label></> :
      <label>Market<input name="market" defaultValue={record?.market} required maxLength="120"/></label>}
  </fieldset>;
}
